// Japanese pitch from the accent marks (D28, D29): three values for each mora (the start, middle and end of its voiced
// part), from a linear model over where the mora and its two neighbours on each side stand: H or L in the accent
// phrase and where the nucleus is, the accented phrases before it in its breath group (downstep), its place in the
// breath group and in the sentence, a pause or a question after it, and the mora itself (its vowel, a voiceless onset,
// ɴ, the geminate, a long vowel). The values of a sentence are centred on their median: they are relative to the
// speaker's register.
import type { Section, Token } from "./yomiscript.ts";

/** feature -> its weights when it is a feature of the mora two before, one before, the mora itself, one after and two
 * after; each three, for the start, the middle and the end of the mora whose values are computed */
const W: Record<string, number[]> = {
  H: [0.9002, 0.6245, 0.3215, 1.3808, 1.0254, 0.5983, 0.565, 1.7001, 1.8248, -1.05, -1.5881, -0.8964, -0.3759, -0.5026, -0.9493],
  H_bgx: [0.7035, 1.3411, 1.2794, -1.1374, 0.0261, 0.8996, -1.254, -1.3526, -1.0862, -0.5962, -0.5955, -1.0037, -0.845, -0.8275, -0.4163],
  bg_i: [-0.1178, -0.0998, -0.0798, -0.2072, -0.1907, -0.1408, -0.2166, -0.2405, -0.241, -0.2701, -0.2669, -0.188, 0.985, 0.9193, 0.7848],
  bgx: [4.2458, 3.7873, 2.8561, -1.6189, -2.7211, -1.2077, -0.2683, 1.1098, 2.1054, -1.8795, -2.6873, -5.2917, 0.1992, 0.0098, 1.3627],
  bgx2: [-4.4474, -5.2164, -4.7622, -0.0694, 0.8544, 0.7853, -0.0263, -0.0486, -2.1205, -1.1349, -2.3836, -0.3259, 1.3054, 2.1072, 1.0512],
  down: [0.6604, 0.681, 0.683, 0.0854, 0.1896, 0.2217, -0.9145, -0.9049, -0.8523, -0.0844, -0.141, -0.1573, 0.1517, 0.1302, 0.1516],
  down2: [0.033, -0.0123, -0.0685, -0.0616, -0.0556, -0.1665, 0.2633, 0.1512, 0.2007, -0.0371, 0.1788, 0.2903, -0.2586, -0.2752, -0.3206],
  down_H: [0.0853, 0.0532, 0.0866, -0.0248, -0.0218, -0.0521, -0.183, -0.1396, -0.0864, -0.0395, -0.0728, -0.133, 0.098, 0.054, 0.0153],
  end1: [-1.2792, -1.2966, -0.8737, -0.1654, -0.7334, -1.4384, 0.9391, 0.8616, -0.0015, -0.6398, -0.4224, -0.9231, -0.6443, -0.4942, -0.5097],
  end2: [-1.412, -0.2462, 0.3939, -3.8816, -5.2515, -4.1065, 1.8325, 1.5753, 2.519, 1.0552, 0.4738, 0.4102, -0.0233, -0.1786, -0.3303],
  fL_first: [0.1653, 0.0453, 0.068, 0.4563, 0.3948, 0.4495, 0.8631, 0.7041, 0.4589, 1.0385, 1.0142, 1.6106, 0.5297, 0.9794, 1.0718],
  final: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.742, 0.7824, 0.4615, -0.7703, -0.063, -0.6452, -0.617, -0.6344, -0.6791],
  final2: [0.0, 0.0, 0.0, 0.742, 0.7824, 0.4615, -0.7703, -0.063, -0.6452, -0.617, -0.6344, -0.6791, -0.2414, -0.3559, -0.3271],
  final_flat: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -0.4009, -1.3712, -1.3618, 0.3137, 0.041, -0.0036, 0.2201, 0.3918, 0.5048],
  first_H: [-0.1853, -0.1971, -0.2049, -0.1373, -0.4881, -0.5385, -0.665, -0.3334, 0.1081, -0.3786, -0.2675, -0.4049, -0.3928, -0.4003, -0.2335],
  first_L: [0.945, 1.1908, 0.96, -0.5028, -0.1685, 0.2206, -1.4596, -0.6267, -0.2274, -1.1982, -1.5764, -1.5376, -0.5159, -0.7742, -0.8003],
  first_phrase: [0.0127, -0.0709, -0.0488, 0.2931, 0.3346, 0.3044, 0.1126, 0.2132, 0.1748, -0.0805, -0.0214, 0.0894, -0.2158, -0.2546, -0.1815],
  flat: [-0.0741, 0.0203, 0.1424, -0.0759, -0.0241, -0.1504, 0.0957, -0.0299, 0.0426, 0.1092, 0.1729, 0.1599, -0.3294, -0.4087, -0.4863],
  hpos: [-0.1237, -0.1573, -0.1597, 0.0137, -0.0102, -0.0059, 0.1425, 0.1649, 0.1253, 0.0167, 0.061, 0.0962, 0.0248, 0.0108, 0.0143],
  last_bg: [0.5075, 0.4125, 0.3348, -0.3829, -0.0557, 0.2068, -0.7729, -0.8791, -0.9558, 0.1922, 0.0249, -0.0968, 0.0231, 0.0844, 0.1193],
  lpos: [0.1547, 0.1469, 0.1278, 0.0284, -0.0266, -0.0695, -0.3351, -0.0345, -0.0278, -0.3222, -0.4992, -0.3907, 0.2829, 0.1935, -0.0493],
  nucm: [-0.0136, -0.0876, -0.1316, 0.5455, -0.0205, -0.2689, 0.3811, 0.5184, 0.4849, 0.6471, 0.6156, 0.413, 0.879, 1.1209, 1.4015],
  nucm_bgx: [-2.9568, -2.9602, -2.3205, -1.5384, -2.6502, -3.0136, 1.4722, 0.9811, -0.345, 0.8307, 0.7888, 1.5857, -0.3531, -0.6366, -0.9942],
  phrase_last: [0.6379, 1.4142, 1.3112, -0.8891, -0.3409, 0.0838, -0.7195, -0.9274, -1.011, -0.6154, -0.6281, -0.7299, -0.0794, -0.1831, -0.2949],
  pib: [-0.2117, 0.0299, -0.2356, -0.3793, -0.4637, -0.0739, 0.52, 0.4323, 0.6576, 1.062, 0.8634, 0.4344, 1.2675, 1.3258, 1.344],
  post: [-0.4051, -0.0661, 0.0991, -1.2025, -1.1509, -0.8386, -0.1415, -2.0912, -2.4033, 1.9281, 2.8822, 1.899, 0.4473, 0.6637, 1.7055],
  post1: [-0.2523, -0.0196, 0.0216, -0.0136, -0.0876, -0.1316, 0.5455, -0.0205, -0.2689, 0.3811, 0.5184, 0.4849, 0.6471, 0.6156, 0.413],
  post_bgx: [0.2751, 0.0445, -0.0376, 1.8007, 2.7418, 2.2926, -0.81, 0.915, 1.9724, -1.5385, -2.215, -1.8492, -1.9673, -1.8981, -2.0898],
  prepause: [-1.2792, -1.2966, -0.8737, -0.1654, -0.7334, -1.4384, 1.034, 0.8612, -0.3998, -0.4765, -0.6985, -1.0892, -0.6168, -0.3327, -0.3217],
  q: [1.1407, 0.0176, -0.408, 1.6861, 1.3924, 1.0494, -0.6256, 0.9076, 3.459, -0.5544, -0.4817, -0.3009, -0.1924, -0.0997, 0.102],
  q2: [1.6861, 1.3924, 1.0494, -0.6256, 0.9076, 3.459, -0.5544, -0.4817, -0.3009, -0.1924, -0.0997, 0.102, -0.4276, -0.5058, -0.2732],
  q_H: [-2.7032, -3.3992, -4.0897, -3.2517, -4.1292, -5.0719, 4.3189, 3.2602, 1.1747, 3.8848, 3.5671, 3.4362, 3.0486, 2.8146, 2.9606],
  size: [-0.0719, -0.0615, -0.0163, 0.148, 0.1233, 0.0278, 0.0116, 0.0082, 0.1003, 0.0914, 0.094, 0.0257, -0.1798, -0.1638, -0.1474],
  size_s: [1.0275, 1.3039, 0.8172, -1.3415, -1.1954, -0.3495, -0.2296, -0.412, -0.9877, -0.5874, -0.6417, -0.1048, 1.0772, 1.0228, 0.8462],
  sx: [-9.5757, -8.8481, -8.9357, 2.1646, 2.0521, 1.9042, 5.0785, 4.4843, 4.9879, 2.3678, 1.1175, 1.9047, -1.3746, -0.359, -1.2773],
  to_end: [-0.6638, -1.6697, -1.6024, 0.7618, 1.4441, 0.8868, 0.915, 1.0043, 1.1744, -0.3403, -0.64, -0.5584, -0.6821, -0.4327, -0.3046],
  v_N: [0.2137, 0.1937, 0.1708, 0.5322, 0.3068, 0.0298, 0.8715, 0.6635, 0.6917, -0.1751, 0.2909, 0.9904, -0.0756, -0.1468, -0.2913],
  v_Q: [0.7782, 0.7814, 0.6954, 0.2751, 0.4095, 0.5268, -0.2791, -0.1259, 0.7242, -0.0587, -0.1029, -0.3758, 0.3047, 0.2125, 0.1389],
  v_R: [0.2472, 0.2655, 0.2049, 0.2652, 0.1909, 0.0837, 0.4369, 0.4015, 0.3504, 0.0717, 0.107, 0.522, 0.0951, -0.0175, -0.0529],
  v_a: [0.3896, 0.4734, 0.3894, -0.0557, -0.05, 0.0011, -0.2725, -0.4061, -0.2823, -0.1752, -0.2214, -0.2276, -0.0928, -0.1298, -0.0804],
  v_e: [0.2605, 0.3522, 0.2774, -0.052, -0.092, -0.0942, 0.0582, -0.0963, -0.2382, -0.0165, -0.0492, -0.1643, -0.0568, -0.0339, 0.0542],
  v_i: [0.3918, 0.4401, 0.3216, 0.2752, 0.1394, 0.1243, 0.061, 0.2132, 0.1623, 0.0109, 0.0293, 0.047, 0.0162, -0.0253, 0.0306],
  v_o: [0.2724, 0.2843, 0.1642, -0.0154, -0.0322, -0.0145, -0.058, -0.108, -0.2545, 0.0749, -0.0041, -0.0806, 0.1135, 0.104, 0.1997],
  v_u: [0.2996, 0.3514, 0.206, 0.2983, 0.1821, 0.0904, -0.1201, 0.2092, 0.2118, 0.0002, -0.0235, -0.2074, -0.0418, -0.0817, -0.0408],
  vl: [-0.0228, -0.0625, -0.0547, 0.1263, 0.0789, 0.0544, 1.1619, 0.4086, 0.311, -0.0161, 0.1576, 0.1844, 0.0384, 0.0778, 0.1331],
};
const POINT = [1.0902, 1.4534, 1.0078];
const CTX = 2;
const VOICELESS = new Set(["k", "kʲ", "s", "ɕ", "t", "tɕ", "ts", "h", "ç", "ɸ", "p", "pʲ"]);
const VOWEL: Record<string, string> = { a: "a", i: "i", ɯ: "u", e: "e", o: "o" };

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
  /** accented phrases before this one in the breath group, and all phrases before it there */
  acc: number;
  pib: number;
  first: boolean;
  pauses: Set<number>;
  qs: Set<number>;
}
type Row = Record<string, number>;
const b = (x: boolean): number => (x ? 1 : 0);

function phraseRows(M: Token[], at: Place): Row[] {
  // one row of features per mora; H / L from the marks as the rules read them (high from the start without ꜛ)
  const n = M.length,
    f = M.findIndex((m) => m.fall),
    nuc = f < 0 ? 0 : f + 1;
  let high = !M[0].hasRise,
    hk = 0;
  return M.map((m, j) => {
    const H = high ? 1 : 0,
      i = at.i + j;
    const r = {
      ...{ H, first_L: b(j === 0 && !high), hpos: H * hk, nucm: b(nuc > 0 && j === nuc - 1), post1: b(nuc > 0 && j === nuc) },
      ...{ post: b(nuc > 0 && j > nuc), lpos: nuc > 0 && j >= nuc ? j - nuc : 0, flat: b(nuc === 0 || nuc === n) },
      ...{ down: at.acc, down_H: at.acc * H, bgx: (i - at.bgS) / Math.max(at.bgE - at.bgS, 1), sx: i / at.total, bg_i: at.bgI },
      ...{ last_bg: b(at.bgE === at.total), final: b(i === at.total - 1), final2: b(i === at.total - 2) },
      ...{ prepause: b(at.pauses.has(i + 1)), q: b(at.qs.has(i)), q2: b(at.qs.has(i + 1)), phrase_last: b(j === n - 1) },
      ...{ size: n, first_phrase: b(at.first), size_s: Math.min(n, 8) / 8, first_H: H * b(j === 0), pib: Math.min(at.pib, 4) / 4 },
    };
    if (high) hk++;
    if (m.rise) high = true;
    if (m.fall) high = false;
    return { ...r, ...combined(r, at.bgE - i) };
  });
}
function combined(r: Row, toEnd: number): Row {
  // the place before the breath group's end, and products of the features above
  return {
    ...{ to_end: Math.min(toEnd, 8) / 8, end1: b(toEnd === 1), end2: b(toEnd === 2), bgx2: r.bgx ** 2, down2: b(r.down >= 2) },
    ...{ H_bgx: r.H * r.bgx, post_bgx: (r.post + r.post1) * r.bgx, fL_first: r.first_L * r.first_phrase, final_flat: r.final * r.flat },
    ...{ q_H: r.q * r.H, nucm_bgx: r.nucm * r.bgx },
  };
}
function kind(m: Token, prev: string | undefined): string {
  // what the mora is: its vowel, ɴ (N), the geminate (Q), or a long vowel (R: ː, or the vowel before it again without
  // an onset)
  if (m.mk === "N" || m.mk === "Q") return m.mk;
  if (m.mk === "R" || (!m.on && m.v === prev)) return "R";
  return VOWEL[m.v ?? ""] ?? "a";
}
function moraRows(morae: Token[]): Row[] {
  // the mora's kind, and whether its onset is voiceless
  let prev: string | undefined;
  return morae.map((m) => {
    const v = kind(m, prev);
    if (v === "N" || v === "Q") prev = undefined;
    else if (v !== "R") prev = m.v;
    const r: Row = { vl: b(VOICELESS.has(m.on ?? "")) };
    for (const k of ["a", "i", "u", "e", "o", "N", "Q", "R"]) r["v_" + k] = b(v === k);
    return r;
  });
}
function sentenceRows(s: Sentence): Row[] {
  const total = size(s),
    pauses = new Set<number>(),
    rows: Row[] = [];
  let k = 0;
  for (const p of s.phrases) {
    if (p.pause) pauses.add(k);
    k += p.morae.length;
  }
  const bounds = [0, ...pauses, total].sort((x, y) => x - y);
  let acc = 0,
    bgI = 0,
    pib = 0;
  k = 0;
  s.phrases.forEach((p, pi) => {
    if (p.pause) [acc, bgI, pib] = [0, bgI + 1, 0];
    const bgS = Math.max(...bounds.filter((x) => x <= k)),
      bgE = Math.min(...bounds.filter((x) => x > k));
    rows.push(...phraseRows(p.morae, { i: k, total, bgS, bgE, bgI, acc, pib, first: pi === 0 || p.pause, pauses, qs: s.qs }));
    if (p.morae.some((m) => m.fall)) acc++;
    k += p.morae.length;
    pib++;
  });
  const what = moraRows(s.phrases.flatMap((p) => p.morae));
  return rows.map((r, i) => ({ ...r, ...what[i] }));
}
function values(rows: Row[]): number[][] {
  // each mora's three values from its own row and its neighbours' (none past the sentence's ends)
  return rows.map((_, i) => {
    const v = [...POINT];
    for (let d = -CTX; d <= CTX; d++) {
      const r = rows[i + d];
      if (!r) continue;
      for (const [f, x] of Object.entries(r)) for (let p = 0; p < 3; p++) v[p] += x * W[f][(d + CTX) * 3 + p];
    }
    return v;
  });
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
    const V = values(sentenceRows(s));
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
