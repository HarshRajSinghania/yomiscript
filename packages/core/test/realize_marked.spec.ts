// The rule Yomite on the accent phrases that carry marks, and only those (markedOnly), and at a given strength
// (jaScale): what the tools run after the dictionary accent (@yomiscript/ja-accent, D25; the values, D28).
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
      "ja /kʲo<f0:2.86,3.67,4.17>ꜜː<f0:3.86,3.09,1.76><t:今日> wa<f0:-0.72,-2.46,-3.79><t:は> | sɯki<t:好き> desɯ<t:です。> ↘/",
    );
    expect(only("ja /aꜛme<t:飴> ɡa<t:が> | sɯki<t:好き> ↘/")).toBe(
      "ja /a<f0:0.07,0.05,0>ꜛme<f0:2.67,3.04,2.95><t:飴> ɡa<f0:0.9,0.4,0><t:が> | sɯki<t:好き> ↘/",
    );
  });
  it("keeps values already written", () => {
    expect(only("ja /kʲo<f0:3>ꜜː<t:今日> wa<t:は> ↘/")).toBe("ja /kʲo<f0:3>ꜜː<f0:0.95,0,-1.34><t:今日> wa<f0:-4.48,-5.4,-5.64><t:は> ↘/");
  });
  it("is the full rule Yomite when every phrase is marked and nothing is devoiced", () => {
    const ys = "ja /kʲoꜜː<t:今日> wa<t:は> | aꜜme<t:雨> ↘/";
    expect(only(ys)).toBe(realize(ys));
  });
});

describe("realize with jaScale", () => {
  it("multiplies the Japanese values", () => {
    const ys = "ja /kʲoꜜː<t:今日> wa<t:は> ↘/";
    expect(realize(ys, { markedOnly: true, jaScale: 0.5 })).toBe("ja /kʲo<f0:1.79,2.19,2.44>ꜜː<f0:0.47,0,-0.67><t:今日> wa<f0:-2.24,-2.7,-2.82><t:は> ↘/");
    expect(realize(ys, { jaScale: 1 })).toBe(realize(ys));
  });
  it("leaves values already written as they are", () => {
    expect(realize("ja /kʲo<f0:3>ꜜː<t:今日> ↘/", { jaScale: 0.5 })).toBe("ja /kʲo<f0:3>ꜜː<f0:-0.52,-0.76,-0.88><t:今日> ↘/");
  });
});
