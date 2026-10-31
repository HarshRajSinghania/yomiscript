// Japanese pitch rendering (D28): each mora's values are points spread over its voiced frames (one value: held over
// them), joined by straight lines and smoothed, and the section is moved as a whole to the level of the engine's own
// F0 (the values keep their own phrase levels, declination and downstep). A mora without values breaks the line;
// its frames, and every unvoiced frame, keep the engine's F0.
import type { PlanUnit } from "./plan.ts";

interface Point {
  x: number;
  v: number;
  /** points of the same run (morae with values, one after another) are joined */
  run: number;
}
function charFrames(dur: number[]): [number, number][] {
  // the F0 frames of each id (2 frames per duration step)
  const out: [number, number][] = [];
  let t = 0;
  for (const d of dur) {
    out.push([t, t + d * 2]);
    t += d * 2;
  }
  return out;
}
function voicedSpan(f0: ArrayLike<number>, a: number, b: number): [number, number] {
  // the voiced frames of [a, b), or all of it when none is (a final mora's duration also covers the silence after it)
  let va = -1,
    vb = -1;
  for (let i = a; i < Math.min(b, f0.length); i++)
    if (f0[i] > 60) {
      if (va < 0) va = i;
      vb = i + 1;
    }
  return va < 0 ? [a, b] : [va, vb];
}
function points(f0: ArrayLike<number>, uid: number[], dur: number[], U: PlanUnit[], isMora: boolean[]): Point[] {
  const fr = charFrames(dur),
    P: Point[] = [];
  let run = 0;
  U.forEach(([, c], k) => {
    if (!c) {
      if (isMora[k]) run++;
      return;
    }
    const idx = uid.flatMap((u, l) => (u === k ? [l] : []));
    if (!idx.length) return;
    const [a, b] = voicedSpan(f0, fr[idx[0]][0], fr[idx[idx.length - 1]][1]),
      vs = c.length === 1 ? [c[0], c[0]] : c;
    vs.forEach((v, j) => P.push({ x: Math.min(f0.length - 1, a + 0.5 + ((b - a - 1) * j) / (vs.length - 1)), v, run }));
  });
  return P;
}
function targets(P: Point[], n: number, shift: number): Float64Array {
  // straight lines between the points of a run, the first / last value held before / after them; NaN between runs
  const tgt = new Float64Array(n).fill(NaN);
  let q = 0;
  for (let i = 0; i < n; i++) {
    while (q < P.length - 2 && P[q + 1].x < i) q++;
    const [p, r] = [P[q], P[q + 1] ?? P[q]];
    if (i <= P[0].x) tgt[i] = P[0].v;
    else if (i >= P[P.length - 1].x) tgt[i] = P[P.length - 1].v;
    else if (p.run === r.run) tgt[i] = p.v + ((r.v - p.v) * (i - p.x)) / Math.max(r.x - p.x, 1e-6);
    tgt[i] += shift;
  }
  return tgt;
}
function smoothed(tgt: Float64Array, smooth: number): Float64Array {
  // a triangular window of `smooth` frames over the frames that have a target
  const n = tgt.length,
    h = smooth >> 1,
    out = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (isNaN(tgt[i])) continue;
    let s = 0,
      w = 0;
    for (let j = -h; j <= h; j++) {
      const v = tgt[Math.min(n - 1, Math.max(0, i + j))];
      if (!isNaN(v)) [s, w] = [s + (h + 1 - Math.abs(j)) * v, w + h + 1 - Math.abs(j)];
    }
    out[i] = s / w;
  }
  return out;
}
/** the engine's F0 with the Japanese section's values put in (isMora: which units are morae) */
export function f0Japanese(f0: ArrayLike<number>, uid: number[], dur: number[], U: PlanUnit[], isMora: boolean[], smooth = 7): Float32Array {
  const P = points(f0, uid, dur, U, isMora);
  if (!P.length) return Float32Array.from(f0);
  // the level: the engine's mean at the voiced points against the values' mean
  const at = P.filter((p) => f0[Math.round(p.x)] > 60),
    st = (v: number): number => Math.log2(Math.max(v, 1)) * 12,
    mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / Math.max(a.length, 1);
  const shift = mean(at.map((p) => st(f0[Math.round(p.x)]))) - mean(P.map((p) => p.v));
  const sm = smoothed(targets(P, f0.length, shift), smooth);
  return Float32Array.from(f0, (v, i) => (v > 60 && !isNaN(sm[i]) ? 2 ** (sm[i] / 12) : v));
}
