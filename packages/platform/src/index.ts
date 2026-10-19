/**
 * The current platform. The host sets it once at start (the website at import time, the Windows
 * app in its entry); shared code reads it with `platform()`.
 */
import type { Platform } from "./types";
import { webPlatform } from "./web";

export type * from "./types";

let current: Platform | null = null;

export function setPlatform(p: Platform) { current = p; }

/** The platform the app runs on; the website's when none was set (server render, tests). */
export function platform(): Platform {
  current ??= webPlatform();
  return current;
}

/** Bytes or text as a Blob, for downloads. */
export const toBlob = (data: string | Uint8Array, mime: string) => new Blob([typeof data === "string" ? data : data.slice()], { type: mime });

export { webPlatform };
