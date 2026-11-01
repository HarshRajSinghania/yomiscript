// The commercial TTS services, from the original text (no YomiScript): shared by refs.mjs (the prosody references)
// and eval/tts_readings (how often each one misreads). API keys from the environment (OPENAI_API_KEY,
// GEMINI_API_KEY, ELEVENLABS_API_KEY) or from a KEY=value file (default: the repository's .env, which git ignores).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENV_FILE = path.join(HERE, "../../.env");

export function readEnv(f) {
  const out = {};
  for (const raw of fs.readFileSync(f, "utf8").split("\n")) {
    const line = raw.trim().replace(/^export /, ""),
      i = line.indexOf("=");
    if (i <= 0 || line.startsWith("#")) continue;
    let v = line.slice(i + 1).trim();
    if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v.endsWith(v[0])) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}
export function wavFromPcm(pcm, sr) {
  // 16-bit mono WAV around raw little-endian PCM
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
async function ok(r) {
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}

/** name -> { key: the API key variable, model: the default model, speak(text, key, model) -> WAV bytes } */
export const SERVICES = {
  openai: {
    key: "OPENAI_API_KEY",
    model: "gpt-4o-mini-tts",
    async speak(text, k, model = this.model) {
      const r = await ok(
        await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, voice: "coral", input: text, response_format: "wav" }),
        }),
      );
      return Buffer.from(await r.arrayBuffer());
    },
  },
  gemini: {
    key: "GEMINI_API_KEY",
    model: "gemini-3.8-flash-tts",
    async speak(text, k, model = this.model) {
      const r = await ok(
        await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": k, "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text }] }],
            generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
          }),
        }),
      );
      const d = (await r.json()).candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!d) throw new Error("no audio in the response");
      const b = Buffer.from(d.data, "base64");
      const sr = Number(d.mimeType.match(/rate=(\d+)/)?.[1] ?? 24000);
      return d.mimeType.startsWith("audio/wav") ? b : wavFromPcm(b, sr);
    },
  },
  elevenlabs: {
    key: "ELEVENLABS_API_KEY",
    model: "eleven_multilingual_v2",
    async speak(text, k, model = this.model) {
      const voice = "21m00Tcm4TlvDq8ikWAM"; // Rachel, a premade multilingual voice
      const r = await ok(
        await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=pcm_24000`, {
          method: "POST",
          headers: { "xi-api-key": k, "Content-Type": "application/json" },
          body: JSON.stringify({ text, model_id: model, language_code: "ja" }),
        }),
      );
      return wavFromPcm(Buffer.from(await r.arrayBuffer()), 24000);
    },
  },
};
