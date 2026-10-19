import type { GenArranged } from "@/lib/generators/output";
import type { GeneratorId } from "@/lib/generators/ids";
import type { NestJob } from "@/lib/nest/deferred";
import type { OutlineNest } from "@/lib/nest/outline";

/** Page → build worker. `id` orders requests; a reply to an older id is dropped. */
export type BuildRequest =
  | { type: "arrange"; id: number; gen: GeneratorId; params: unknown; fonts: string[] }
  | { type: "nests"; results: { job: NestJob; res: OutlineNest; ms: number }[] };

/** Build worker → page: the arranged design and the outline nests it asked for. */
export type BuildReply =
  | { type: "arranged"; id: number; arranged: GenArranged<unknown>; jobs: NestJob[]; ms: number }
  | { type: "error"; id: number; message: string };
