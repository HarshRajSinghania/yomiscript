// Data for web/misread.html: the hard-set sentences (eval/data/hard_set.tsv) that the original Kokoro front end
// misreads and the LLM Yomite reads right (eval/browser_tts results). For each, the original Kokoro's audio
// (web/misread/<name>.wav: its own front end's phonemes, original punctuation, its own pitch, fp32) and the LLM's
// YomiScript with the dictionary accent added as the tools add it (@yomiscript/ja-accent), which the page speaks.
// usage: node misread.mjs [llm]   (llm: codex (default) or claude; after eval/browser_tts refs.py, run.mjs, score.mjs)
import fs from "fs";
import path from "path";
import { accentYomite } from "@yomiscript/ja-accent";
import { nodeAnalyzer } from "@yomiscript/ja-accent/node";
import { engine, K, WEB } from "./node.mjs";
import { HERE as BT, SETS } from "../../eval/browser_tts/sets.mjs";

const llm = process.argv[2] ?? "codex";
const read = (f) => JSON.parse(fs.readFileSync(path.join(BT, f), "utf8"));
const REFS = read("refs.json").hard,
  ITEMS = read("results/items.json").hard,
  OUT = read(`results/${llm}.hard.json`).output;
const ok = (sys) => ITEMS[Object.keys(ITEMS).find((k) => k.startsWith(sys))].map((x) => x.ok);
const [origOk, llmOk] = [ok("original"), ok(llm)];
const NOTES = Object.fromEntries(
  fs
    .readFileSync(path.join(BT, "../data/hard_set.tsv"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("\t"))
    // the notes that say which word is read how (市=いち), without the reviewers' remarks
    .map(([name, , , , note]) => [
      name,
      (note ?? "")
        .split(/[。、]/)
        .filter((x) => x.includes("="))
        .map((x) => x.replace(/優先$/, ""))
        .join("、"),
    ]),
);

const base = path.join(process.env.HOME, ".cache/yomiscript/ja-dict");
const accent = accentYomite(await nodeAnalyzer({ dir: path.join(base, fs.readdirSync(base)[0]) }));
const E = await engine("fp32");
const gap = new Float32Array(K.SR * 0.2);

async function original(utterances, ps) {
  // the original pipeline's audio: each chunk as the original gets it, joined with a short silence
  const parts = [];
  for (const [i, ys] of utterances.entries()) {
    const P = K.plan(ys, { original: true });
    if (P.length !== 1 || P[0].ps !== ps[i]) throw new Error(`not the original's phonemes: ${ys}`);
    parts.push((await E.synthSection(P[0], "engine")).audio, gap);
  }
  const a = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((o, p) => (a.set(p, o), o + p.length), 0);
  return a;
}

const dir = path.join(WEB, "misread");
fs.mkdirSync(dir, { recursive: true });
const out = [];
for (const [i, x] of SETS.hard.entries()) {
  if (origOk[i] || !llmOk[i] || !OUT[x.name]) continue;
  const ref = REFS.find((r) => r.name === x.name);
  fs.writeFileSync(path.join(dir, `${x.name}.wav`), Buffer.from(K.wav(await original(ref.ys, ref.ps))));
  out.push({ name: x.name, category: x.category, text: x.text, gold: x.gold, note: NOTES[x.name], ys: OUT[x.name], spoken: accent(OUT[x.name]) });
}
fs.writeFileSync(path.join(WEB, "misread.json"), JSON.stringify({ llm: read(`results/${llm}.hard.json`).model, items: out }, null, 1) + "\n");
console.log(`${out.length} sentences -> web/misread.json, web/misread/*.wav`);
