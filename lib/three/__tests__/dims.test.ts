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

  describe("in perspective, placed in the model's space", () => {
    const persp = (pos: [number, number, number], target: [number, number, number] = [0, 20, 0]) => {
      const cam = new THREE.PerspectiveCamera(32, 1.6, 1, 5000);
      cam.position.set(...pos);
      cam.lookAt(...target);
      cam.updateMatrixWorld();
      return cam;
    };
    const tall = new THREE.Box3(new THREE.Vector3(-50, 0, -30), new THREE.Vector3(50, 40, 30));
    const axisOf = (dir: number[]) => dir.findIndex((v) => v !== 0);
    const sees = (eye: THREE.Vector3, b: THREE.Box3, axis: number, v: number) => (v === b.max.getComponent(axis) ? eye.getComponent(axis) > v : eye.getComponent(axis) < v);

    it("measures width and depth on the near bottom edges and height on the nearer outline corner", () => {
      const cam = persp([190, 170, 270]);
      const d = dimLines(tall, cam, 800, 500);
      const by = (a: number) => d.find((x) => x.axis === a)!;
      const [w0] = by(0).world!.edge;
      expect([w0[1], w0[2]]).toEqual([0, 30]);
      const [d0] = by(2).world!.edge;
      expect([d0[0], d0[1]]).toEqual([50, 0]);
      // Height: of the two outline corners (50, -30) and (-50, 30), the clearly nearer one.
      const side = dimLines(tall, persp([300, 170, 120]), 800, 500).find((x) => x.axis === 1)!.world!.edge[0];
      expect([side[0], side[2]]).toEqual([50, -30]);
      const front = dimLines(tall, persp([120, 170, 300]), 800, 500).find((x) => x.axis === 1)!.world!.edge[0];
      expect([front[0], front[2]]).toEqual([-50, 30]);
    });

    it("never measures a hidden edge, as the screenshot's far height did", () => {
      const thin = new THREE.Box3(new THREE.Vector3(-60, 0, -40), new THREE.Vector3(60, 23, 40));
      for (const pos of [[190, 170, 270], [-220, 120, 200], [160, 260, -240], [-150, 90, -260], [260, 60, 40]] as [number, number, number][]) {
        const cam = persp(pos, [0, 10, 0]);
        const eye = new THREE.Vector3(...pos);
        for (const l of dimLines(thin, cam, 900, 560)) {
          const [p0] = l.world!.edge;
          const faces = [0, 1, 2].filter((k) => k !== l.axis).filter((k) => sees(eye, thin, k, p0[k]));
          expect(faces.length, `${pos} axis ${l.axis}`).toBeGreaterThan(0);
        }
      }
    });

    it("runs the extension lines along a model axis, outward from a face the edge borders", () => {
      const cam = persp([-200, 150, -250]);
      for (const l of dimLines(tall, cam, 800, 500)) {
        const dir = l.world!.dir;
        expect(dir.filter((v) => v !== 0)).toHaveLength(1);
        const k = axisOf(dir);
        expect(k).not.toBe(l.axis);
        const [p0] = l.world!.edge;
        expect(p0[k]).toBe(dir[k] > 0 ? tall.max.getComponent(k) : tall.min.getComponent(k));
      }
      // Seen from the back left, width sits on the back bottom edge and depth on the left one.
      const d = dimLines(tall, cam, 800, 500);
      const w = d.find((x) => x.axis === 0)!.world!.edge[0], dp = d.find((x) => x.axis === 2)!.world!.edge[0];
      expect([w[1], w[2]]).toEqual([0, -30]);
      expect([dp[0], dp[1]]).toEqual([-50, 0]);
    });

    it("keeps lines off the model and labels apart and on screen, from any side", () => {
      let seed = 7;
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
      const boxes = [tall, new THREE.Box3(new THREE.Vector3(-40, 0, -40), new THREE.Vector3(40, 80, 40)), new THREE.Box3(new THREE.Vector3(-90, 0, -60), new THREE.Vector3(90, 23, 60))];
      for (let i = 0; i < 40; i++) {
        const b = boxes[i % boxes.length];
        const az = rnd() * Math.PI * 2, el = 0.15 + rnd() * 1.1, r = 380 + rnd() * 200;
        const cam = persp([Math.cos(az) * Math.cos(el) * r, Math.sin(el) * r + 20, Math.sin(az) * Math.cos(el) * r]);
        const d = dimLines(b, cam, 900, 560);
        expect(d.length, `camera ${i}`).toBeGreaterThanOrEqual(2);
        const labels = d.map((l) => [(l.to[0][0] + l.to[1][0]) / 2 + l.n[0] * 9, (l.to[0][1] + l.to[1][1]) / 2 + l.n[1] * 9]);
        for (const [x, y] of labels) {
          expect(x, `camera ${i}`).toBeGreaterThan(0);
          expect(x).toBeLessThan(900);
          expect(y, `camera ${i}`).toBeGreaterThan(0);
          expect(y).toBeLessThan(560);
        }
        for (let a = 0; a < labels.length; a++) for (let c = a + 1; c < labels.length; c++) {
          expect(Math.hypot(labels[a][0] - labels[c][0], labels[a][1] - labels[c][1]), `camera ${i}`).toBeGreaterThan(30);
        }
        for (const l of d) {
          // The dimension line's ends are set off from the edge on screen.
          for (const e of [0, 1]) expect(Math.hypot(l.to[e][0] - l.from[e][0], l.to[e][1] - l.from[e][1]), `camera ${i} axis ${l.axis}`).toBeGreaterThan(12);
        }
        expect(dimSVG(d)).not.toMatch(/NaN/);
      }
    });
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
