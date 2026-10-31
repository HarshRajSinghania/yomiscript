// The Kokoro ONNX engine (split export: enc / f0n / dec). It takes the onnxruntime module and a byte loader, so the
// same code runs on onnxruntime-web (browser, w16) and onnxruntime-node (CLI, MCP, fp32).
import type { InferenceSession, Tensor } from "onnxruntime-common";
import { plan, type Plan, type PlannedSection } from "./plan.ts";
import { f0Override, join } from "./render.ts";
import { f0Japanese } from "./render_ja.ts";
import { isJa, type LoadBytes } from "@yomiscript/core";
export type { LoadBytes };

/** the parts of onnxruntime this engine uses (onnxruntime-web and onnxruntime-node both have them) */
export interface Ort {
  InferenceSession: { create(model: Uint8Array | ArrayBuffer, options?: InferenceSession.SessionOptions): Promise<InferenceSession> };
  Tensor: new (type: "float32" | "int64", data: Float32Array | BigInt64Array, dims: readonly number[]) => Tensor;
}
export interface EngineOptions {
  /** model file suffix per part: {} = fp32 (identical to the original Kokoro), W16 = fp16 weights */
  suffix?: Partial<Record<"enc" | "f0n" | "dec", string>>;
  executionProviders?: string[];
}
export const FP32 = {},
  W16 = { enc: "_w16", f0n: "_w16", dec: "_w16" };
/** pitch: "values" renders the YomiScript's <f0:…> values; "engine" keeps Kokoro's own F0 (the original's audio) */
export type PitchMode = "values" | "engine";
export interface Prediction {
  ref: Tensor;
  dur: number[];
  t_en: Tensor;
  f0: Float32Array;
  N: Tensor;
}
export interface Synthesis {
  audio: Float32Array;
  plan: Plan;
}

export class Engine {
  private V: Record<string, Float32Array> = {};
  private enc!: InferenceSession;
  private f0n!: InferenceSession;
  private dec!: InferenceSession;
  private ort: Ort;
  private load: LoadBytes;
  constructor(ort: Ort, load: LoadBytes) {
    this.ort = ort;
    this.load = load;
  }
  async init(opts: EngineOptions = {}): Promise<this> {
    const sf = opts.suffix ?? {},
      executionProviders = opts.executionProviders ?? ["wasm"];
    const mk = async (n: "enc" | "f0n" | "dec") => this.ort.InferenceSession.create(await this.load(`models/${n}${sf[n] ?? ""}.onnx`), { executionProviders });
    [this.enc, this.f0n, this.dec] = [await mk("enc"), await mk("f0n"), await mk("dec")];
    return this;
  }
  async voice(name: string): Promise<Float32Array> {
    if (this.V[name]) return this.V[name];
    const m = name.match(/^([^+]+)\+([^@]+)@([\d.]+)$/); // a blend: a+b@weight
    let v: Float32Array;
    if (m) {
      const a = await this.voice(m[1]),
        b = await this.voice(m[2]),
        w = +m[3];
      v = a.map((x, i) => x * (1 - w) + b[i] * w);
    } else {
      const bytes = await this.load(`voices/${name}.bin`);
      v =
        bytes instanceof ArrayBuffer
          ? new Float32Array(bytes)
          : new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    }
    this.V[name] = v;
    return v;
  }
  // Kokoro's own prosody prediction (durations, F0, energy) for one planned section; also used by the Yomite (prosody.ts)
  async predict(sec: PlannedSection): Promise<Prediction> {
    const T = this.ort.Tensor;
    const L = sec.ids.length;
    const V = await this.voice(sec.voice);
    const k = (sec.ps ?? "x".repeat(L - 1)).length - 1; // voice-pack entry as in KPipeline: pack[len(ps)-1]
    const ref = new T("float32", V.slice(k * 256, (k + 1) * 256), [1, 256]);
    const r1 = await this.enc.run({ ids: new T("int64", BigInt64Array.from(sec.ids.map(BigInt)), [1, L]), ref });
    const dur = Array.from(r1.dur.data as ArrayLike<number | bigint>, Number);
    const Tn = dur.reduce((a, b) => a + b, 0);
    const expand = (t: Tensor): Tensor => {
      const C = t.dims[1],
        src = t.data as Float32Array,
        out = new Float32Array(C * Tn);
      for (let c = 0; c < C; c++) {
        let q = c * Tn;
        for (let l = 0; l < L; l++) {
          const v = src[c * L + l];
          for (let r = 0; r < dur[l]; r++) out[q++] = v;
        }
      }
      return new T("float32", out, [1, C, Tn]);
    };
    const r2 = await this.f0n.run({ en: expand(r1.d), ref });
    return { ref, dur, t_en: expand(r1.t_en), f0: r2.F0.data as Float32Array, N: r2.N };
  }
  async synthSection(sec: PlannedSection, pitch: PitchMode = "values"): Promise<{ audio: Float32Array; f0: Float32Array; f0new: Float32Array; dur: number[] }> {
    const T = this.ort.Tensor;
    const { ref, dur, t_en, f0, N } = await this.predict(sec);
    const F = pitch === "engine" ? Float32Array.from(f0) : this.pitch(sec, f0, dur);
    const r3 = await this.dec.run({ asr: t_en, F0: new T("float32", F, [1, F.length]), N, ref });
    return { audio: Float32Array.from(r3.audio.data as Float32Array), f0: Float32Array.from(f0), f0new: F, dur };
  }
  /** the F0 the decoder gets: the YomiScript's values put into the engine's own (Japanese: render_ja.ts, D28) */
  private pitch(sec: PlannedSection, f0: Float32Array, dur: number[]): Float32Array {
    if (!isJa(sec.lang)) return f0Override(f0, sec.uid, dur, sec.U);
    return f0Japanese(
      f0,
      sec.uid,
      dur,
      sec.U,
      sec.toks.map((t) => t.kind === "unit"),
    );
  }
  async synth(ys: string, pitch: PitchMode = "values"): Promise<Synthesis> {
    const P = plan(ys);
    const outs: Float32Array[] = [];
    for (const s of P) outs.push((await this.synthSection(s, pitch)).audio);
    // one section: the model's audio as is (like the original); several language sections: joined
    return { audio: outs.length === 1 ? outs[0] : join(outs), plan: P };
  }
}
