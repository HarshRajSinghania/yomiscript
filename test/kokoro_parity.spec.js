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
const REALIZED = read("./fixtures/presets_realized.json"); // the rule Yomite's output, recorded before the 2026-10-29 refactor (Tokyo: D28)

describe("YomiScript -> Kokoro input, as the original Kokoro gets it", () => {
  it.each(ORIGINAL.map((c) => [c.name, c]))("%s", (_, c) => {
    const P = plan(c.ys, { original: true });
    expect(P).toHaveLength(1);
    expect(P[0].ps).toBe(c.ps);
    expect(P[0].ids).toEqual(c.ids);
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
