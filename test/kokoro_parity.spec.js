// The Katarite must hand Kokoro exactly what the original pipeline hands it (D21, D22). The fixtures were recorded
// from the original (kokoro 0.9.4 KPipeline: phoneme string and input ids per chunk) next to what the Yomites
// (yomite/en_kokoro, yomite/ja_kokoro) wrote for the same text; eval/kokoro_parity has the full comparison with audio.
import fs from "fs";
import { describe, expect, it } from "vitest";
import { realize } from "@yomiscript/core";
import { plan } from "@yomiscript/kokoro";

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const ORIGINAL = read("./fixtures/kokoro_original.json");
const PRESETS = read("../demo/ys_web/web/presets.json");
const REALIZED = read("./fixtures/presets_realized.json"); // the rule Yomite's output, recorded before the 2026-10-29 refactor (Tokyo: D29)

describe("YomiScript -> Kokoro input, as the original Kokoro gets it", () => {
  it.each(ORIGINAL.map((c) => [c.name, c]))("%s", (_, c) => {
    const P = plan(c.ys, { original: true });
    expect(P).toHaveLength(1);
    expect(P[0].ps).toBe(c.ps);
    expect(P[0].ids).toEqual(c.ids);
    expect(P[0].lengthen.every((x) => x === 1)).toBe(true); // the predicted durations as they are (D30)
  });
});

describe("Japanese pauses and inner sentence ends, as in English (D26)", () => {
  const ys = "ja /kʲoː wa ‖ haɾete imasɯ ↘ asɯ wa ame ↗ soː desɯ ↘/";
  it("renders ‖ as ', ' and an inner ↘ as '.'", () => {
    expect(plan(ys)[0].ps).toBe("kʲoː βa, haɾete imasɨ. asɨ βa ame? soː desɨ");
  });
  it("leaves only the word space with original", () => {
    expect(plan(ys, { original: true })[0].ps).toBe("kʲoː βa haɾete imasɨ asɨ βa ame? soː desɨ");
  });
});

describe("a moraic ɴ before a mora without an onset, spoken longer (D30)", () => {
  const ys = "ja /ɡoseɴeɴaɾeba ‖ hoɴ o ↘/";
  it("lengthens the ɴ and the vowel after it", () => {
    const S = plan(ys)[0];
    expect(S.toks.map((t, k) => (S.lengthen[k] === 1 ? "" : `${t.mk === "N" ? "ɴ" : t.v}${S.lengthen[k]}`)).filter(Boolean)).toEqual([
      "ɴ1.5",
      "e1.25",
      "ɴ1.5",
      "a1.25",
    ]);
  });
  it("leaves the durations as predicted with original, and outside Japanese", () => {
    expect(plan(ys, { original: true })[0].lengthen.every((x) => x === 1)).toBe(true);
    expect(plan("en-US /ˈhɛ.loʊ ↘/")[0].lengthen.every((x) => x === 1)).toBe(true);
  });
});

describe("demo presets", () => {
  it.each(PRESETS.map((p) => [p.name, p.ys]))("%s plans after the rule Yomite", (_, ys) => {
    const P = plan(realize(ys));
    expect(P.length).toBeGreaterThan(0);
    for (const s of P) expect(s.ids.length).toBeGreaterThan(2);
  });
});

describe("rule Yomite (marks -> pitch values)", () => {
  it.each(REALIZED.map((r) => [r.name, r]))("%s", (_, r) => {
    expect(realize(r.ys)).toBe(r.tokyo);
    expect(realize(r.ys, { dialect: { ja: "osaka" } })).toBe(r.osaka);
  });
});
