// The Kokoro Katarite in Node for the eval scripts: the @yomiscript/kokoro package (built: yarn build) with
// onnxruntime-web, as in the browser (the parity results in eval/kokoro_parity were measured this way), reading the
// demo's models and voices (see README.md for how they get there). The CLI and MCP server use onnxruntime-node instead.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as ort from "onnxruntime-web";
import * as K from "@yomiscript/kokoro";

export const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "web");
export { K, ort };
// model variants: fp32 (identical to the original Kokoro) and w16 (fp16 weights, the demo's default)
export const MODELS = { fp32: K.FP32, w16: K.W16 };

async function loadBytes(p) {
  return new Uint8Array(fs.readFileSync(path.join(WEB, p)));
}
export async function engine(model = "w16") {
  ort.env.wasm.numThreads = 1;
  return new K.Engine(ort, loadBytes).init({ suffix: MODELS[model] });
}

const gap = new Float32Array(K.SR * 0.2);

/** the original Kokoro pipeline's audio for the original front end's YomiScript (eval/browser_tts refs.json): each chunk
 * as the original gets it (D22), with Kokoro's own pitch, joined with a short silence; ps: the original's phonemes */
export async function originalAudio(E, utterances, ps) {
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
