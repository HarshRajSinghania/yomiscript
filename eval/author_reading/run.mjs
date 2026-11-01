// Does it matter that the author of a text writes its reading? For each chat scenario (scenarios.tsv) an LLM answers
// the user in one short sentence and writes its answer as YomiScript in the same call (the author, as a speak tool
// is used); then each LLM writes YomiScript for that answer in a call of its own, given only the answer (reader,
// text) or the user's message too (reader, context). All get the instructions the tools give (YOMISCRIPT_INSTRUCTIONS).
// usage: node run.mjs [run]   -> results/r<run>/author/<llm>/<id>.json, results/r<run>/reader/<author>/<reader>.<text|context>/<id>.json
// A result already there is kept, so a run that stopped continues where it was.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { YOMISCRIPT_INSTRUCTIONS } from "@yomiscript/core";
import { callAsync, json } from "../llm_yomite/llm.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LLMS = ["claude", "codex", "agy"];
const PARALLEL = 3; // calls at a time per LLM
const RUN = path.join(HERE, "results", `r${process.argv[2] ?? 1}`);

export function scenarios() {
  return fs
    .readFileSync(path.join(HERE, "scenarios.tsv"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [id, word, right, wrong, question] = l.split("\t");
      return { id, word, right: right.split("|"), wrong: wrong.split("|"), user: `${question}「${word}」という言葉を使って、一言で答えて。` };
    });
}

const author = (s) => `You are the voice of a chat assistant: what you answer is spoken aloud by a speech synthesizer. Do not use any tools.

The user wrote:
${s.user}

Answer the user in Japanese, in one short sentence, and write your answer as YomiScript so that it is spoken as you mean it.

${YOMISCRIPT_INSTRUCTIONS}

Return only a JSON object: {"text": "<your answer>", "ys": "<your answer as YomiScript>"}`;

const reader = (
  s,
  text,
  context,
) => `A chat assistant's answer is about to be spoken aloud by a speech synthesizer. Write the answer as YomiScript. Do not use any tools.
${context ? `\nThe user wrote:\n${s.user}\n\nThe assistant answered:\n${text}\n` : `\nThe answer:\n${text}\n`}
${YOMISCRIPT_INSTRUCTIONS}

Return only a JSON object: {"ys": "<the answer as YomiScript>"}`;

async function ask(llm, prompt, file) {
  // one call, saved with the model and the answer; a missing JSON is tried once more
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  let r, out;
  for (let i = 0; i < 2 && !out; i++) {
    r = await callAsync(llm, prompt);
    out = json(r.text);
  }
  const rec = { llm, model: r.model, seconds: r.seconds, output: out, ...(out ? {} : { raw: r.text, stderr: r.stderr }) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rec, null, 1));
  return rec;
}

async function pool(jobs) {
  // jobs: [llm, () => Promise]; PARALLEL at a time for each LLM
  const queues = Object.groupBy(jobs, ([llm]) => llm);
  await Promise.all(
    Object.values(queues).flatMap((q) =>
      Array.from({ length: PARALLEL }, async () => {
        for (let j = q.shift(); j; j = q.shift()) await j[1]();
      }),
    ),
  );
}

const S = scenarios();
let done = 0;
const tick = () => ++done % 25 || console.log(`${done} calls`);
// the authors
await pool(LLMS.flatMap((a) => S.map((s) => [a, () => ask(a, author(s), path.join(RUN, "author", a, `${s.id}.json`)).then(tick)])));
// the readers, of every author's answer
const jobs = [];
for (const a of LLMS)
  for (const s of S) {
    const text = JSON.parse(fs.readFileSync(path.join(RUN, "author", a, `${s.id}.json`), "utf8")).output?.text;
    if (!text) continue;
    for (const r of LLMS)
      for (const ctx of [false, true])
        jobs.push([r, () => ask(r, reader(s, text, ctx), path.join(RUN, "reader", a, `${r}.${ctx ? "context" : "text"}`, `${s.id}.json`)).then(tick)]);
  }
await pool(jobs);
console.log(`done: ${done} calls`);
