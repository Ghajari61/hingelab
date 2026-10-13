/** AI Studio's local image tools off the main thread. */
import { runImaging, type ImagingRequest, type ImagingResult } from "@/lib/imaging/ops";

type Msg = { id: number; req: ImagingRequest };
type Reply = { id: number; result: ImagingResult } | { id: number; error: string };

self.onmessage = (e: MessageEvent<Msg>) => {
  const post = (m: Reply, transfer: Transferable[] = []) => (self as unknown as { postMessage(m: Reply, t: Transferable[]): void }).postMessage(m, transfer);
  try {
    const result = runImaging(e.data.req);
    const t: Transferable[] = result.kind === "image" || result.kind === "engrave" ? [result.img.data.buffer as ArrayBuffer] : [];
    post({ id: e.data.id, result }, t);
  } catch (err) {
    post({ id: e.data.id, error: err instanceof Error ? err.message : String(err) });
  }
};
