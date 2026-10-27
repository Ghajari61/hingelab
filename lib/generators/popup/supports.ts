import { differenceShapes, unionShapes, intersectShapes } from '@/lib/letters/polygon';
import { rect, transform, signedArea } from '../geom';
import type { BuildContext, Contour, GenPart } from '../types';
import type { PopupParams } from './params';
import type { Ring } from './build';
export interface RingJoint {
    ring: number;
    rib: number;
    u: number;
    width: number;
    height: number;
    angle: number;
    slot: Contour;
}
const area = (sh: ReturnType<typeof differenceShapes>) => sh.reduce((n, s) => n + Math.abs(signedArea(s.outer)) - s.holes.reduce((a, h) => a + Math.abs(signedArea(h)), 0), 0);
function crossings(c: Contour, angle: number) { const q = transform(c, { rot: -angle }); const hits: number[] = []; for (let i = 0; i < q.length; i++) {
    const a = q[i], b = q[(i + 1) % q.length];
    if ((a[1] <= 0 && b[1] > 0) || (b[1] <= 0 && a[1] > 0))
        hits.push(a[0] - a[1] * (b[0] - a[0]) / (b[1] - a[1]));
} return [Math.min(...hits), Math.max(...hits)]; }
/** One joint schedule drives both mating cut files and their centred 3D placements. */
export function ribAssembly(p: PopupParams, rings: Ring[], holes: Contour[], centerHole: number, foot: number, ctx: BuildContext) {
    // A sleeve's opening goes right through to the table: crossed ribs would block it, so its ribs
    // stand radially on an annular hub round the opening (at least three of them).
    const through = p.mode === 'sleeve' && centerHole > 0;
    const count = through ? Math.max(3, p.support.ribs) : ['post', 'handles'].includes(p.support.kind) || p.extras.post ? 2 : p.support.ribs, radial = count > 2, hub = through ? centerHole / 2 + p.T : radial ? 2 * p.T : 0, fit = p.support.fit;
    let chosen: {
        joints: RingJoint[];
        angles: number[];
    } | undefined;
    for (let rotation = 0; rotation < 180; rotation += 5) {
        const joints: RingJoint[] = [], angles = Array.from({ length: count }, (_, k) => rotation + k * (radial ? 360 / count : 90));
        let valid = true;
        for (let k = 0; k < count && valid; k++)
            for (let i = 0; i < rings.length && valid; i++) {
                const ring = rings[i], out = crossings(ring.outer, angles[k]), inside = ring.inner ? crossings(ring.inner, angles[k]) : [-centerHole / 2, centerHole / 2];
                for (const sign of radial ? [1] : [-1, 1]) {
                    const lo = sign > 0 ? Math.max(inside[1], hub) : out[0], hi = sign > 0 ? out[1] : Math.min(inside[0], -hub), span = hi - lo;
                    const width = Math.min(2 * p.T, span * .35), margin = Math.max(.5, p.T * .25);
                    let joint: RingJoint | undefined;
                    if (width >= Math.max(1, p.T * .5, p.sheet?.minFeature ?? 0) && span > width + fit + 2 * margin)
                        for (const t of [.5, .4, .6, .3, .7]) {
                            const u = lo + span * t;
                            const slot = transform(rect(u - (width + fit) / 2, -(p.T + fit) / 2, width + fit, p.T + fit), { rot: angles[k] });
                            const clearance = transform(rect(u - (width + fit) / 2 - margin, -(p.T + fit) / 2 - margin, width + fit + 2 * margin, p.T + fit + 2 * margin), { rot: angles[k] });
                            const region = differenceShapes([ring.outer], ring.inner ? [ring.inner] : []).flatMap(s => [s.outer, ...s.holes]);
                            if (area(differenceShapes(clearance.length ? [clearance] : [], region)) < .001 && area(intersectShapes([clearance], holes)) < .001) {
                                joint = { ring: i, rib: k, u, width, height: ring.height, angle: angles[k], slot };
                                break;
                            }
                        }
                    if (!joint) {
                        valid = false;
                        break;
                    }
                    joints.push(joint);
                }
            }
        if (valid) {
            chosen = { joints, angles };
            break;
        }
    }
    if (!chosen)
        throw Error('No safe ring-to-rib joint layout fits this design. Widen rings/centre, reduce slots or use two ribs.');
    const { joints, angles } = chosen, parts: GenPart[] = [];
    const width = p.T + fit;
    for (let k = 0; k < count; k++) {
        const angle = angles[k], sections = rings.map(r => ({ r, out: crossings(r.outer, angle), inside: r.inner ? crossings(r.inner, angle) : [-centerHole / 2, centerHole / 2] }));
        const end = Math.max(...sections.map(v => v.out[1])), start = radial ? hub : Math.min(...sections.map(v => v.out[0]));
        const blocks: Contour[] = [rect(start, 0, end - start, foot)];
        for (const { r, out, inside } of sections)
            for (const sign of radial ? [1] : [-1, 1]) {
                const lo = sign > 0 ? Math.max(inside[1] + p.rings.gap / 2, hub) : out[0] + p.rings.gap / 2, hi = sign > 0 ? out[1] - p.rings.gap / 2 : inside[0] - p.rings.gap / 2;
                if (hi > lo)
                    blocks.push(rect(lo, -r.height, hi - lo, r.height + foot));
            }
        for (const j of joints.filter(j => j.rib === k))
            blocks.push(rect(j.u - j.width / 2, -j.height - p.T, j.width, p.T + .1));
        let shapes = unionShapes(blocks);
        if (!radial) {
            const top = -Math.max(...rings.map(r => r.height)) - p.T - 1;
            const cut = k === 0 ? rect(-width / 2, top, width, foot / 2 - top) : rect(-width / 2, foot / 2, width, foot / 2 + 1);
            shapes = differenceShapes(shapes.flatMap(s => [s.outer, ...s.holes]), [cut]);
        }
        else
            shapes = unionShapes([...shapes.flatMap(s => [s.outer, ...s.holes]), rect(hub + p.T, foot - .1, 2 * p.T, p.T + .1)]);
        if (shapes.length !== 1)
            throw Error('Support disconnected: increase ring width or reduce clearance.');
        const a = angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), m = [c, 0, -s, s * p.T / 2, s, 0, c, -c * p.T / 2, 0, -1, 0, 0];
        const text = ctx.text?.(`R${k + 1}`, 'archivo-black', Math.min(3, foot * .3));
        parts.push({ id: `rib-${k + 1}-0`, name: `Rib R${k + 1}`, outer: shapes[0].outer, holes: shapes[0].holes, engrave: text?.contours.map(c => transform(c, { x: radial ? hub + 5 : -10, y: foot * .75 })), place: { x: 0, y: 0, z: 0, m } });
    }
    if (radial) {
        const slots = angles.map(angle => transform(rect(hub + p.T - fit / 2, -width / 2, 2 * p.T + fit, width), { rot: angle }));
        const n = 96, r = hub + 5 * p.T;
        const ring = (rad: number) => Array.from({ length: n }, (_, i) => [rad * Math.cos(i * 2 * Math.PI / n), rad * Math.sin(i * 2 * Math.PI / n)] as [number, number]);
        parts.push({ id: 'rib-hub', name: through ? 'Radial support ring (the object stands inside it)' : 'Radial support hub', outer: ring(r), holes: through ? [...slots, ring(centerHole / 2).reverse()] : slots, place: { x: 0, y: 0, z: -foot - p.T } });
    }
    return { parts, joints };
}
/** Handles use short tabs through the rim, with shoulders resting on its upper face. */
export function handleAssembly(p: PopupParams, ring: Ring, holes: Contour[]) {
    const parts: GenPart[] = [], slots: Contour[] = [];
    let rotation: number | undefined;
    for (let angle = 0; angle < 180; angle += 5) {
        const test: Contour[] = [];
        let valid = true;
        for (const sign of [-1, 1]) {
            const o = crossings(ring.outer, angle), inner = ring.inner ? crossings(ring.inner, angle) : [0, 0], u = (o[sign > 0 ? 1 : 0] + inner[sign > 0 ? 1 : 0]) / 2;
            const slot = transform(rect(u - (2 * p.T + p.support.fit) / 2, -(p.T + p.support.fit) / 2, 2 * p.T + p.support.fit, p.T + p.support.fit), { rot: angle });
            if (area(differenceShapes([slot], differenceShapes([ring.outer], ring.inner ? [ring.inner] : []).flatMap(s => [s.outer, ...s.holes]))) > .001 || area(intersectShapes([slot], holes)) > .001) {
                valid = false;
                break;
            }
            test.push(slot);
        }
        if (valid) {
            rotation = angle;
            slots.push(...test);
            break;
        }
    }
    if (rotation === undefined)
        throw Error('Handles need a wider, clear outer rim. Increase rim width.');
    for (const sign of [-1, 1]) {
        const a = rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), o = crossings(ring.outer, rotation), inside = ring.inner ? crossings(ring.inner, rotation) : [0, 0], u = (o[sign > 0 ? 1 : 0] + inside[sign > 0 ? 1 : 0]) / 2, z = ring.height + p.T;
        const hw = Math.max(8, 2 * p.T), hh = Math.max(30, 4 * p.T), inset = Math.max(4, p.T);
        const sh = unionShapes([rect(-hw, -z - hh, 2 * hw, hh), rect(-p.T, -z, 2 * p.T, p.T)]);
        parts.push({ id: `handle-${sign}`, name: 'Rim handle (glue after dry-fit)', outer: sh[0].outer, holes: [rect(-hw + inset, -z - hh + Math.max(5, p.T), 2 * (hw - inset), hh - 2 * Math.max(6, p.T))], place: { x: 0, y: 0, z: 0, m: [c, 0, -s, c * u + s * p.T / 2, s, 0, c, s * u - c * p.T / 2, 0, -1, 0, 0] } });
    }
    return { parts, slots };
}
/** Coordinates and knot distances follow actual contours, including non-circular outlines. */
export function suspensionLayout(p: PopupParams, rings: Ring[], holes: Contour[], opening: number) {
    for (let offset = 0; offset < 120; offset += 5) {
        const positions: {
            ring: number;
            x: number;
            y: number;
            z: number;
            cord: number;
        }[] = [], slots: Contour[] = [];
        let valid = true;
        for (let i = 0; i < rings.length && valid; i++)
            for (let cord = 0; cord < 3; cord++) {
                const angle = offset + cord * 120, r = rings[i], a = crossings(r.outer, angle)[1], b = r.inner ? crossings(r.inner, angle)[1] : opening / 2;
                let found = false;
                for (const t of [.5, .4, .6]) {
                    const rad = b + (a - b) * t, x = rad * Math.cos(angle * Math.PI / 180), y = rad * Math.sin(angle * Math.PI / 180), n = 32, rr = p.support.cordDiameter / 2 + .5;
                    const clear: Contour = Array.from({ length: n }, (_, j) => [x + rr * Math.cos(j * 2 * Math.PI / n), y + rr * Math.sin(j * 2 * Math.PI / n)]);
                    if (area(differenceShapes([clear], differenceShapes([r.outer], r.inner ? [r.inner] : []).flatMap(s => [s.outer, ...s.holes]))) > .001 || area(intersectShapes([clear], holes)) > .001)
                        continue;
                    slots.push(clear.map(([px, py]) => [x + (px - x) * (rr - .5) / rr, y + (py - y) * (rr - .5) / rr]));
                    positions.push({ ring: i, x, y, z: r.height, cord });
                    found = true;
                    break;
                }
                if (!found) {
                    valid = false;
                    break;
                }
            }
        if (valid)
            return { positions, slots };
    }
    throw Error('Suspension holes cannot clear the ring edges and cuts. Widen rings/centre or reduce cord diameter.');
}
/** Coupon stock remains wide enough even at the upper supported thickness bound. */
export function jointCoupons(p:PopupParams):GenPart[]{const w=Math.max(30,4*p.T+10),h=Math.max(24,3*p.T),slot=p.T+p.support.fit,c=w/2;return [
 {id:'fit-slot',name:'Joint coupon: slot',place:{x:p.outline.width+20,y:0,z:0},outer:rect(0,0,w,h),holes:[rect(c-(2*p.T+p.support.fit)/2,h/2-slot/2,2*p.T+p.support.fit,slot)]},
 {id:'fit-tab',name:'Joint coupon: tab',place:{x:p.outline.width+30+w,y:0,z:0},outer:[[0,0],[c-p.T,0],[c-p.T,-p.T],[c+p.T,-p.T],[c+p.T,0],[w,0],[w,Math.max(18,2*p.T)],[0,Math.max(18,2*p.T)]],holes:[]}
];}
