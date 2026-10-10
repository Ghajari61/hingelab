# Model licences

## Depth-Anything-V2-Small

- Used for: Parametric → Source → Photo (photo to relief), run in the browser with onnxruntime-web.
- File: `depth-anything-v2-small/model_quantized.onnx` (int8 ONNX export, 27 MB). Not committed; run `npm run fetch:depth-model`, or set `NEXT_PUBLIC_DEPTH_MODEL_URL`. Without either, the app loads the same file from Hugging Face.
- Source: https://huggingface.co/onnx-community/depth-anything-v2-small (ONNX export of https://huggingface.co/depth-anything/Depth-Anything-V2-Small).
- Licence: **Apache-2.0** (Small model only).
- Not allowed: Depth-Anything-V2 **Base** and **Large** weights are released under CC-BY-NC-4.0 (non-commercial) and must not be used in HingeLab.

## onnxruntime-web

- Files copied to `public/ort` by `scripts/copy-wasm.js` on install.
- Licence: MIT (Microsoft).
