// The Japanese dictionary accent (D25, D27): the YomiScript keeps its reading, and OpenJTalk's dictionary adds ꜛ / ꜜ to
// the accent phrases it reads the same way; the rules then give those phrases their pitch (ACCENT_SCALE), and the
// rest keeps the Katarite's own prosody.
import { isJa, parse, realize, type Katarite } from "@yomiscript/core";
import type { Analyzer } from "./frontend.ts";
import { dictPhrases } from "./phrases.ts";
import { writeMarks } from "./marks.ts";

export { DICT_FILES, DICT_URL, DICT_VERSION, loadFrontend, type Analysis, type Analyzer } from "./frontend.ts";
export { labelMorae, type HL, type LabelMora } from "./labels.ts";
export { dictPhrases, type DictPhrase } from "./phrases.ts";
export { writeMarks, type MarkStats } from "./marks.ts";
export { USER_DICT } from "./userdict.ts";

/** Japanese, with <t:…>, and no accent marks or pitch values of its own (those are the writer's, left as written);
 * false when it does not parse */
export function needsAccent(ys: string): boolean {
  let u;
  try {
    u = parse(ys);
  } catch {
    return false;
  }
  const ja = u.sections.filter((s) => isJa(s.lang));
  return !!u.texts.length && ja.length > 0 && !ja.some((s) => s.toks.some((t) => t.rise || t.fall || t.f0));
}
/** the YomiScript with the dictionary's accent marks; unchanged when it does not need them (needsAccent) */
export function accentMarks(ys: string, a: Analyzer): string {
  if (!needsAccent(ys)) return ys;
  const text = parse(ys).texts.join(""),
    { njd, labels } = a.analyze(text),
    P = dictPhrases(text, njd, labels);
  return P ? writeMarks(ys, P).ys : ys;
}
/** how strongly the rules render the dictionary's marks: full strength, the values of the whole sentence (D28; D25
 * had half and D27 three quarters of the earlier phrase rule) */
export const ACCENT_SCALE = 1;
/** the Yomite step before Kokoro: the dictionary's marks, then pitch values for the marked phrases only */
export function accentYomite(a: Analyzer): (ys: string) => string {
  return (ys) => {
    const marked = accentMarks(ys, a);
    return marked === ys ? ys : realize(marked, { markedOnly: true, jaScale: ACCENT_SCALE });
  };
}

/** a Katarite that runs the accent step before speaking a YomiScript that needs it. The step (the dictionary) is
 * loaded the first time one does; when it cannot be loaded, onError is told once and everything is spoken as it is. */
export function withAccent(k: Katarite, loadStep: () => Promise<(ys: string) => string>, onError?: (e: unknown) => void): Katarite {
  let step: Promise<((ys: string) => string) | null> | null = null;
  const get = () =>
    (step ??= loadStep().catch((e: unknown) => {
      onError?.(e);
      return null;
    }));
  return {
    name: k.name,
    languages: k.languages,
    speak: async (ys) => {
      const f = needsAccent(ys) ? await get() : null;
      return k.speak(f ? f(ys) : ys);
    },
  };
}
