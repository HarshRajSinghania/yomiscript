# demo/ys_web — Browser-only YomiScript speech synthesis demo

Enter YomiScript and the demo runs Kokoro-82M in the browser (onnxruntime-web, WASM) to turn it into speech. A reference Yomite first turns the accent / stress / tone marks into pitch values (`<f0:…>`), and the Katarite renders only those values (D18); the page shows the YomiScript with values it renders. In YomiScript you write how you want each word to be pronounced. Japanese is written in IPA with `ꜛ` (rise) and `ꜜ` (accent nucleus), e.g. `ja /kʲoꜜːwa | aꜜmeɡa ↘/`; kana is rejected (D17). Dialect is a Yomite setting (Japanese accent: Tokyo / Osaka on the page), not part of YomiScript (D19). Kana labels can be converted with `tools/yomiscript/kana2ipa.py`.

## Layout
- `web/index.html`: the demo page. `web/presets.json` holds Tokyo/Osaka and mixed-language examples
The code is in the TypeScript packages (`yarn build` at the root builds them; the page loads them from `web/pkg/`,
a link to `packages/`, through an import map):
- `packages/core`: the YomiScript parser (sections, units, marks, `<f0:…>` values, `<t:…>` text) and the reference
  Yomite prosody rules (`yomite.ts`: marks → `<f0:…>` values, plus devoicing `◌̥` and the t/d flap `ɾ`)
- `packages/kokoro`: Kokoro's prosody predictor used on the Yomite side (`prosody.ts`), and the Katarite:
  YomiScript IPA → Kokoro phonemes (`plan.ts`), F0 from the values (`render.ts`), ONNX inference (`engine.ts`), audio. Japanese is passed to Kokoro with words separated by spaces, as its own front end writes it; ` ‖ ` and an inner `↘` become `,` and `.` as in English (D26), where the original drops 。 and 、 (D22, kept as `plan(ys, { original: true })`).
- `export_split.py`: exports Kokoro as three ONNX files, `enc` / `f0n` / `dec` (so that F0 can be swapped in between). The decoder uses `exact_stft.py`, an STFT identical to the original's `torch.stft`/`istft` (Kokoro's own ONNX-friendly `CustomSTFT` is only approximate; see `eval/kokoro_parity`). For output identical to the original Kokoro use the fp32 models (`?m=fp32`)
- `quant.py`: size reduction. `python quant.py w16` creates a version with only the weights stored in fp16 (compute stays fp32) at `models_q/*_w16.onnx` (used by default, about 163 MB total). `i8` is an int8 trial for the decoder
- `serve.py`: local server with COOP/COEP headers (required for WASM multithreading)
- `qeval.py`: quality comparison against fp32 (pyin F0 correlation, mel difference). `drift.py`: per-segment comparison of torch, Python ONNX and JS
- `web/misread.html`: hear the misreadings. The hard-set sentences the original Kokoro misreads, each as the original speaks it (recorded) and as the Katarite speaks the LLM's YomiScript, generated in the browser with its time shown. `misread.mjs` writes its data (`web/misread.json`, `web/misread/*.wav`; after `eval/browser_tts`); `?local` uses this repository's packages and models, otherwise the published packages (jsDelivr) and the models on Hugging Face. `misread_site.sh` puts it in a folder for a static host (Cloudflare Pages), about 7 MB
- `node.mjs`: the Katarite package in Node with onnxruntime-web, reading `web/models` and `web/voices`; used by the Yomites and `eval/`
- `f0_override.py`: Python copy of `f0Override` for the ONNX check scripts below
- `pw_test.mjs` / `pw_bench.mjs` / `ort_check.py`: tests and speed measurement in Playwright and Python (from an earlier stage; `drift.py` and `ort_check.py` need reference files that are not in the repository)

## Exporting the split ONNX (Python 3.11)
```
pip install kokoro torch onnx
python export_split.py     # creates models/enc.onnx, f0n.onnx, dec.onnx (about 311 MB total)
```
Voice files are created with `export_voices.py`. From `voices-v1.0.bin` (obtained as described in `tts/kokoro_ys/README.md`), it writes each voice's style vector (510, 1, 256) float32 as raw bytes to `voices/<name>.bin`.
```
python export_voices.py path/to/voices-v1.0.bin   # the demo's 7 voices by default
```
Weights and voices are fetched automatically from `hexgrad/Kokoro-82M` (Apache-2.0). Generated files are not included in the repository.

## Running
```
yarn install && yarn build  # at the repository root: dependencies, then the TypeScript packages
python quant.py w16
cd web && ln -s ../models models && ln -s ../voices voices && ln -s ../../../node_modules/onnxruntime-web/dist ort && cd ..
for f in enc_w16 f0n_w16 dec_w16; do ln -s ../models_q/$f.onnx models/$f.onnx; done
python serve.py 8000 web   # open http://localhost:8000/
```
URL parameters:
- `?m=` model: `w16` (default; fp16 weights, about 163 MB total) / `fp32` (about 311 MB) / `i8` (decoder MatMul and Gemm in int8)
- `?t=` number of WASM threads (default 4; requires COOP/COEP headers, so serve with `serve.py`)
- `?pitch=` where the pitch values come from: `rules` (default, core's `yomite.ts`) / `kokoro` (Kokoro's prediction, `prosody.ts`); also selectable on the page
- `?ep=webgpu` try WebGPU (falls back to WASM where unavailable)

Rough figures (8-core CPU, headless Chromium, 4 threads): 3.5 s of audio synthesized in about 2.8 s (real-time factor about 0.8). Mixed-language sentences run inference per segment, so about 1.2.
Quality: the fp16-weight version has an F0 correlation of 0.995 or higher with fp32, and the Whisper transcriptions are identical.
Speed measurement: `node pw_bench.mjs 8000 "m=w16"`
