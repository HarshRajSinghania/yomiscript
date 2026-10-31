// Yomite (reference, rule-based prosody): YomiScript with accent / stress / tone marks -> the same YomiScript with
// pitch values <f0:…> (semitones relative to the speaker's register) after each unit. Also writes allophones that are
// a pronunciation choice: Japanese vowel devoicing (◌̥) and the American English t/d flap (ɾ).
// Units that already carry <f0:…> are left as written. The Katarite renders only the values.
// Dialect is a Yomite setting, not part of YomiScript: realize(ys, {dialect:{ja:'osaka'}}).
import { parse, isJa, VOWELS, type Section, type Token } from "./yomiscript.ts";
import { jaContour } from "./ja_contour.ts";

export interface Edit {
  at: number;
  ins: string;
  del?: number;
}
export interface RealizeOptions {
  dialect?: { ja?: "tokyo" | "osaka" };
  /** only the Japanese accent phrases that carry ꜛ or ꜜ get values (and no devoicing is written); everything else is
   * left to the Katarite's own prosody. For callers that mark the accent only where they know it (D25) */
  markedOnly?: boolean;
  /** multiplies the values written for Japanese (1 by default) */
  jaScale?: number;
}
const inStr = (ch: string, s: string): boolean => s.includes(ch);
const fmt = (v: number): string => String(Math.round(v * 100) / 100);
export const f0Mark = (c: number[]): string => `<f0:${c.map(fmt).join(",")}>`;
export function applyEdits(s: string, E: Edit[]): string {
  for (const e of [...E].sort((a, b) => b.at - a.at)) s = s.slice(0, e.at) + e.ins + s.slice(e.at + (e.del || 0));
  return s;
}
// Japanese: Tokyo-type pitch from ꜛ / ꜜ: three values per mora from the marks of the whole sentence (ja_contour.ts,
// D28). Osaka (Keihan-type), per accent phrase: a phrase without ꜛ is high-onset, ꜛ marks where a low-onset phrase
// rises; the high stretch is flatter and vowels are not devoiced
const VLJ = ["k", "s", "ɕ", "t", "ʨ", "ʦ", "h", "ç", "ɸ", "p"];
const voicelessStart = (m: Token | undefined): boolean => !!m && m.mk === "mora" && VLJ.some((x) => (m.ipa ?? "").startsWith(x));
function devoiced(M: Token[], k: number, end: string): boolean {
  // i / ɯ between voiceless consonants, and the ɯ of a sentence-final す
  const m = M[k];
  if (m.mk !== "mora" || !inStr(m.v ?? "", "iɯɨ") || !voicelessStart(m)) return false;
  if (voicelessStart(M[k + 1])) return true;
  return k === M.length - 1 && end === "$" && (m.ipa === "sɯ" || m.ipa === "sɨ");
}
interface JaOptions {
  devoice: boolean;
  scale: number;
  /** Tokyo: the values of every mora (jaContour); Osaka: null, the values come from the phrase */
  contour: Map<Token, number[]> | null;
}
function osakaValue(high: boolean, k: number, hk: number): number {
  // high after ꜛ (or from the start without ꜛ), low after ꜜ; declining within the high stretch, flatter than Tokyo's
  if (!high) return k === 0 ? -2.0 : -2.5 - 0.3 * hk;
  const v = 2.5 - 0.45 * hk;
  return v >= 0 ? 2.5 - (2.5 - v) / 3 : v;
}
function jaPhrase(M: Token[], end: string, E: Edit[], { devoice, scale, contour }: JaOptions): void {
  // one accent phrase: the devoiced vowels (Tokyo) and the values
  let high = !M[0].hasRise,
    hk = 0;
  M.forEach((m, k) => {
    const c = contour ? contour.get(m) : !m.dev && [osakaValue(high, k, hk)];
    if (c && !m.f0) E.push({ at: m.end ?? 0, ins: f0Mark(c.map((v) => v * scale)) });
    // after the value: at the same offset, the later edit lands first (the ̥ before <f0:…>)
    if (devoice && contour && devoiced(M, k, end) && !m.dev) E.push({ at: m.vend ?? 0, ins: "̥" });
    if (high) hk++;
    if (m.rise) high = true;
    if (m.fall) high = false;
  });
}
const marked = (M: Token[]): boolean => M.some((m) => m.rise || m.fall);
function jaRules(sec: Section, E: Edit[], opt: RealizeOptions): void {
  const C: Token[][] = [];
  for (const t of sec.toks) {
    if (t.kind !== "unit") continue;
    const c = t.chunk ?? 0;
    C[c] ??= [];
    C[c].push(t);
  }
  const o = { devoice: !opt.markedOnly, scale: opt.jaScale ?? 1, contour: opt.dialect?.ja === "osaka" ? null : jaContour(sec) };
  for (const M of C) if (!opt.markedOnly || marked(M)) jaPhrase(M, sec.end, E, o);
}
// English / French: stress-based pitch, phrase-boundary rise, sentence-final fall or rise
function flaps(t: Token, prev: Token | null): boolean {
  // American English: t / d between a vowel (or r) and a vowel or syllabic l, not at the start of a word -> ɾ
  const r = t.raw ?? "";
  if (t.j === 0 || !inStr(r[0] ?? "#", "td") || r.length < 2 || prev?.kind !== "unit") return false;
  if (!inStr(r[1], VOWELS + "ɝɚ") && !r.slice(1).startsWith("l̩")) return false;
  return inStr((prev.raw ?? "").slice(-1), VOWELS + "ɹrɝɚ");
}
function euValue(t: Token, fr: boolean): number[] {
  if (fr) return t.j === (t.nsyl ?? 0) - 1 ? [0.5] : [-0.5];
  return ({ ˈ: [3.0, 1.0], ˌ: [1.0] } as Record<string, number[]>)[t.st ?? ""] ?? [-1.5];
}
// American English only: not en-GB, not French, and not English words inside another language
const flapping = (lang: string, top: string): boolean => lang.startsWith("en") && lang !== "en-GB" && top.startsWith("en");
interface Contour {
  t: Token;
  c: number[] | null;
}
const lastValued = (C: Contour[]): Contour | undefined => C.findLast((x) => x.c);
function euContours(sec: Section, top: string, E: Edit[]): Contour[] {
  // stress-based value per syllable (null where the YomiScript already has one), plus the phrase-final rises
  const fr = sec.lang === "fr",
    flap = flapping(sec.lang, top);
  const C: Contour[] = [];
  let prev: Token | null = null;
  for (const t of sec.toks) {
    const L = t.kind === "bound" ? lastValued(C) : null;
    if (L?.c) L.c = [...L.c, 2.5];
    if (t.kind === "bound") continue;
    if (t.kind === "unit" && flap && !t.f0 && flaps(t, prev)) E.push({ at: t.start ?? 0, del: 1, ins: "ɾ" });
    if (t.kind === "unit") C.push({ t, c: t.f0 ? null : euValue(t, fr) });
    prev = t;
  }
  return C;
}
function euRules(sec: Section, E: Edit[], top: string): void {
  const C = euContours(sec, top, E),
    L = lastValued(C);
  if (L?.c) L.c = [L.c[0], sec.end === "$" ? -5 : 6]; // sentence-final fall or rise
  for (const { t, c } of C) if (c) E.push({ at: t.end ?? 0, ins: f0Mark(c) });
}
// Chinese: tone contours (tone 5 = neutral, no value)
const TC: Record<string, number[] | null> = { 1: [3, 3], 2: [-1, 3.5], 3: [-3, -4.5, -3], 4: [4, -3], 5: null };
function zhRules(sec: Section, E: Edit[]): void {
  for (const t of sec.toks) {
    const c = TC[t.tone ?? ""];
    if (t.kind === "unit" && !t.f0 && c) E.push({ at: t.end ?? 0, ins: f0Mark(c) });
  }
}
export function realize(ys: string, opt: RealizeOptions = {}): string {
  const Y = parse(ys),
    E: Edit[] = [];
  for (const sec of Y.sections) {
    if (isJa(sec.lang)) jaRules(sec, E, opt);
    else if (opt.markedOnly) continue;
    else if (sec.lang === "zh") zhRules(sec, E);
    else euRules(sec, E, Y.top);
  }
  return applyEdits(Y.ys, E);
}
