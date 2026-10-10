// Download Depth-Anything-V2-Small (Apache-2.0, int8 ONNX, 27 MB) into public/models for the
// photo-to-relief source. Only the Small model may be used: Base and Large are non-commercial.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL = "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx";
const dst = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "models", "depth-anything-v2-small", "model_quantized.onnx");

if (fs.existsSync(dst) && fs.statSync(dst).size > 20_000_000) {
  console.log(`Already there: ${dst}`);
} else {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  fs.writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
  console.log(`Saved ${fs.statSync(dst).size} bytes to ${dst}`);
}
