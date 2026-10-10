/**
 * Cloud autosave logic, kept free of React and Supabase so it can be tested with fake timers.
 *
 * Every edit is written to a local copy at once (so nothing is lost offline) and to the cloud
 * 1.5 s after the last change. When the editor opens, the newer of the local copy and the cloud
 * row wins.
 */

export const CLOUD_SAVE_DELAY = 1500;
export const RETRY_DELAY = 30000;

export type SaveStatus = "Saved to cloud" | "Saving…" | "Offline — saved locally" | "Not saved — Pro feature";

/** A save the server refused for good (plan limit). Retrying will not help until the edit changes. */
export function isPermanent(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { permanent?: unknown }).permanent === true;
}

/** The browser's copy of a cloud project. `dirty` = edited since the last confirmed cloud save. */
export type LocalCopy<P> = { params: P; editedAt: string; dirty: boolean };

export function localCopyKey(projectId: string) {
  return `hingelab-project-${projectId}`;
}

export type InitialChoice<P> = { params: P; source: "local" | "remote"; push: boolean };

/** Picks the copy to open: the local one only if it has unsaved edits newer than the cloud row. */
export function chooseInitial<P>(local: LocalCopy<P> | null, remote: { params: P; updated_at: string | null }): InitialChoice<P> {
  if (local && local.dirty) {
    const l = Date.parse(local.editedAt);
    const r = remote.updated_at ? Date.parse(remote.updated_at) : 0;
    if (Number.isFinite(l) && l > r) return { params: local.params, source: "local", push: true };
  }
  return { params: remote.params, source: "remote", push: false };
}

export type Timers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * Debounces cloud saves. `change()` on every edit; the save runs 1.5 s after the last one.
 * A failed save keeps the edit pending and retries after 30 s or when `online()` is called.
 * Only one save runs at a time; edits made during a save trigger another save afterwards.
 */
export class SaveScheduler<P> {
  private pending: P | null = null;
  private timer: unknown = null;
  private inFlight = false;
  private status: SaveStatus = "Saved to cloud";

  constructor(
    private readonly save: (params: P) => Promise<void>,
    private readonly onStatus: (s: SaveStatus) => void,
    private readonly timers: Timers = realTimers,
    private readonly delay = CLOUD_SAVE_DELAY,
  ) {}

  change(params: P) {
    this.pending = params;
    this.setStatus("Saving…");
    this.schedule(this.delay);
  }

  /** Saves now (used when leaving the page and when the browser comes back online). */
  flush(): Promise<void> {
    this.cancelTimer();
    return this.run();
  }

  online() {
    if (this.pending !== null) void this.flush();
  }

  hasPending() {
    return this.pending !== null;
  }

  dispose() {
    this.cancelTimer();
  }

  private setStatus(s: SaveStatus) {
    if (s === this.status) return;
    this.status = s;
    this.onStatus(s);
  }

  private cancelTimer() {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
  }

  private schedule(ms: number) {
    this.cancelTimer();
    this.timer = this.timers.set(() => {
      this.timer = null;
      void this.run();
    }, ms);
  }

  private async run(): Promise<void> {
    if (this.inFlight || this.pending === null) return;
    const params = this.pending;
    this.pending = null;
    this.inFlight = true;
    try {
      await this.save(params);
      this.inFlight = false;
      if (this.pending !== null) {
        this.schedule(this.delay);
      } else {
        this.setStatus("Saved to cloud");
      }
    } catch (e) {
      this.inFlight = false;
      if (this.pending === null) this.pending = params;
      if (isPermanent(e)) {
        this.setStatus("Not saved — Pro feature");
        return;
      }
      this.setStatus("Offline — saved locally");
      this.schedule(RETRY_DELAY);
    }
  }
}
