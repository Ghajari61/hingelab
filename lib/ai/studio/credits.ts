/**
 * AI Studio credits. Model calls cost credits from a daily allowance per plan; everything that runs
 * on the user's own computer (adjust, dither, vectorize, depth, line art, quick cutout, the laser
 * readiness score) is free.
 */
import { hasPro, type Plan } from "@/lib/plans";

export const STUDIO_DAILY: Record<Plan, number> = { free: 12, pro: 150, lifetime: 150, business: 150 };

export type CloudOp = "generate" | "restyle" | "redraw" | "expand" | "cutout" | "assistant" | "enhance" | "critique";

export const COSTS: Record<CloudOp, number> = {
  generate: 2,
  restyle: 2,
  redraw: 2,
  expand: 2,
  cutout: 1,
  assistant: 1,
  enhance: 1,
  critique: 1,
};

/** Extra credits for a high-quality picture (Pro only). */
export const HIGH_QUALITY_EXTRA = 2;

/** Credits for one picture job: its operation, plus the high-quality extra. */
export const imageCost = (op: CloudOp, quality?: "medium" | "high") => COSTS[op] + (quality === "high" ? HIGH_QUALITY_EXTRA : 0);

export const OP_NAMES: Record<CloudOp, string> = {
  generate: "Text to image",
  restyle: "Image to design",
  redraw: "Image Redraw",
  expand: "Creative Expand",
  cutout: "AI Cutout",
  assistant: "Assistant message",
  enhance: "Creative Director",
  critique: "Design review",
};

export const dailyNote = (plan: Plan) => hasPro(plan)
  ? `${STUDIO_DAILY.pro} credits a day on Pro.`
  : `${STUDIO_DAILY.free} free credits a day. Pro has ${STUDIO_DAILY.pro}.`;
