// Japanese pitch from the accent marks (D28): the shape the values must have, whatever the coefficients.
import { describe, expect, it } from "vitest";
import { jaContour } from "../src/ja_contour.ts";
import { parse } from "../src/index.ts";

const values = (ys: string): number[][] => {
  const sec = parse(ys).sections[0],
    C = jaContour(sec);
  return sec.toks.filter((t) => t.kind === "unit").map((t) => C.get(t) ?? []);
};
const mid = (v: number[]): number => v[1];

describe("jaContour", () => {
  it("gives every mora three values, centred on the sentence", () => {
    const V = values("ja /kʲoꜜːwa | aꜛmeꜜɡa | ɸɯꜛɾimasɯ ↘/");
    expect(V.every((v) => v.length === 3)).toBe(true);
    const all = V.flat().sort((a, b) => a - b);
    expect(Math.abs((all[(all.length >> 1) - 1] + all[all.length >> 1]) / 2)).toBeLessThan(1e-9);
  });
  it("is high up to the nucleus and low after it", () => {
    const V = values("ja /aꜛtaꜜmaɡa | itai ↘/"); // a ta ma ɡa: L H L L
    expect(mid(V[1])).toBeGreaterThan(mid(V[0]));
    expect(mid(V[1])).toBeGreaterThan(mid(V[3]));
    expect(V[2][2]).toBeLessThan(V[1][2]);
  });
  it("puts a later accented phrase lower (downstep, declination)", () => {
    const V = values("ja /aꜛtaꜜmaɡa | aꜛtaꜜmaɡa ↘/");
    expect(mid(V[5])).toBeLessThan(mid(V[1]));
  });
  it("rises at the end of a question, and of a question inside the sentence", () => {
    const st = values("ja /iꜛkɯꜜno ↘/"),
      q = values("ja /iꜛkɯꜜno ↗/");
    expect(q[2][2] - q[2][0]).toBeGreaterThan(st[2][2] - st[2][0] + 1);
    const inner = values("ja /iꜛkɯꜜno ↗ ‖ soꜛɾetoꜜmo ↘/"),
      plain = values("ja /iꜛkɯꜜno ‖ soꜛɾetoꜜmo ↘/");
    expect(inner[2][2] - inner[2][1]).toBeGreaterThan(plain[2][2] - plain[2][1] + 0.5);
  });
});
