/** Makes Shadow Box photos off the main thread: looks, subjects and print PDFs. */
import { makePhoto, photoSubject, printPhoto } from "./photoPipeline";
import type { PhotoRequest, PhotoResponse } from "./photoClient";

const post = (r: PhotoResponse, t: Transferable[] = []) => (self as unknown as { postMessage(r: PhotoResponse, t: Transferable[]): void }).postMessage(r, t);

self.onmessage = async (e: MessageEvent<PhotoRequest>) => {
  const m = e.data;
  try {
    if (m.kind === "make") post({ id: m.id, kind: "make", made: await makePhoto(m.blob, m.spec) });
    else if (m.kind === "subject") post({ id: m.id, kind: "subject", subject: await photoSubject(m.blob, m.tol) });
    else {
      const printed = await printPhoto(m.blob, m.req);
      post({ id: m.id, kind: "print", printed }, [printed.pdf.buffer]);
    }
  } catch (err) {
    post({ id: m.id, kind: "error", error: err instanceof Error ? err.message : String(err) });
  }
};
