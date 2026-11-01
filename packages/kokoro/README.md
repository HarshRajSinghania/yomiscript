# @yomiscript/kokoro

The Kokoro-82M Katarite: YomiScript -> Kokoro's phoneme string and ids -> ONNX (split export enc / f0n / dec) -> audio.
Given a YomiScript written by the original Kokoro front end, it hands Kokoro exactly what the original pipeline does
(D21, D22; `eval/kokoro_parity`).

- `plan(ys)`: what Kokoro is given, per language section (no ONNX). Japanese ` ‖ ` and an inner `↘` become `,` and `.`
  as in English, so Kokoro pauses there (D26); `plan(ys, { original: true })` drops them as the original does. A
  moraic `ɴ` before a mora without an onset (千円あれば) is spoken 1.5 times and that vowel 1.25 times as long as
  Kokoro predicts, which otherwise runs them together (`lengthen`, D30; none with `original`).
- `Engine(ort, loadBytes)`: the ONNX engine, for onnxruntime-web (browser; `W16`, fp16 weights) or onnxruntime-node
  (`FP32`, identical to the original). `nodeEngine({ dir, model, download })` from `@yomiscript/kokoro/node`; with `download: KOKORO_MODELS_URL`, missing
  files are downloaded into `dir` once.
- `KokoroKatarite(engine, { voice })`: core's `Katarite` (audio at 24 kHz and the time of each `<t:…>` span).
- `KokoroProsody`: Kokoro's predicted pitch written back as `<f0:…>` values (a Yomite tool).

Models: `models/{enc,f0n,dec}[_w16].onnx` and `voices/<voice>.bin` in one directory, on Hugging Face as
[receptron/yomiscript-kokoro](https://huggingface.co/receptron/yomiscript-kokoro) (`KOKORO_MODELS_URL`; made by
`demo/ys_web/export_split.py`, `exact_stft.py` and `quant.py`). `onnxruntime-node` is an optional peer dependency: install it
for `./node`; in the browser, pass onnxruntime-web to `Engine`.
