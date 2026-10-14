import { RAIL_GROUPS, RAIL_V } from "./railArt.generated";

/** File name under public/rail/ for a card key ("<group>:<value>"); shared with scripts/rail-art.ts. */
export const railFile = (key: string) => key.replace(/[^a-z0-9.-]+/gi, "-") + ".svg";

const groups: Record<string, string> = { ...RAIL_GROUPS };

/** Adds rail groups that load with their editor (the generators'), so the shell does not carry them. */
export function addRailGroups(more: Record<string, string>) {
  Object.assign(groups, more);
}

/** URL of the rendered 3D picture for a rail card, or undefined when the group keeps its line art. */
export function railPic(group: string, value: string): string | undefined {
  const list = groups[group];
  if (!list || !` ${list} `.includes(` ${value} `)) return undefined;
  return `/rail/${railFile(`${group}:${value}`)}?v=${RAIL_V}`;
}
