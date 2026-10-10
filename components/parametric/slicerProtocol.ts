import type { MeshData, ParametricParams, SliceResult } from "@/lib/parametric";

export interface SlicerRequest {
  id: number;
  params: ParametricParams;
  /** Bytes of an imported model (only needed when the source is a mesh file). */
  file?: ArrayBuffer;
  /** Identifies `file` so the worker can keep the prepared mesh between runs. */
  fileKey?: string;
  /** Send the normalised source mesh back (for the 3D view). */
  wantMesh?: boolean;
}

export type SlicerResponse =
  | { id: number; type: "progress"; stage: string }
  | { id: number; type: "result"; result: SliceResult; mesh?: MeshData; ms: number; askUnits: boolean }
  | { id: number; type: "error"; error: string };

/** One worker per editor; a newer request supersedes older ones. */
export class Slicer {
  private worker: Worker;
  private next = 1;
  private pending = new Map<number, { resolve: (r: Extract<SlicerResponse, { type: "result" }>) => void; reject: (e: Error) => void }>();

  constructor(onProgress?: (stage: string) => void) {
    this.worker = new Worker(new URL("./slicer.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<SlicerResponse>) => {
      const m = e.data;
      if (m.type === "progress") { onProgress?.(m.stage); return; }
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.type === "result") p.resolve(m);
      else p.reject(new Error(m.error));
    };
    this.worker.onerror = e => {
      for (const p of this.pending.values()) p.reject(new Error(e.message || "The slicer stopped."));
      this.pending.clear();
    };
  }

  run(req: Omit<SlicerRequest, "id">) {
    const id = this.next++;
    return new Promise<Extract<SlicerResponse, { type: "result" }>>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...req, id });
    });
  }

  dispose() {
    this.worker.terminate();
    this.pending.clear();
  }
}
