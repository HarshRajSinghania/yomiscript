// The dictionary accent without the dictionary: the front end's output for four sentences is recorded in
// fixtures/analysis.json (from the WebAssembly with the NAIST-JDIC dictionary) and replayed by a fake analyzer.
import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Katarite, Speech } from "@yomiscript/core";
import { accentMarks, accentYomite, labelMorae, needsAccent, USER_DICT, withAccent, type Analyzer } from "../src/index.ts";

interface Recorded {
  ys: string;
  text: string;
  njd: string[];
  labels: string[];
}
const REC: Recorded[] = JSON.parse(fs.readFileSync(new URL("./fixtures/analysis.json", import.meta.url), "utf8"));
const fake: Analyzer = {
  analyze: (text) => {
    const r = REC.find((x) => x.text === text);
    if (!r) throw new Error(`not recorded: ${text}`);
    return { njd: r.njd, labels: r.labels };
  },
};
const [shiatoru, kyou, eeto, shigatsu] = REC.map((r) => r.ys);
const bare = (ys: string) => ys.replace(/<t:[^>]*>/g, "");

describe("labelMorae", () => {
  it("gives each mora its phonemes, Tokyo H / L and accent phrase", () => {
    const M = labelMorae(REC[1].labels);
    expect(M.slice(0, 3)).toEqual([
      { ph: ["ky", "o"], hl: "H", phrase: 0 },
      { ph: ["o"], hl: "L", phrase: 0 },
      { ph: ["w", "a"], hl: "L", phrase: 0 },
    ]);
  });
});

describe("accentMarks", () => {
  it("marks the phrases the dictionary reads the same way", () => {
    expect(bare(accentMarks(kyou, fake))).toBe("ja /kʲoꜜː wa | haꜛɾeꜜte | iꜛmaꜜsɯ ↘/");
  });
  it("leaves a phrase read another way unmarked (市: the YomiScript いち, the dictionary し)", () => {
    expect(bare(accentMarks(shiatoru, fake))).toBe("ja /ɕiꜜatoɾɯ no | itɕi de wa ‖ saꜛkana ɡa | ɯꜛɾaɾete | iꜛɾɯ ↘/");
  });
  it("accepts a consonant + j for the palatalized consonant (kjoː = kʲoː)", () => {
    expect(bare(accentMarks(kyou.replace("kʲoː", "kjoː"), fake))).toContain("kjoꜜː wa");
  });
  it("finds the phrases after a character NFKC changes the length of (…)", () => {
    expect(bare(accentMarks(eeto, fake))).toBe("ja /eꜜːto ‖ soꜛɾe wa ‖ tɕoꜜtto ↘/");
  });
  it("places the numbers the dictionary writes as kanji numerals", () => {
    expect(bare(accentMarks(shigatsu, fake))).toBe("ja /ɕiꜛɡatsɯ | tsɯꜛitatɕiꜜ wa | ɲɯꜛːɡakɯꜜɕiki da ↘/");
  });
  it("never changes the reading or the original text", () => {
    for (const ys of [shiatoru, kyou, eeto, shigatsu]) {
      const out = accentMarks(ys, fake);
      const plain = (s: string) => s.replace(/[ꜛꜜ]/g, "").replace(/ \| /g, " ").replace(/\s+/g, " ");
      expect(plain(out)).toBe(plain(ys));
    }
  });
});

describe("needsAccent", () => {
  it("is for Japanese with <t:…> and no marks or values of its own", () => {
    expect(needsAccent(kyou)).toBe(true);
    expect(needsAccent("ja /kʲoː wa ↘/")).toBe(false);
    expect(needsAccent("ja /kʲoꜜː<t:今日> wa<t:は> ↘/")).toBe(false);
    expect(needsAccent("ja /kʲo<f0:2>ː<t:今日> wa<t:は> ↘/")).toBe(false);
    expect(needsAccent("en-US /ˈhɛ.loʊ<t:Hello> ↘/")).toBe(false);
    expect(needsAccent("ja /kʲoː<t:今日")).toBe(false);
  });
});

describe("accentYomite", () => {
  it("writes the values for the marked phrases (ACCENT_SCALE)", () => {
    expect(bare(accentYomite(fake)(kyou))).toBe(
      "ja /kʲo<f0:4.93,5.74,6.24>ꜜː<f0:6.1,5.36,4.05> wa<f0:1.69,0,-1.29> | ha<f0:-0.13,-0.13,-0.07>ꜛɾe<f0:2.98,3.5,3.84>ꜜte<f0:2.98,1.53,0.21> | i<f0:-2.17,-2.3,-2.3>ꜛma<f0:-1.86,-1.61,-1.35>ꜜsɯ<f0:-1.51,-1.94,-1.97> ↘/",
    );
  });
  it("leaves a YomiScript it does not mark as it is", () => {
    const ys = "en-US /ˈhɛ.loʊ<t:Hello> ↘/";
    expect(accentYomite(fake)(ys)).toBe(ys);
  });
});

describe("withAccent", () => {
  const speech: Speech = { samples: new Float32Array(1), sampleRate: 24000, texts: [], times: [] };
  const inner = (): Katarite & { got: string[] } => {
    const got: string[] = [];
    return { name: "kokoro", languages: ["ja", "en"], got, speak: async (ys) => (got.push(ys), speech) };
  };
  it("loads the step once, on the first YomiScript that needs it", async () => {
    const k = inner(),
      load = vi.fn(async () => accentYomite(fake));
    const w = withAccent(k, load);
    await w.speak("en-US /ˈhɛ.loʊ<t:Hello> ↘/");
    expect(load).not.toHaveBeenCalled();
    await w.speak(kyou);
    await w.speak(kyou);
    expect(load).toHaveBeenCalledTimes(1);
    expect(k.got[1]).toContain("<f0:4.93,5.74,6.24>");
  });
  it("speaks the YomiScript as it is when the step cannot be loaded, and says so once", async () => {
    const k = inner(),
      onError = vi.fn();
    const w = withAccent(k, async () => Promise.reject(new Error("offline")), onError);
    await w.speak(kyou);
    await w.speak(kyou);
    expect(k.got).toEqual([kyou, kyou]);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("USER_DICT", () => {
  const rows = USER_DICT.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  it("has rows in NAIST-JDIC's format: 15 fields, numeric ids and cost, katakana readings, accent/morae", () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const f = r.split(",");
      expect(f).toHaveLength(15);
      expect(f.slice(1, 4).every((x) => /^-?\d+$/.test(x))).toBe(true);
      expect(f[11]).toMatch(/^[ァ-ヴー]+$/);
      expect(f[13]).toMatch(/^\d+\/\d+$/);
    }
  });
});
