// Reference speech for the prosody score: the same Japanese texts read by commercial TTS services, from the original
// text (no YomiScript). Cached: a file already there is not requested again.
// usage: node refs.mjs [--env FILE] [--jsut N] [service …]   -> audio/ref/<service>/<set>.<name>.wav
//   --jsut N: also the first N JSUT sentences (items.mjs), for the accent extractor
//   API keys from the environment (OPENAI_API_KEY, GEMINI_API_KEY, ELEVENLABS_API_KEY), or from FILE (KEY=value
//   lines; default: the repository's .env, which .gitignore keeps out of git). A service without a key is skipped.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { items, jsut } from "./items.mjs";
import { ENV_FILE, readEnv, SERVICES } from "./services.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const envAt = args.indexOf("--env");
const envFile = envAt >= 0 ? args.splice(envAt, 2)[1] : ENV_FILE;
const jsutAt = args.indexOf("--jsut");
const texts = [...items(), ...(jsutAt >= 0 ? jsut(Number(args.splice(jsutAt, 2)[1])) : [])];
const fileEnv = fs.existsSync(envFile) ? readEnv(envFile) : {};
const key = (k) => process.env[k] || fileEnv[k];

const PARALLEL = 4;
const want = args.length ? args : Object.keys(SERVICES);
for (const name of want) {
  const s = SERVICES[name],
    k = s && key(s.key);
  if (!s) throw new Error(`unknown service ${name}`);
  if (!k) {
    console.log(`- ${name}: no ${s.key}, skipped`);
    continue;
  }
  const dir = path.join(HERE, "audio", "ref", name);
  fs.mkdirSync(dir, { recursive: true });
  let made = 0;
  const todo = texts.filter((it) => !fs.existsSync(path.join(dir, `${it.set}.${it.name}.wav`)));
  const worker = async () => {
    for (let it = todo.shift(); it; it = todo.shift()) {
      try {
        fs.writeFileSync(path.join(dir, `${it.set}.${it.name}.wav`), await s.speak(it.text, k));
        made++;
      } catch (e) {
        console.log(`  ${name} ${it.set}.${it.name}: ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker)); // a few requests at a time
  console.log(`${name}: ${made} new`);
}
