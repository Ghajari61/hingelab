import type { ImageJob, ImageProvider, ImageResult } from "./types";

/** A provider for tests: records its jobs and answers with fixed bytes, or fails as told. */
export function mockImageProvider(id = "mock", answer: (job: ImageJob) => Promise<ImageResult> | ImageResult = () => ({
  data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), mediaType: "image/png", provider: id, model: "mock-image",
})): ImageProvider & { jobs: ImageJob[] } {
  const jobs: ImageJob[] = [];
  return {
    id, model: "mock-image", jobs,
    async image(job) {
      jobs.push(job);
      return answer(job);
    },
  };
}
