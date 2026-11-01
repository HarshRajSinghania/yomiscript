// The hard set (eval/data/hard_set.tsv) read by each system, several runs each, for scoring the readings (score.py).
//   commercial TTS from the original text (../prosody_ref/services.mjs), runs r1..rN
//   ours: the LLM's YomiScript (eval/browser_tts results) through the tools' pipeline (the dictionary accent, then
//   Kokoro fp32), and the original Kokoro (its own front end, original punctuation and pitch); one run each, since
//   the same YomiScript gives the same reading
// usage: node speak.mjs [runs] [system …]   -> audio/<system>/r<k>/hard.<name>.wav (a file already there is kept)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { accentYomite } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";
import { engine, K, originalAudio } from "../../demo/ys_web/node.mjs";
import { SETS } from "../browser_tts/sets.mjs";
import { ENV_FILE, readEnv, SERVICES } from "../prosody_ref/services.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BT = path.join(HERE, "../browser_tts");
const ITEMS = SETS.hard;

/** system -> [service, model]: the newest TTS model of each service (2026-10-31), and ElevenLabs' previous one */
export const COMMERCIAL = {
  "openai.gpt-4o-mini-tts-2025-12-15": ["openai", "gpt-4o-mini-tts-2025-12-15"],
  "gemini.gemini-3.8-flash-tts": ["gemini", "gemini-3.8-flash-tts"],
  "elevenlabs.eleven_v3": ["elevenlabs", "eleven_v3"],
  "elevenlabs.eleven_multilingual_v2": ["elevenlabs", "eleven_multilingual_v2"],
};
const OURS = ["kokoro.original", "claude+kokoro", "codex+kokoro"];
/** requests at a time per service (ElevenLabs: the subscription's concurrency limit) */
const PARALLEL = { openai: 4, gemini: 4, elevenlabs: 3 };

const [runsArg, ...only] = process.argv.slice(2);
const RUNS = Number(runsArg ?? 3);
const want = (s) => !only.length || only.includes(s);
const fileEnv = fs.existsSync(ENV_FILE) ? readEnv(ENV_FILE) : {};
const out = (system, run, name) => path.join(HERE, "audio", system, `r${run}`, `hard.${name}.wav`);

async function retry(f, tries = 5) {
  // a rate-limited request (HTTP 429) is tried again after a pause that doubles
  for (let i = 0; ; i++) {
    try {
      return await f();
    } catch (e) {
      if (i + 1 >= tries || !/HTTP 429/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
    }
  }
}
async function commercial(system, [service, model]) {
  const s = SERVICES[service],
    key = process.env[s.key] || fileEnv[s.key];
  if (!key) return console.log(`- ${system}: no ${s.key}, skipped`);
  const todo = [];
  for (let r = 1; r <= RUNS; r++) for (const x of ITEMS) if (!fs.existsSync(out(system, r, x.name))) todo.push([r, x]);
  let made = 0;
  const worker = async () => {
    for (let t = todo.shift(); t; t = todo.shift()) {
      const [r, x] = t,
        f = out(system, r, x.name);
      try {
        const wav = await retry(() => s.speak(x.text, key, model));
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, wav);
        made++;
      } catch (e) {
        console.log(`  ${system} r${r} ${x.name}: ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL[service] }, worker));
  console.log(`${system}: ${made} new`);
}

async function ours() {
  const refs = JSON.parse(fs.readFileSync(path.join(BT, "refs.json"), "utf8")).hard;
  const llm = (name) => JSON.parse(fs.readFileSync(path.join(BT, "results", `${name}.hard.json`), "utf8")).output;
  const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict");
  const accent = accentYomite(await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) }));
  const E = await engine("fp32");
  const speak = {
    "kokoro.original": (x) => {
      const r = refs.find((y) => y.name === x.name);
      return originalAudio(E, r.ys, r.ps);
    },
    "claude+kokoro": async (x) => (await E.synth(accent(llm("claude")[x.name]))).audio,
    "codex+kokoro": async (x) => (await E.synth(accent(llm("codex")[x.name]))).audio,
  };
  for (const system of OURS.filter(want)) {
    let made = 0;
    for (const x of ITEMS) {
      const f = out(system, 1, x.name);
      if (fs.existsSync(f)) continue;
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, Buffer.from(K.wav(await speak[system](x))));
      made++;
    }
    console.log(`${system}: ${made} new`);
  }
}

// the services in parallel, the models of one service one after another
const byService = Object.groupBy(
  Object.entries(COMMERCIAL).filter(([s]) => want(s)),
  ([, [service]]) => service,
);
await Promise.all(
  Object.values(byService).map(async (systems) => {
    for (const [s, m] of systems) await commercial(s, m);
  }),
);
if (OURS.some(want)) await ours();
