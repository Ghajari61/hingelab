/**
 * AI Studio credits. Model calls cost credits from a daily allowance per plan; everything that runs
 * on the user's own computer (adjust, dither, vectorize, depth, line art, quick cutout) is free.
 */
import type { Plan } from "@/lib/plans";

export const STUDIO_DAILY: Record<Plan, number> = { free: 12, pro: 150 };

export type CloudOp = "generate" | "restyle" | "redraw" | "expand" | "cutout" | "assistant";

export const COSTS: Record<CloudOp, number> = {
  generate: 2,
  restyle: 2,
  redraw: 2,
  expand: 2,
  cutout: 1,
  assistant: 1,
};

export const OP_NAMES: Record<CloudOp, string> = {
  generate: "Text to image",
  restyle: "Image to design",
  redraw: "Image Redraw",
  expand: "Creative Expand",
  cutout: "AI Cutout",
  assistant: "Assistant message",
};

export const dailyNote = (plan: Plan) => plan === "pro"
  ? `${STUDIO_DAILY.pro} credits a day on Pro.`
  : `${STUDIO_DAILY.free} free credits a day. Pro has ${STUDIO_DAILY.pro}.`;
