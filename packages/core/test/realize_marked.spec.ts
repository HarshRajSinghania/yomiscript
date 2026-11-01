// The rule Yomite on the accent phrases that carry marks, and only those (markedOnly), and at a given strength
// (jaScale): what the tools run after the dictionary accent (@yomiscript/ja-accent, D25; the values, D28, D29).
import { describe, expect, it } from "vitest";
import { realize } from "../src/index.ts";

const only = (ys: string) => realize(ys, { markedOnly: true });

describe("realize with markedOnly", () => {
  it("leaves YomiScript without accent marks as it is", () => {
    const ys = "ja /kʲoː<t:今日> wa<t:は> ame<t:雨> deɕita<t:でした。> ↘/";
    expect(only(ys)).toBe(ys);
    expect(only("en-US /ˈhɛ.loʊ<t:Hello> ↘/")).toBe("en-US /ˈhɛ.loʊ<t:Hello> ↘/");
  });
  it("writes values for the marked phrase only, without devoicing", () => {
    expect(only("ja /kʲoꜜː<t:今日> wa<t:は> | sɯki<t:好き> desɯ<t:です。> ↘/")).toBe(
      "ja /kʲo<f0:1.28,2.37,3.46>ꜜː<f0:3.27,2.98,0.45><t:今日> wa<f0:-0.35,-3.04,-4.51><t:は> | sɯki<t:好き> desɯ<t:です。> ↘/",
    );
    expect(only("ja /aꜛme<t:飴> ɡa<t:が> | sɯki<t:好き> ↘/")).toBe(
      "ja /a<f0:-4.35,-4.59,-4.69>ꜛme<f0:-2.98,-1.84,-1.78><t:飴> ɡa<f0:0.23,0,-1.17><t:が> | sɯki<t:好き> ↘/",
    );
  });
  it("keeps values already written", () => {
    expect(only("ja /kʲo<f0:3>ꜜː<t:今日> wa<t:は> ↘/")).toBe("ja /kʲo<f0:3>ꜜː<f0:3.43,2.79,0.21><t:今日> wa<f0:1.76,-0.07,-0.66><t:は> ↘/");
  });
  it("is the full rule Yomite when every phrase is marked and nothing is devoiced", () => {
    const ys = "ja /kʲoꜜː<t:今日> wa<t:は> | aꜜme<t:雨> ↘/";
    expect(only(ys)).toBe(realize(ys));
  });
});

describe("realize with jaScale", () => {
  it("multiplies the Japanese values", () => {
    const ys = "ja /kʲoꜜː<t:今日> wa<t:は> ↘/";
    expect(realize(ys, { markedOnly: true, jaScale: 0.5 })).toBe("ja /kʲo<f0:-0.47,-0.18,0>ꜜː<f0:1.71,1.39,0.1><t:今日> wa<f0:0.88,-0.03,-0.33><t:は> ↘/");
    expect(realize(ys, { jaScale: 1 })).toBe(realize(ys));
  });
  it("leaves values already written as they are", () => {
    expect(realize("ja /kʲo<f0:3>ꜜː<t:今日> ↘/", { jaScale: 0.5 })).toBe("ja /kʲo<f0:3>ꜜː<f0:1.03,0.32,-0.23><t:今日> ↘/");
  });
});
