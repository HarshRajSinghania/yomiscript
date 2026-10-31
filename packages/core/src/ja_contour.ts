// Japanese pitch from the accent marks (D28): three values for each mora (the start, middle and end of its voiced
// part), from a linear model over where the mora stands: H or L in its accent phrase and where the nucleus is, the
// accented phrases before it in its breath group (downstep), its place in the breath group and in the sentence, and a
// pause or a question after it. The values of a sentence are centred on their median: they are relative to the
// speaker's register.
import type { Section, Token } from "./yomiscript.ts";

/** feature -> [weight, extra weight at the start, the middle, the end of the mora] */
const W: Record<string, [number, number, number, number]> = {
  H: [0.9219, -0.5002, 0.4064, 1.0156],
  bg_i: [-0.0851, -0.0321, -0.0384, -0.0146],
  bgx: [-3.2933, -0.3289, -1.0352, -1.9292],
  down: [-0.0873, -0.1906, -0.0308, 0.1342],
  down_H: [-0.2366, 0.0483, -0.0717, -0.2132],
  final: [-0.9253, -1.5289, -0.3713, 0.9749],
  final2: [-1.9387, -0.6774, -0.6888, -0.5725],
  first_L: [-2.1258, -1.1117, -0.7643, -0.2498],
  first_phrase: [-0.7057, -0.1564, -0.2177, -0.3316],
  flat: [-0.5084, -0.0904, -0.1858, -0.2322],
  hpos: [0.3601, 0.275, 0.14, -0.0549],
  last_bg: [0.0303, 0.0872, 0.0033, -0.0602],
  lpos: [-0.3129, -0.4172, -0.0672, 0.1716],
  nucm: [0.3607, -0.1325, 0.0419, 0.4513],
  phrase_last: [-1.2854, -0.0703, -0.6148, -0.6003],
  post: [-0.2345, 0.8943, -0.1271, -1.0017],
  post1: [1.4385, 0.963, 0.5963, -0.1208],
  prepause: [-0.4391, -0.7405, -0.2558, 0.5571],
  q: [1.331, -0.2031, -0.0198, 1.5539],
  q2: [1.3879, 0.5619, 0.3234, 0.5026],
  size: [-0.0243, -0.0236, -0.0214, 0.0208],
  sx: [-1.276, -0.3826, -0.5614, -0.332],
};
const POINT = [0.2453, 0.1113, -0.3566];

interface Phrase {
  morae: Token[];
  /** a pause (‖, or an inner ↗) before it: it starts a breath group */
  pause: boolean;
}
interface Sentence {
  phrases: Phrase[];
  /** the morae (index in the sentence) that end a question */
  qs: Set<number>;
}
const size = (s: Sentence): number => s.phrases.reduce((n, p) => n + p.morae.length, 0);

function sentences(sec: Section): Sentence[] {
  // the morae by sentence (an inner ↘ ends one) and accent phrase; ↗ ends a question and, inside, a breath group
  const out: Sentence[] = [{ phrases: [], qs: new Set() }];
  let pause = false,
    chunk = -1;
  for (const t of sec.toks) {
    const cur = out[out.length - 1];
    if (t.kind === "unit") {
      if (t.chunk !== chunk || !cur.phrases.length) cur.phrases.push({ morae: [], pause });
      cur.phrases[cur.phrases.length - 1].morae.push(t);
      chunk = t.chunk ?? 0;
      pause = false;
    } else if (t.kind === "pause") pause = true;
    else if (t.kind === "punct" && t.sent && t.sym === "?") {
      cur.qs.add(size(cur) - 1);
      pause = true;
    } else if (t.kind === "punct" && t.sent) {
      out.push({ phrases: [], qs: new Set() });
      pause = false;
    }
  }
  if (sec.end === "?") out[out.length - 1].qs.add(size(out[out.length - 1]) - 1);
  return out.filter((s) => s.phrases.length);
}

interface Place {
  /** mora index in the sentence, the sentence's morae, the breath group's first mora and end, its index */
  i: number;
  total: number;
  bgS: number;
  bgE: number;
  bgI: number;
  /** accented phrases before this one in the breath group */
  acc: number;
  first: boolean;
  pauses: Set<number>;
  qs: Set<number>;
}
function phraseRows(M: Token[], at: Place): Record<string, number>[] {
  // one row of features per mora; H / L from the marks as the rules read them (high from the start without ꜛ)
  const n = M.length,
    f = M.findIndex((m) => m.fall),
    nuc = f < 0 ? 0 : f + 1;
  let high = !M[0].hasRise,
    hk = 0;
  return M.map((m, j) => {
    const H = high ? 1 : 0,
      i = at.i + j,
      b = (x: boolean): number => (x ? 1 : 0);
    const r = {
      ...{ H, first_L: b(j === 0 && !high), hpos: H * hk, nucm: b(nuc > 0 && j === nuc - 1), post1: b(nuc > 0 && j === nuc) },
      ...{ post: b(nuc > 0 && j > nuc), lpos: nuc > 0 && j >= nuc ? j - nuc : 0, flat: b(nuc === 0 || nuc === n) },
      ...{ down: at.acc, down_H: at.acc * H, bgx: (i - at.bgS) / Math.max(at.bgE - at.bgS, 1), sx: i / at.total, bg_i: at.bgI },
      ...{ last_bg: b(at.bgE === at.total), final: b(i === at.total - 1), final2: b(i === at.total - 2) },
      ...{ prepause: b(at.pauses.has(i + 1)), q: b(at.qs.has(i)), q2: b(at.qs.has(i + 1)), phrase_last: b(j === n - 1) },
      ...{ size: n, first_phrase: b(at.first) },
    };
    if (high) hk++;
    if (m.rise) high = true;
    if (m.fall) high = false;
    return r;
  });
}
function sentenceRows(s: Sentence): Record<string, number>[] {
  const total = size(s),
    pauses = new Set<number>(),
    rows: Record<string, number>[] = [];
  let k = 0;
  for (const p of s.phrases) {
    if (p.pause) pauses.add(k);
    k += p.morae.length;
  }
  const bounds = [0, ...pauses, total].sort((a, b) => a - b);
  let acc = 0,
    bgI = 0;
  k = 0;
  s.phrases.forEach((p, pi) => {
    if (p.pause) [acc, bgI] = [0, bgI + 1];
    const bgS = Math.max(...bounds.filter((x) => x <= k)),
      bgE = Math.min(...bounds.filter((x) => x > k));
    rows.push(...phraseRows(p.morae, { i: k, total, bgS, bgE, bgI, acc, first: pi === 0 || p.pause, pauses, qs: s.qs }));
    if (p.morae.some((m) => m.fall)) acc++;
    k += p.morae.length;
  });
  return rows;
}
function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y),
    h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}
/** the three pitch values of every Japanese mora of the section, from its accent marks */
export function jaContour(sec: Section): Map<Token, number[]> {
  const out = new Map<Token, number[]>();
  for (const s of sentences(sec)) {
    const V = sentenceRows(s).map((r) => POINT.map((c, p) => Object.entries(r).reduce((v, [f, x]) => v + x * (W[f][0] + W[f][1 + p]), c)));
    const mid = median(V.flat());
    s.phrases
      .flatMap((p) => p.morae)
      .forEach((m, i) =>
        out.set(
          m,
          V[i].map((v) => v - mid),
        ),
      );
  }
  return out;
}
