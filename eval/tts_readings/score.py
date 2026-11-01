"""How often each system reads the hard words right (audio/<system>/r<k>/hard.<name>.wav, from speak.mjs).

Whisper cannot decide a reading: it writes most of what it hears in kanji and digits (even with a prompt in kana),
and its language model leans to the expected words, so a misread 一日 still comes out as 一日. The judge is a CTC
model that hears Japanese as hiragana (JUDGE: wav2vec2 XLSR-53 fine-tuned on Japanese, Apache-2.0; no language
model), on minimal pairs:
for each word of targets.tsv, the sentence's gold reading with that word read each way it can be (right or misread),
everything else the same. The CTC likelihood of each (summed over all alignments) decides which reading the
recording has; the margin to the best reading of the other kind is kept, and the close ones are listed for listening
(results/review.md). A sentence is read right when all its words are.

The judge is checked on the recordings whose spoken phonemes are known (the original Kokoro, and the LLMs'
YomiScript through Kokoro: eval/browser_tts results/items.json): the known phonemes, romanized, are closest to one of
the same candidates, which is the true reading of the word.

Per system: the share of sentences read right in each run and on average, with a 95% interval from resampling the
sentences (10,000 times), per category; the sentences misread in every run and in at least one. A second table
leaves out the words the judge misjudged on the known readings: on those it cannot tell the readings apart.

usage: ../prosody_ref/.venv/bin/python score.py   -> results/summary.md, results/items.json, results/review.md
"""

import json
import re
import sys
from pathlib import Path

import numpy as np
import pyopenjtalk
import soundfile as sf
import torch
import torchaudio
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "prosody_ref"))
sys.path.insert(0, str(HERE.parent / "browser_tts"))
from align import letters, model  # noqa: E402
from asr_score import lev, norm  # noqa: E402

CATS = {"homograph": "homographs", "acronym": "acronyms", "number": "numbers", "date": "dates and times"}
# systems whose spoken phonemes are known -> the start of their name in eval/browser_tts results/items.json
KNOWN = {"kokoro.original": "original Kokoro", "claude+kokoro": "claude", "codex+kokoro": "codex"}
CLOSE = 2.0  # a margin (log-likelihood) below this is listed for listening
JUDGE = "vumichien/wav2vec2-large-xlsr-japanese-hiragana"
_judge = {}
# Kokoro's phonemes as the aligner's letters (approximately: enough to tell the candidates apart)
IPA = [("ʥ", "j"), ("ʨ", "ch"), ("ʦ", "ts"), ("ʣ", "z"), ("ɕ", "sh"), ("ɲ", "n"), ("ŋ", "n"), ("ɴ", "n"), ("ɾ", "r")]
IPA += [("ɯ", "u"), ("ɨ", "u"), ("β", "w"), ("ç", "h"), ("ɸ", "f"), ("ɡ", "g"), ("ʲi", "i"), ("ʲ", "y")]


def hard_set():
    # name -> {category, text, gold: [normalized katakana], targets: [(word, right, wrong)]}
    out = {}
    for line in (HERE.parent / "data/hard_set.tsv").read_text().splitlines():
        if line and not line.startswith("#"):
            name, cat, text, gold = line.split("\t")[:4]
            out[name] = {"category": cat, "text": text, "gold": [norm(g) for g in gold.split("|")], "targets": []}
    for line in (HERE / "targets.tsv").read_text().splitlines():
        if line and not line.startswith("#"):
            name, word, right, wrong = line.split("\t")
            read = lambda s: ["" if r == "-" else norm(r) for r in s.split("|")]  # noqa: E731
            out[name]["targets"].append((word, read(right), read(wrong)))
    return {n: x for n, x in out.items() if x["targets"]}


def minimal_pairs(x):
    # per word: [(candidate sentence, right?)]: the first gold with the word read each way
    base, out = x["gold"][0], []
    for word, right, wrong in x["targets"]:
        if right[0] not in base:
            raise ValueError(f"{x['text']}: {right[0]} is not in {base} ({word})")
        out.append([(base.replace(right[0], r, 1), ok) for ok, rs in ((True, right), (False, wrong)) for r in rs])
    return out


def spelt(kana):
    # a katakana reading as the aligner's letters (for comparing it with Kokoro's phonemes)
    ph = [p for p in pyopenjtalk.g2p(kana).split() if p not in ("pau", "sil")]
    return letters([[p] for p in ph])[0]


def judge_model():
    if not _judge:
        _judge["p"] = Wav2Vec2Processor.from_pretrained(JUDGE)
        _judge["m"] = Wav2Vec2ForCTC.from_pretrained(JUDGE).eval()
    return _judge["p"], _judge["m"]


def emissions(f):
    proc, m = judge_model()
    y, sr = sf.read(f, dtype="float32", always_2d=True)
    w = torch.tensor(y.mean(1))
    if sr != 16000:
        w = torchaudio.functional.resample(w, sr, 16000)
    with torch.inference_mode():
        x = proc(w.numpy(), sampling_rate=16000, return_tensors="pt").input_values
        return torch.log_softmax(m(x).logits[0], dim=-1)


def loglik(em, kana):
    # the CTC log-likelihood of a katakana reading, as hiragana
    proc, _ = judge_model()
    vocab = proc.tokenizer.get_vocab()
    ids = torch.tensor([vocab[chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c] for c in kana], dtype=torch.long)
    with torch.inference_mode():
        blank = proc.tokenizer.pad_token_id
        return -float(torch.nn.functional.ctc_loss(em, ids, (em.shape[0],), (len(ids),), blank=blank, reduction="sum"))


def judge(em, pairs):
    # per word: (read right, margin: best right minus best wrong, the reading heard)
    out = []
    for cands in pairs:
        L = [(loglik(em, c), c, ok) for c, ok in cands]
        g = max(v for v, _, ok in L if ok)
        b = max(v for v, _, ok in L if not ok)
        out.append((g > b, g - b, max(L)[1]))
    return out


def romanized(ps):
    # Kokoro's phoneme string as letters: the IPA above, IPA j as y, a long vowel doubled, ʔ as the next consonant
    s = re.sub(r"[^a-zɐ-ʒβçθ̥ʲːʔ]", "", ps.replace("j", "y"))
    for a, b in IPA:
        s = s.replace(a, b)
    s = re.sub(r"(.)ː", r"\1\1", s)
    return re.sub(r"ʔ(.)", r"\1\1", s).replace("ʔ", "")


def truth(pairs, ps):
    # per word: whether the known phonemes are closest to a right reading
    _, d, _ = model()
    inv = {v: k for k, v in d.items()}
    spoken = romanized(ps)
    return [min((lev(spoken, "".join(inv[i] for i in spelt(c))), not ok) for c, ok in cands)[1] is False for cands in pairs]


def interval(M, rng, n=10000):
    # M: sentences x runs of 0/1; the mean and a 95% interval, resampling the sentences
    means = M[rng.integers(0, len(M), (n, len(M)))].mean(axis=(1, 2))
    return M.mean(), *np.percentile(means, [2.5, 97.5])


def cell(m, rng):
    return "{:.1%} [{:.1%}, {:.1%}]".format(*interval(m, rng)) if len(m) else "-"


def summary(H, R):
    rng = np.random.default_rng(0)
    cats = " | ".join(f"{v} ({sum(x['category'] == k for x in H.values())})" for k, v in CATS.items())
    rows = [f"| system | runs | all ({len(H)}) | {cats} | misread in every run | in at least one |", "|---" * (6 + len(CATS)) + "|"]
    for s, items in R.items():
        M = np.array([[all(ok for ok, _, _ in words) for words in items[n]] for n in H], float)
        cats = [cell(M[[H[n]["category"] == k for n in H]], rng) for k in CATS]
        every, once = int((M.max(1) == 0).sum()), int((M.min(1) == 0).sum())
        rows.append(f"| {s} | {M.shape[1]} | {cell(M, rng)} | " + " | ".join(cats) + f" | {every} | {once} |")
    return "\n".join(rows)


def validation(H, R, P):
    # the judge against the known readings, word by word
    known = json.loads((HERE.parent / "browser_tts/results/items.json").read_text())["hard"]
    order = [line.split("\t")[0] for line in (HERE.parent / "data/hard_set.tsv").read_text().splitlines() if line and not line.startswith("#")]
    pairs, wrong, bad = [], [], set()
    for s, prefix in KNOWN.items():
        ps = next(v for k, v in known.items() if k.startswith(prefix))
        for n in H:
            T = truth(P[n], ps[order.index(n)]["ps"])
            for k, (t, (j, m, b)) in enumerate(zip(T, R[s][n][0], strict=True)):
                pairs.append((t, j))
                if t != j:
                    bad.add((n, k))
                    wrong.append(f"{s} {n} {H[n]['targets'][k][0]}: known {'right' if t else 'misread'}, judged {'right' if j else 'misread'} ({b}, {m:.1f})")
    agree = sum(t == j for t, j in pairs)
    head = f"The judge on {len(pairs)} words with known readings: agrees on {agree} ({agree / len(pairs):.1%})"
    return head + "".join(f"\n- {w}" for w in wrong), bad


def without(H, R, bad):
    # H and R without the words the judge misjudged on known readings (a sentence left with none is dropped)
    keep = {n: [k for k in range(len(x["targets"])) if (n, k) not in bad] for n, x in H.items()}
    H2 = {n: {**x, "targets": [x["targets"][k] for k in keep[n]]} for n, x in H.items() if keep[n]}
    R2 = {s: {n: [[w[k] for k in keep[n]] for w in items[n]] for n in H2} for s, items in R.items()}
    return H2, R2


def review(H, R):
    # every word judged misread or close, for listening
    out = ["| sentence | text | word | system | run | judged | margin | heard as |", "|---|---|---|---|---|---|---|---|"]
    for n, x in H.items():
        for s, items in R.items():
            for r, words in enumerate(items[n], 1):
                for (word, _, _), (ok, m, b) in zip(x["targets"], words, strict=True):
                    if not ok or m < CLOSE:
                        out.append(f"| {n} | {x['text']} | {word} | {s} | r{r} | {'right' if ok else 'misread'} | {m:.1f} | {b} |")
    return "\n".join(out)


def main():
    H = hard_set()
    P = {n: minimal_pairs(x) for n, x in H.items()}
    systems = {d.name: sorted(r for r in d.iterdir() if r.is_dir()) for d in sorted((HERE / "audio").iterdir())}
    R = {}
    for s, runs in systems.items():
        R[s] = {n: [judge(emissions(r / f"hard.{n}.wav"), P[n]) for r in runs] for n in H}
        print(s, flush=True)
    per = {n: {**x, "systems": {s: [[[ok, round(m, 2), b] for ok, m, b in w] for w in R[s][n]] for s in R}} for n, x in H.items()}
    (HERE / "results/items.json").write_text(json.dumps(per, ensure_ascii=False, indent=1))
    check, bad = validation(H, R, P)
    H2, R2 = without(H, R, bad)
    text = "Sentences with every judged word read right, mean over runs [95% interval]\n\n" + summary(H, R) + "\n\n" + check + "\n\n"
    words = ", ".join(sorted({H[n]["targets"][k][0] for n, k in bad}))
    text += f"Without the words the judge misjudged on known readings ({words}):\n\n" + summary(H2, R2) + "\n"
    (HERE / "results/summary.md").write_text(text)
    (HERE / "results/review.md").write_text(review(H, R) + "\n")
    print(text)


if __name__ == "__main__":
    main()
