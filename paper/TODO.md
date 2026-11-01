# Before submission

Each item says what it would show. In rough order of importance.

1. **Independent gold readings with agreement.** Two or more annotators (not the authors, no LLM help) read every
   sentence; report inter-annotator agreement (Cohen's or Fleiss' kappa) and adjudicate. Shows that the hard-set
   result is not an artefact of provisional, possibly LLM-influenced gold.
2. **A few hundred homograph sentences, and existing benchmarks.** Several contexts per homograph, balanced between
   readings, plus published sets (e.g. the Joyo Kanji Yomi Benchmark and the unified G2P benchmark named in
   `docs/hypotheses.md` H1). Gives confidence intervals and per-word results instead of 35 sentences.
3. **Repeated runs.** At least 5 calls per LLM and condition, reporting mean and spread, and a run with the prompt
   frozen before seeing the new sets. Shows the result is stable and not prompt-tuned to the test set.
4. **Smaller and local LLMs.** A range of sizes (open-weight models that run locally, small API models). Shows where the
   approach stops working, which matters for an MCP server called by any LLM.
5. **Human listening tests.** MOS for naturalness and a reading-correctness judgement per sentence, comparing Kokoro and
   the Supertonic Katarite on the same YomiScript, the original front ends, and a cloud TTS. Measures naturalness, which
   Whisper cannot, and confirms the informal impression that Supertonic sounds more natural when its reading is right.
6. **Context-aware baselines.** A Japanese G2P that uses context (a neural reading model, an LLM reading someone
   else's text rather than its own) next to pyopenjtalk. Separates "an LLM reads better" from "the author reads better".
7. **Latency and token cost in the browser.** Time to first audio with the YomiScript streamed per sentence, on
   WebGPU and WASM, and output tokens per character of speech with and without the text layer. Quantifies the cost of
   letting the LLM write the pronunciation.
8. **Long-utterance splitting.** The Kokoro Katarite must split an utterance at its inner sentence ends to fit Kokoro's
   510 phonemes; then the long passage can be included. Removes the one failure in the sets.
9. **English evaluation.** An English heteronym set (read/lead/live, numbers, abbreviations) and listening, since
   phonetic-detail differences from Kokoro's front end are audible. Shows whether the result carries over beyond Japanese.
10. **Accent from the Yomite.** Optionally let the LLM write accent marks and turn them into pitch values for Kokoro
    (`<f0:…>`), compared with Kokoro's own prosody. Tests whether Japanese pitch accent, not only readings, improves.
11. **Bibliography.** Resolve the entries marked TODO verify in `references.bib` (the LLM-G2P works in Related work are
    checked).
12. **Confirm the commercial misreadings by ear.** Listen to every word the judge marked misread or close
    (`eval/tts_readings/results/review.md`) and correct Table `tab:commercial`; check the judge on commercial speech, not
    only on Kokoro's. Add more voices per service.
