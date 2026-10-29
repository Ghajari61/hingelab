/**
 * The order a miniature house goes together in, for the assembly booklet: the base, one side wall,
 * the walls between, floor by floor with its partitions and stair, the top plate, the other side
 * wall, then everything that sits on the house (chimney, roof, dormers) or in front of it (doors,
 * porch, balconies, window boxes) and the garden or street. Other designs use the generic plan.
 */
import { genericPlan } from "../assemblyBook";
import type { AssemblyGroup, GenOutput } from "../types";
import type { MiniatureParams } from "./params";

export function miniaturePlan(p: MiniatureParams, out: GenOutput): AssemblyGroup[] {
  if (p.design !== "house") return genericPlan(out);
  const ids = out.parts.map((q) => q.id);
  const all = (re: RegExp) => ids.filter((id) => re.test(id));
  const N = Math.round(p.house.floors);
  const g: AssemblyGroup[] = [];
  const add = (title: string, text: string, re: RegExp) => { const m = all(re); if (m.length) g.push({ title, text, ids: m }); };
  add("Base", "Lay the base flat, slots up. Every wall, post, fence and tree has its own slot in it.", /^base$/);
  add("Left wall", "Push the left wall's bottom tabs into the base.", /^end-l$/);
  add("Back wall and facade", "Slide the back wall into the left wall's slots, and the facade with it; they stand on the base.", /^(back|facade)$/);
  for (let k = 0; k < N; k++) {
    add(k ? `Floor ${k + 1}` : "Ground floor", "Slide the floor in: its side tabs go into the left wall and its back tabs into the back wall.", new RegExp(`^${k ? `floor${k}` : "ground"}$`));
    add(`Partitions, floor ${k + 1}`, "Stand each partition in its slots in the floor; the floor above locks it.", new RegExp(`^part${k + 1}-`));
    add(`Stair, floor ${k + 1}`, "Push the treads into one stringer, press the other on, and stand the stair in the first room against the back wall.", new RegExp(`^stair${k + 1}-`));
  }
  add("Top plate", "Slide the top floor's ceiling in; it closes the frame.", /^ceiling$/);
  add("Right wall", "Press the right wall on: every floor, wall and plate passes a tab through it.", /^end-r$/);
  add("Chimney", "Glue the chimney's finger joints and stand it on the top plate before the roof goes on.", /^chimney-/);
  add("Windcatcher", "Glue the windcatcher's finger joints and stand it on the roof.", /^tower-/);
  add("Roof", "Lay the roof panels on the side walls' tabs (or glue them on the top plate); the panel over the ridge covers the other's edge.", /^roof-/);
  add("Dormers", "Glue each dormer's cheeks to its face, stand it over its hole in the front roof and glue its roof on.", /^dormer\d+-/);
  add("Doors and step", "Glue the door leaves in their openings, or hinge them on a pin, and glue the step in front.", /^(door\d*|step)$/);
  add("Porch", "Tab the porch roof into the facade, then stand the posts between the base and the porch roof and push the railings into the base.", /^porch-/);
  add("Balconies", "Push each balcony into the facade, stand its railings in its slots and press the brackets in under it.", /^balcony\d+-/);
  add("Window boxes", "Push each window box's floor into its slots under the window and glue the front and ends on.", /^box\d+-/);
  add("Fence and gate", "Push the fence panels into the base's slots, the side fences first, then the gate.", /^(fence-|gate$)/);
  add("Trees and bushes", "Slide each tree's two halves together and push the cross into its slot.", /^(tree|bush)\d+-/);
  add("Street lamps", "Slide each lamp's two halves together and push the cross into its slot.", /^lamp\d+-/);
  return g;
}
