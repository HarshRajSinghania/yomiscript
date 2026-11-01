# How often TTS misreads Japanese words whose reading depends on the context

Question: how often do the newest commercial TTS models read the hard set (`eval/data/hard_set.tsv`: homographs,
acronyms, numbers with counters, dates and times) the wrong way, next to the original Kokoro and to an LLM writing
YomiScript for Kokoro?

## Systems (2026-10-31)

| system | what reads the text | runs |
|---|---|---|
| `openai.gpt-4o-mini-tts-2025-12-15` | OpenAI's newest TTS model (snapshot), voice coral | 3 |
| `gemini.gemini-3.8-flash-tts` | Gemini's newest TTS model, voice Kore | 3 |
| `elevenlabs.eleven_v3` | ElevenLabs' newest model, voice Rachel | 3 |
| `elevenlabs.eleven_multilingual_v2` | ElevenLabs' previous model, for comparison | 3 |
| `kokoro.original` | Kokoro-82M with its own front end (misaki), as the original pipeline runs it | 1 |
| `claude+kokoro`, `codex+kokoro` | the LLM's YomiScript (`eval/browser_tts` results), with the dictionary accent, through Kokoro | 1 |

The commercial systems get the plain text; they are run three times because they do not always read a sentence
the same way. Kokoro reads a YomiScript the same way every time, so one run each (the LLMs' own run-to-run
variation is not measured here).

## The judge

Whisper cannot decide a reading: it writes most of what it hears in kanji and digits, even with a prompt in kana,
and its language model leans to the expected words (a misread 一日 comes out as 一日 again). The judge is a CTC model
that hears Japanese as hiragana (`vumichien/wav2vec2-large-xlsr-japanese-hiragana`, Apache-2.0, no language model),
on minimal pairs: for each word of `targets.tsv`, the sentence's gold reading with that word read each way listed
(right or misread) and everything else the same. The reading with the highest CTC likelihood is the one heard. A
sentence counts as read right when all its words are. `targets.tsv` lists 69 words in 62 of the 70 sentences; the
other 8 are not judged because every plausible reading of them counts as right (今日 in h005, 紅葉, SIP, NHK, and
others).

Checked on the recordings whose spoken phonemes are known (the original Kokoro, and Claude's and Codex's YomiScript
through Kokoro): the judge agrees with the known reading on 193 of 207 words (93.2%). All 14 errors go one way, a
right reading judged misread, all on Kokoro's audio (角, 何本, 9時, 30分, 3匹, 10本, 24日, 辛い). The judge can
therefore understate a system's accuracy but not overstate it, and it understates Kokoro's most.

Two earlier judges were dropped for that reason: Whisper's transcripts compared with the gold (it counted the
original Kokoro's misread dates as right), and the multilingual forced aligner of `eval/prosody_ref` (MMS, romanized
letters) on whole sentences and then on minimal pairs (71% and 90% agreement; it favours the shorter reading).

## Results (`results/summary.md`)

Sentences with every judged word read right, mean over runs, [95% interval from resampling the sentences]:

| system | all (62) | homographs (33) | acronyms (10) | numbers (8) | dates, times (11) | misread in every run | in at least one |
|---|---|---|---|---|---|---|---|
| Claude + Kokoro | 93.5% [87.1, 98.4] | 93.9% | 100% | 100% | 81.8% | 4 | 4 |
| Codex + Kokoro | 90.3% [82.3, 96.8] | 93.9% | 100% | 75.0% | 81.8% | 6 | 6 |
| Gemini 3.8 Flash TTS | 85.5% [76.9, 93.0] | 87.9% | 100% | 75.0% | 72.7% | 6 | 12 |
| ElevenLabs v3 | 75.3% [65.1, 84.9] | 65.7% | 93.3% | 66.7% | 93.9% | 11 | 19 |
| OpenAI gpt-4o-mini-tts | 72.6% [62.9, 81.7] | 69.7% | 100% | 70.8% | 57.6% | 8 | 25 |
| ElevenLabs multilingual v2 | 60.2% [48.9, 71.0] | 49.5% | 96.7% | 58.3% | 60.6% | 20 | 30 |
| original Kokoro | 30.6% [19.4, 41.9] | 51.5% | 0% | 25.0% | 0% | 43 | 43 |

Without the 8 words the judge misjudged on known readings (55 sentences): Gemini 93.3%, ElevenLabs v3 80.6%, OpenAI
77.0%, ElevenLabs v2 64.8%, the original Kokoro 34.5%. Claude and Codex come out at 100% there, but only because the
words left out are where the judge erred on their audio; for them, what the LLM wrote is the better measure: the
reading is right on 69 and 70 of the 70 sentences at the phoneme level (`eval/browser_tts`).

What the commercial systems misread most: 上手 (かみて, うわて), 人気 (ひとけ), 一日 (ついたち), 市 (いち), 目下
(もっか), 色紙 (いろがみ), 生物 (なまもの), 大家 (おおや), and dates (二十日, 一日, 八日). Acronyms are read right by
nearly all of them (ElevenLabs: SAP and AI in some runs). `results/review.md` lists every word judged misread, and every close call, for listening.

## Limits

- The hard set is small and its gold readings are provisional (its header): the intervals are wide.
- The judge is checked on Kokoro's audio only; on the commercial systems' natural speech it may err less, but this is
  not measured. The words judged misread should be confirmed by ear before the numbers are published.
- One voice per service; the readings may differ by voice.

## Run

```bash
node speak.mjs 3            # audio/<system>/r<k>/hard.<name>.wav (API keys: the environment or the repository's .env)
../prosody_ref/.venv/bin/pip install -r requirements.txt
../prosody_ref/.venv/bin/python score.py   # results/summary.md, items.json, review.md
```

`audio/` is not kept in the repository. The services are called through `../prosody_ref/services.mjs`.
