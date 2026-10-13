"use client";

import type { Plan } from "@/lib/plans";
import type { CloudOp } from "@/lib/ai/studio/credits";
import type { AssistantRequest, AssistantResponse, ImageRequest, ImageResponse } from "@/lib/ai/studio/request";

export interface StudioStatus {
  signedIn: boolean;
  plan: Plan;
  daily: number;
  costs: Record<CloudOp, number>;
  cloud: boolean;
}

export async function studioStatus(): Promise<StudioStatus | null> {
  try {
    const r = await fetch("/api/ai/studio", { cache: "no-store" });
    return r.ok ? ((await r.json()) as StudioStatus) : null;
  } catch {
    return null;
  }
}

async function post<T>(url: string, body: unknown, signal: AbortSignal): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  } catch (e) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    throw new Error(e instanceof Error && /fetch/i.test(e.message) ? "No connection to HingeLab. Check the internet connection." : "The request failed.");
  }
  const data = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(data.error ?? (r.status === 401 ? "Sign in to use the cloud tools." : `The request failed (${r.status}).`));
  return data;
}

/** Input of a cloud picture job (the server fills in defaults). */
export type ImageAsk = { [K in ImageRequest["op"]]: Partial<Extract<ImageRequest, { op: K }>> & { op: K } }[ImageRequest["op"]];

export const cloudImage = (req: ImageAsk, signal: AbortSignal) => post<ImageResponse>("/api/ai/studio/image", req, signal);

export const askAssistant = (req: AssistantRequest, signal: AbortSignal) => post<AssistantResponse>("/api/ai/studio/assistant", req, signal);
