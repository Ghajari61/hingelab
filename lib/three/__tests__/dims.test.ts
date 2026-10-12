import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { dimLines, dimSVG, fmtDim, modelBox } from "../dims";

const box = new THREE.Box3(new THREE.Vector3(-50, 0, -13.45), new THREE.Vector3(50, 3, 13.45));

function ortho(dir: [number, number, number], up: [number, number, number]) {
  const cam = new THREE.OrthographicCamera(-80, 80, 50, -50, 0.1, 2000);
  cam.up.set(...up);
  cam.position.set(...dir).multiplyScalar(500);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  return cam;
}

describe("dimension lines", () => {
  it("a top view measures width and depth, not the thickness seen end-on", () => {
    const d = dimLines(box, ortho([0, 1, 0], [0, 0, -1]), 800, 500);
    expect(d.map((x) => x.axis).sort()).toEqual([0, 2]);
    expect(d.find((x) => x.axis === 0)!.mm).toBeCloseTo(100);
    expect(d.find((x) => x.axis === 2)!.mm).toBeCloseTo(26.9);
  });

  it("a front view measures width and height, set off outside the outline", () => {
    const tall = new THREE.Box3(new THREE.Vector3(-50, 0, -10), new THREE.Vector3(50, 40, 10));
    const d = dimLines(tall, ortho([0, 0, 1], [0, 1, 0]), 800, 500, 20);
    expect(d.map((x) => x.axis).sort()).toEqual([0, 1]);
    const width = d.find((x) => x.axis === 0)!;
    // Below the box on screen (screen y grows down), 20 px clear of it.
    const bottom = Math.max(width.from[0][1], width.from[1][1]);
    expect(width.to[0][1]).toBeCloseTo(bottom + 20);
    expect(width.n[1]).toBeGreaterThan(0.9);
    const height = d.find((x) => x.axis === 1)!;
    expect(height.n[0]).toBeGreaterThan(0.9);
  });

  it("a perspective view measures all three", () => {
    const cam = new THREE.PerspectiveCamera(32, 1.6, 1, 5000);
    cam.position.set(95, 85, 135).multiplyScalar(2);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    const tall = new THREE.Box3(new THREE.Vector3(-50, 0, -30), new THREE.Vector3(50, 40, 30));
    expect(dimLines(tall, cam, 800, 500).map((x) => x.axis).sort()).toEqual([0, 1, 2]);
  });

  it("formats in mm or inches, a kerf or facet off a whole mm as the whole mm, and writes plain SVG", () => {
    expect(fmtDim(100)).toBe("100.0 mm");
    expect(fmtDim(140.15)).toBe("140.0 mm");
    expect(fmtDim(299.9)).toBe("300.0 mm");
    expect(fmtDim(26.6)).toBe("26.6 mm");
    expect(fmtDim(25.4, "in")).toBe("1.00 in");
    const svg = dimSVG(dimLines(new THREE.Box3(new THREE.Vector3(-50, 0, -13.3), new THREE.Vector3(50, 3, 13.3)), ortho([0, 1, 0], [0, 0, -1]), 800, 500));
    expect(svg).toContain(">100.0 mm</text>");
    expect(svg).toContain(">26.6 mm</text>");
    expect(svg).not.toMatch(/NaN|<script/);
  });

  it("measures the solid parts only, not lines or overlay planes", () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(140, 70, 90)));
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(141, 70, 91)));
    g.add(lines);
    const overlay = new THREE.Mesh(new THREE.PlaneGeometry(400, 400));
    overlay.userData.noMeasure = true;
    g.add(overlay);
    const size = modelBox(g).getSize(new THREE.Vector3());
    expect(size.toArray()).toEqual([140, 70, 90]);
  });

  it("an empty box or a box behind the camera draws nothing", () => {
    expect(dimLines(new THREE.Box3(), ortho([0, 1, 0], [0, 0, -1]), 800, 500)).toEqual([]);
    const cam = new THREE.PerspectiveCamera(32, 1.6, 1, 5000);
    cam.position.set(0, 0, 500);
    cam.lookAt(0, 0, 1000);
    cam.updateMatrixWorld();
    expect(dimLines(box, cam, 800, 500)).toEqual([]);
  });
});
