// Katarite (Kokoro-82M): YomiScript -> what Kokoro is given. Pitch comes only from <f0:…> values; accent / stress /
// tone marks are not interpreted here (the Yomite turns them into values). What stays here is engine-specific:
// YomiScript IPA -> Kokoro's phoneme symbols and input ids, and the voice for each section.
import { parse, isJa, VOWELS, type Token } from "@yomiscript/core";
import { VOCAB } from "./vocab.ts";

export const SR = 24000,
  BLEND = 0.2;
export const VOICE: Readonly<Record<string, string>> = {
  ja: "jf_alpha",
  "en-US": "af_heart",
  "en-GB": "bf_emma",
  en: "af_heart",
  fr: "ff_siwis",
  zh: "zf_xiaoxiao",
};
const voiceOf = (l: string): string => {
  const v = VOICE[l] ?? VOICE[l.split("-")[0]];
  if (!v) throw new Error(`this Katarite does not support language ${l}`);
  return v;
};
function jaKokoro(on: string, v: string): string {
  // canonical Japanese YomiScript IPA -> the phoneme symbols Kokoro was trained on
  on = on.replace("tɕ", "ʨ").replace("dʑ", "ʥ").replace("ts", "ʦ").replace("w", "β").replace("ʷ", "ᵝ");
  if (on === "dz" || on === "ʣ") on = "ʣ";
  if (v === "i" && /^[kɡbpmɾvɸtdʦ]$/.test(on)) on += "ʲ";
  if (v === "ɯ" && (/ʲ$/.test(on) || /^[ɕʥʨçsʦɲ]$/.test(on))) v = "ɨ";
  if (v === "ɯ" && on === "ʣ") {
    on = "z";
    v = "ɨ";
  }
  return on + v;
}
const FOREIGN_JA: Record<string, string> = { ɨ: "u", ɕ: "ʃ", ʑ: "ʒ", ʨ: "ʧ", ʥ: "ʤ" };
const INI: [string, string][] = [
  ["zh", "ʈʂ"],
  ["ch", "ʈʂʰ"],
  ["sh", "ʂ"],
  ["b", "p"],
  ["p", "pʰ"],
  ["m", "m"],
  ["f", "f"],
  ["d", "t"],
  ["t", "tʰ"],
  ["n", "n"],
  ["l", "l"],
  ["g", "k"],
  ["k", "kʰ"],
  ["h", "x"],
  ["j", "ʨ"],
  ["q", "ʨʰ"],
  ["x", "ɕ"],
  ["r", "ɻ"],
  ["z", "ʦ"],
  ["c", "ʦʰ"],
  ["s", "s"],
  ["y", ""],
  ["w", ""],
];
const FIN: Record<string, string> = {
  a: "a",
  o: "wo",
  e: "ɤ",
  ai: "aI",
  ei: "eI",
  ao: "aʊ",
  ou: "oʊ",
  an: "an",
  en: "ən",
  ang: "aŋ",
  eng: "əŋ",
  ong: "ʊŋ",
  er: "ɚ",
  i: "i",
  ia: "ja",
  ie: "je",
  iao: "jaʊ",
  iu: "joʊ",
  ian: "jɛn",
  in: "in",
  iang: "jaŋ",
  ing: "iŋ",
  iong: "jʊŋ",
  u: "u",
  ua: "wa",
  uo: "wo",
  uai: "waI",
  ui: "weI",
  uan: "wan",
  un: "wən",
  uang: "waŋ",
  v: "y",
  ue: "ɥe",
  ve: "ɥe",
  uan_j: "ɥɛn",
  un_j: "yn",
};
const TONE: Record<string, string> = { 1: "→", 2: "↗", 3: "↓", 4: "↘", 5: "" };
function zsyl(syl: string): string {
  const m = syl.match(/^([a-zü]+)(\d)(?:>(\d))?/);
  if (!m) throw new Error(`bad pinyin syllable ${JSON.stringify(syl)}`);
  const py = m[1],
    t = m[3] || m[2];
  let ini = "",
    ip = "";
  for (const [a, b] of INI)
    if (py.startsWith(a)) {
      ini = a;
      ip = b;
      break;
    }
  return ip + zhFinal(ini, py.slice(ini.length)) + TONE[t];
}
const Y_FIN: Record<string, string> = { u: "v", ue: "ve", uan: "uan_j", un: "un_j", i: "i", in: "in", ing: "ing" };
const JQX_FIN: Record<string, string> = { u: "v", ue: "ve", uan: "uan_j", un: "un_j" };
function zhFinal(ini: string, f: string): string {
  // the pinyin final after its initial -> Kokoro's symbols
  if (ini === "y") f = Y_FIN[f] ?? (f.startsWith("i") ? f : "i" + f);
  if (ini === "w" && f !== "u") f = "u" + f;
  if (["j", "q", "x"].includes(ini) && f.startsWith("u")) f = JQX_FIN[f];
  if (f === "i" && ["z", "c", "s"].includes(ini)) return "ɹ";
  if (f === "i" && ["zh", "ch", "sh", "r"].includes(ini)) return "ɻ";
  return FIN[f] ?? f;
}
const KOKORO_VOWELS = "AIOQWY" + VOWELS; // after the conversion to Kokoro's symbols (A = eɪ …)
const EN_SYMBOLS: [string, string][] = [
  ["g", "ɡ"],
  ["tʃ", "ʧ"],
  ["dʒ", "ʤ"],
  ["eɪ", "A"],
  ["aɪ", "I"],
  ["aʊ", "W"],
  ["ɔɪ", "Y"],
  ["oʊ", "O"],
  ["əʊ", "Q"],
  ["r", "ɹ"],
  ["l̩", "ᵊl"],
  ["x", "k"],
  ["ɾ", "T"], // Kokoro's English flap token is T
];
function enSyl(x: string, gb: boolean): string {
  for (const [a, b] of EN_SYMBOLS) x = x.split(a).join(b);
  x = x
    .split("ɝ")
    .join(gb ? "ɜː" : "ɜɹ")
    .split("ɚ")
    .join(gb ? "ə" : "əɹ");
  let st = "";
  if (x[0] === "ˈ" || x[0] === "ˌ") {
    st = x[0];
    x = x.slice(1);
  }
  if (st) {
    const i = x.split("").findIndex((c) => KOKORO_VOWELS.includes(c)); // the stress mark goes before the vowel
    x = i >= 0 ? x.slice(0, i) + st + x.slice(i) : st + x;
  }
  return x;
}
function jaPhonemes(t: Token, foreign: boolean, original: boolean): string {
  // ‖ and an inner ↘ as in English (', ' and '.', D26); original: as Kokoro's Japanese front end (misaki Cutlet)
  // writes them, 。 and 、 leave only the word space (D22)
  if (t.kind === "space") return " ";
  if (t.kind === "pause") return original ? " " : ", ";
  if (t.kind === "end" || t.kind === "punct") return t.sym === "." && (t.kind === "end" || (original && t.sent)) ? "" : (t.sym ?? "");
  let p = t.ipa ?? "";
  if (t.mk === "mora") p = jaKokoro(t.on ?? "", t.v ?? "");
  else if (t.mk === "Q") p = "ʔ";
  return foreign ? [...p].map((c) => FOREIGN_JA[c] ?? c).join("") : p;
}
function kokoroPhonemes(lang: string, t: Token, foreign: boolean, original: boolean): string {
  if (isJa(lang)) return jaPhonemes(t, foreign, original);
  if (t.kind === "space") return " ";
  if (t.kind === "pause") return ", ";
  if (t.kind === "end" || t.kind === "punct") return t.sym ?? "";
  const raw = t.raw ?? "";
  if (lang === "zh" || lang.startsWith("zh-")) return zsyl(raw);
  if (lang === "fr" || lang.startsWith("fr-")) return raw.replace(/g/g, "ɡ"); // IPA: g = ɡ
  return enSyl(raw, lang === "en-GB");
}
export function voiceFor(top: string, l: string, x: string): string {
  if (l === top) return voiceOf(top);
  if (x.split(/\s+/).filter(Boolean).length === 1 && (isJa(top) || !isJa(l))) return voiceOf(l);
  return `${voiceOf(top)}+${voiceOf(l)}@${BLEND}`;
}

/** one unit of a planned section: Kokoro phonemes, pitch values (or null), accent phrase */
export type PlanUnit = [string, number[] | null, number];
export interface PlannedSection {
  lang: string;
  text: string;
  voice: string;
  /** the phoneme string Kokoro is given */
  ps: string;
  ids: number[];
  /** the unit index of each id (-1 for BOS / EOS) */
  uid: number[];
  U: PlanUnit[];
  toks: Token[];
  /** how much longer each unit is spoken than Kokoro predicts (1: as predicted; D30) */
  lengthen: number[];
}
export type Plan = PlannedSection[] & { src: string };

export interface PlanOptions {
  /** Japanese punctuation as the original Kokoro gets it (D22), for the parity checks */
  original?: boolean;
}
/** a moraic ɴ before a mora without an onset (千円あれば, 原因, 恋愛), and that vowel: Kokoro runs them together */
const N_BEFORE_VOWEL = 1.5,
  VOWEL_AFTER_N = 1.25;
function lengthening(toks: Token[], ja: boolean): number[] {
  // per unit (D30); none outside Japanese or for the original
  const out = toks.map(() => 1);
  if (!ja) return out;
  toks.forEach((t, k) => {
    const n = toks[k + 1];
    if (t.kind !== "unit" || t.mk !== "N" || n?.kind !== "unit" || n.mk !== "mora" || n.on) return;
    out[k] = N_BEFORE_VOWEL;
    out[k + 1] = VOWEL_AFTER_N;
  });
  return out;
}
// plan: sections with Kokoro ids + units (no ONNX); used for parity tests and synthesis
export function plan(ys: string, opts: PlanOptions = {}): Plan {
  const Y = parse(ys);
  const P = Y.sections.map((sec): PlannedSection => {
    const foreign = isJa(sec.lang) && !isJa(Y.top);
    const U: PlanUnit[] = [],
      toks: Token[] = [];
    for (const t of sec.toks) {
      if (t.kind === "bound") continue;
      U.push([kokoroPhonemes(sec.lang, t, foreign, opts.original ?? false), t.kind === "unit" && t.f0 ? [...t.f0] : null, t.ph]);
      toks.push(t);
    }
    const ids = [0],
      uid = [-1];
    U.forEach(([p], k) => {
      for (const ch of p)
        if (ch in VOCAB) {
          ids.push(VOCAB[ch]);
          uid.push(k);
        }
    });
    ids.push(0);
    uid.push(-1);
    const ps = U.map((u) => u[0]).join("");
    const lengthen = lengthening(toks, isJa(sec.lang) && !opts.original);
    return { lang: sec.lang, text: sec.text, voice: voiceFor(Y.top, sec.lang, sec.text), ps, ids, uid, U, toks, lengthen };
  });
  return Object.assign(P, { src: Y.ys });
}
