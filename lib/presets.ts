/** A named starting point: settings laid over the product defaults. */
export interface Preset<P> {
  id: string;
  name: string;
  note: string;
  params: Partial<P>;
  /** Set when the start point is a project file opened from another section. */
  file?: OpenedFileRef;
}

/** A project file an editor opened: its name, the version it was saved with, and (where the browser allows) a handle to save over it. */
export interface OpenedFileRef { name: string; version: number; handle?: FileSystemFileHandle | null }
