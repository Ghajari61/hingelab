import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { rebuiltExplode } from "../rebuilt";

describe("rebuiltExplode", () => {
  it("swaps builds behind one root, keeps the closed and open builds and frees the rest", () => {
    const freed: number[] = [], built: number[] = [];
    const m = rebuiltExplode((e) => {
      built.push(e);
      const g = new THREE.Group(); g.position.y = e * 100;
      return { group: g, dispose: () => freed.push(e) };
    });
    expect(m.group.children.length).toBe(1);
    m.explode!(0.5);
    expect(m.group.children[0].position.y).toBe(50);
    m.explode!(1); m.explode!(0); m.explode!(1);
    expect(m.group.children.length).toBe(1);
    expect(built.filter((e) => e === 1).length).toBe(1);
    expect(freed).toEqual([0.5]);
    m.dispose();
    expect(freed.sort()).toEqual([0, 0.5, 1]);
  });
});
