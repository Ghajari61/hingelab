import { RAIL_GROUPS, RAIL_V } from "./railArt.generated";

/** File name under public/rail/ for a card key ("<group>:<value>"); shared with scripts/rail-art.ts. */
export const railFile = (key: string) => key.replace(/[^a-z0-9.-]+/gi, "-") + ".svg";

/** URL of the rendered 3D picture for a rail card, or undefined when the group keeps its line art. */
export function railPic(group: string, value: string): string | undefined {
  const list = RAIL_GROUPS[group];
  if (!list || !` ${list} `.includes(` ${value} `)) return undefined;
  return `/rail/${railFile(`${group}:${value}`)}?v=${RAIL_V}`;
}
