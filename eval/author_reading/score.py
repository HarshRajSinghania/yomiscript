"""The reading of each scenario's homograph in every YomiScript of run.mjs (results/r<run>/...), by condition.

The word is found in the answer through the <t:…> layer: the IPA of the spans that cover it is its reading. That
reading is compared, in a coarse spelling (spaces, devoicing and the nasal allophones ignored; ʑ / z, ɕ / sh and the
like merged; IPA j is y), with the right readings and the misreadings of scenarios.tsv (katakana, turned into IPA by
tools/yomiscript/kana2ipa.py): right, a misreading, or neither (listed in results/other.md). A scenario whose answer
does not contain the word is left out. pyopenjtalk reads the same answers as a dictionary baseline.

Conditions: the author (the YomiScript it wrote with its answer); a reader given only the answer (text) or the
user's message too (context), the same LLM as the author or another one. Pairs are compared on the same scenarios
and answers: the McNemar test (exact, two-sided) on the scenarios where one is right and the other not.

usage: ../prosody_ref/.venv/bin/python score.py [run]   -> results/r<run>/summary.md, other.md
"""

import json
import math
import re
import sys
from itertools import combinations
from pathlib import Path

import numpy as np
import pyopenjtalk

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parents[1] / "tools/yomiscript"))
sys.path.insert(0, str(HERE.parent / "browser_tts"))
import kana2ipa  # noqa: E402
from asr_score import norm  # noqa: E402

LLMS = ["claude", "codex", "agy"]
NAMES = {"claude": "Claude", "codex": "Codex", "agy": "Gemini"}
COARSE = [("j", "y"), ("dʑ", "J"), ("ʑ", "J"), ("tɕ", "ch"), ("ɕ", "sh"), ("dz", "z"), ("ç", "h"), ("ɸ", "f"), ("ɯ", "u"), ("ɾ", "r"), ("ɡ", "g")]
COARSE += [("ɴ", "n"), ("ŋ", "n"), ("ɲ", "n"), ("mp", "np"), ("mb", "nb"), ("mm", "nm"), ("ʲi", "i"), ("ʲ", "y"), ("ʔ", "")]


def coarse(ipa):
    s = re.sub(r"[\s/‖↘↗.ˈˌ̥]", "", ipa)
    for a, b in COARSE:
        s = s.replace(a, b)
    return re.sub(r"([aiueo])\1", r"\1ː", s)


def scenarios():
    out = []
    for line in (HERE / "scenarios.tsv").read_text().splitlines():
        if line and not line.startswith("#"):
            sid, word, right, wrong, _ = line.split("\t")
            out.append({"id": sid, "word": word, "right": right.split("|"), "wrong": wrong.split("|")})
    return out


def word_ipa(ys, word, text):
    # the IPA of the <t:…> spans that cover the word; the whole utterance when the layer does not give it back
    inner = ys.split("/", 1)[-1]
    spans = [(m.group(1), m.group(2)) for m in re.finditer(r"((?:(?!<t:).)*?)<t:([^>]*)>", inner)]
    joined = "".join(t for _, t in spans)
    i = joined.find(word)
    if i < 0:
        return inner if word in text else None
    ends = np.cumsum([len(t) for _, t in spans])
    starts = ends - [len(t) for _, t in spans]
    return "".join(ipa for (ipa, _), a, b in zip(spans, starts, ends, strict=True) if a < i + len(word) and b > i)


def verdict(ipa, s):
    # right / misread / other
    got = coarse(ipa)
    if any(coarse(kana2ipa.convert(r)) in got for r in s["right"]):
        return "right"
    if any(coarse(kana2ipa.convert(r)) in got for r in s["wrong"]):
        return "misread"
    return "other"


def openjtalk(text, s):
    k = norm(pyopenjtalk.g2p(text, kana=True))
    if any(norm(r) in k for r in s["right"]):
        return "right"
    return "misread" if any(norm(r) in k for r in s["wrong"]) else "other"


def load(run):
    # (author, scenario id) -> {condition: verdict, "text": answer}; conditions: author, <reader>.<text|context>, openjtalk
    R, other = {}, []
    for s in scenarios():
        for a in LLMS:
            f = run / "author" / a / f"{s['id']}.json"
            out = json.loads(f.read_text()).get("output") if f.exists() else None
            if not out or s["word"] not in out.get("text", ""):
                continue
            row = {"text": out["text"], "openjtalk": openjtalk(out["text"], s)}
            for cond, ys in [("author", out.get("ys", ""))] + [(c, reader(run, a, c, s)) for c in readers()]:
                ipa = word_ipa(ys or "", s["word"], out["text"])
                row[cond] = verdict(ipa, s) if ipa else "other"
                if row[cond] == "other":
                    other.append(f"| {s['id']} | {s['word']} | {'/'.join(s['right'])} | {NAMES[a]} | {cond} | {out['text']} | {ipa} |")
            R[(a, s["id"])] = row
    return R, other


def readers():
    return [f"{r}.{c}" for r in LLMS for c in ("text", "context")]


def reader(run, a, cond, s):
    f = run / "reader" / a / cond / f"{s['id']}.json"
    return (json.loads(f.read_text()).get("output") or {}).get("ys") if f.exists() else None


def interval(x, rng, n=10000):
    x = np.asarray(x, float)
    m = x[rng.integers(0, len(x), (n, len(x)))].mean(1)
    return x.mean(), *np.percentile(m, [2.5, 97.5])


def mcnemar(a, b):
    # exact two-sided McNemar: (a right, b not), (b right, a not), p
    x = sum(1 for p, q in zip(a, b, strict=True) if p and not q)
    y = sum(1 for p, q in zip(a, b, strict=True) if q and not p)
    n = x + y
    p = min(1.0, 2 * sum(math.comb(n, k) for k in range(min(x, y) + 1)) / 2**n) if n else 1.0
    return x, y, p


def pooled(R, cond_of):
    # per (author, scenario): whether the condition picked by cond_of(author) read right, averaged when several
    return [np.mean([R[k][c] == "right" for c in cond_of(k[0])]) for k in sorted(R)]


def summary(R):
    rng = np.random.default_rng(0)
    groups = {
        "author (its own answer, same call)": lambda a: ["author"],
        "same LLM, reading the answer only": lambda a: [f"{a}.text"],
        "same LLM, with the user's message": lambda a: [f"{a}.context"],
        "another LLM, reading the answer only": lambda a: [f"{r}.text" for r in LLMS if r != a],
        "another LLM, with the user's message": lambda a: [f"{r}.context" for r in LLMS if r != a],
        "pyopenjtalk (dictionary)": lambda a: ["openjtalk"],
    }
    P = {g: pooled(R, f) for g, f in groups.items()}
    out = [f"Homograph read right, over {len(R)} answers that contain the word (3 authors), [95% interval]\n"]
    out += ["| condition | all | " + " | ".join(f"author {NAMES[a]}" for a in LLMS) + " |", "|---" * (2 + len(LLMS)) + "|"]
    keys = sorted(R)
    for g, f in groups.items():
        per = [f"{np.mean([np.mean([R[k][c] == 'right' for c in f(a)]) for k in keys if k[0] == a]):.1%}" for a in LLMS]
        out.append(f"| {g} | " + "{:.1%} [{:.1%}, {:.1%}]".format(*interval(P[g], rng)) + " | " + " | ".join(per) + " |")
    out += ["", "Every condition, every author (right / answers):", "", "| author | " + " | ".join(["author", *readers(), "openjtalk"]) + " |"]
    out.append("|---" * (2 + len(readers()) + 1) + "|")
    for a in LLMS:
        ks = [k for k in keys if k[0] == a]
        out.append(f"| {NAMES[a]} | " + " | ".join(f"{sum(R[k][c] == 'right' for k in ks)}/{len(ks)}" for c in ["author", *readers(), "openjtalk"]) + " |")
    out += ["", "Pairs on the same answers (exact McNemar; one reader at a time, so every pair counts once):", ""]
    out += ["| A | B | A right, B not | B right, A not | p |", "|---|---|---|---|---|"]
    single = {"author": lambda a: "author", "same LLM, text": lambda a: f"{a}.text", "same LLM, context": lambda a: f"{a}.context"}
    for r in LLMS:
        single[f"{NAMES[r]} reader, text"] = lambda a, r=r: f"{r}.text"
        single[f"{NAMES[r]} reader, context"] = lambda a, r=r: f"{r}.context"
    for x, y in [("author", "same LLM, text"), ("author", "same LLM, context"), ("same LLM, context", "same LLM, text")]:
        a = [R[k][single[x](k[0])] == "right" for k in keys]
        b = [R[k][single[y](k[0])] == "right" for k in keys]
        out.append(f"| {x} | {y} | " + " | ".join(str(v) for v in mcnemar(a, b)[:2]) + f" | {mcnemar(a, b)[2]:.3g} |")
    for r1, r2 in combinations(LLMS, 2):
        for c in ("text", "context"):
            a = [R[k][f"{r1}.{c}"] == "right" for k in keys]
            b = [R[k][f"{r2}.{c}"] == "right" for k in keys]
            x, y, p = mcnemar(a, b)
            out.append(f"| {NAMES[r1]} reader, {c} | {NAMES[r2]} reader, {c} | {x} | {y} | {p:.3g} |")
    return "\n".join(out)


def main():
    run = HERE / "results" / f"r{sys.argv[1] if len(sys.argv) > 1 else 1}"
    R, other = load(run)
    text = summary(R)
    (run / "summary.md").write_text(text + "\n")
    head = "| scenario | word | right | author | condition | answer | IPA of the word |\n|---|---|---|---|---|---|---|\n"
    (run / "other.md").write_text(head + "\n".join(other) + "\n")
    print(text)


if __name__ == "__main__":
    main()
