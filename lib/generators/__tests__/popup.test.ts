import {describe,it,expect} from 'vitest';
import {POPUP} from '../popup';
import {mergePopup} from '../popup/params';
import {popupGeometry,tiltDepth,profileHeight} from '../popup/build';
import {cutPart} from '../output';
describe('Pop-up construction',()=>{
 it('keeps a single bridged cutting blank and places the released rigid rings',()=>{const p=mergePopup({});const g=popupGeometry(p);expect(g.rings.length).toBeGreaterThan(3);expect(g.parts[0].holes.length).toBeGreaterThan(g.rings.length);expect(g.parts[0].views3d?.every(v=>!v.frames&&v.apart&&v.place.m)).toBe(true);});
 it('computes tilted drop and mode profiles',()=>{expect(tiltDepth(10,.2,5)).toBeCloseTo(10*.2/Math.tan(5*Math.PI/180));expect(profileHeight(mergePopup({mode:'tower'}),0)).toBeGreaterThan(profileHeight(mergePopup({mode:'tower'}),1));});
 it('nominal paths receive kerf once through shared exporter',()=>{const p=mergePopup({});const part=POPUP.build(p,{}).parts[0];expect(cutPart(part,.15).bbox.x1).toBeGreaterThan(cutPart(part,0).bbox.x1);});
});
import {POPUP_PRESETS} from '../popup/presets';
import {CTX} from './ctx';
import {arrangeGenerator,genSVG} from '../output';
import {createHash} from 'node:crypto';
import {signedArea} from '../geom';
const finite=(c:number[][])=>c.every(p=>p.length===2&&p.every(Number.isFinite));
function crosses(c:number[][]){const orient=(a:number[],b:number[],d:number[])=>(b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0]);for(let i=0;i<c.length;i++)for(let j=i+2;j<c.length;j++){if(i===0&&j===c.length-1)continue;const a=c[i],b=c[(i+1)%c.length],d=c[j],e=c[(j+1)%c.length];if(orient(a,b,d)*orient(a,b,e)<-1e-8&&orient(d,e,a)*orient(d,e,b)<-1e-8)return true;}return false;}
describe('Pop-up preset cut files',()=>{for(const pr of POPUP_PRESETS)it(pr.name,()=>{const p=POPUP.merge(pr.params),out=POPUP.build(p,CTX);expect(out.error).toBeUndefined();expect(out.notice).toBeUndefined();expect(out.parts.length).toBeGreaterThan(0);for(const pt of out.parts)for(const c of [pt.outer,...pt.holes]){expect(finite(c)).toBe(true);expect(Math.abs(signedArea(c))).toBeGreaterThan(0);expect(crosses(c),pt.id).toBe(false);}const a=arrangeGenerator(POPUP,p,CTX);expect(a.lay).toBeTruthy();const svg=genSVG(POPUP,p,a.lay!);expect(svg).not.toMatch(/NaN|Infinity/);expect(svg).toContain('mm');expect(createHash('sha256').update(svg).digest('hex')).toMatchSnapshot();},20000);});
it('bridge lands preserve one connected blank and ring count is linked',()=>{const p=mergePopup({rings:{by:'count',count:10}}),g=popupGeometry(p);expect(g.rings.length).toBe(10);expect(g.notches.every(n=>g.rings.some(r=>r.height===n.height))).toBe(true);});
it('Persian shaping produces outlines without missing glyphs',()=>{const out=POPUP.build(mergePopup({engraving:{text:'نوروز مبارک'}}),CTX);expect(out.notice).toBeUndefined();expect(out.missing).toEqual([]);expect(out.parts[0].engrave!.length).toBeGreaterThan(0);});
it('invalid geometry inputs fail closed',()=>{for(const raw of [{outline:{sides:1e9}},{profile:{depth:NaN}},{rings:{gap:.1}},{outline:{shape:'custom',path:'M0 0L10 0L10 10'}}])expect(POPUP.build(mergePopup(raw),CTX).error).toBeTruthy();});
import {unionShapes} from '@/lib/letters/polygon';
it('default bridges keep the cut blank connected',()=>{const out=POPUP.build(mergePopup({}),CTX),b=out.parts[0];expect(unionShapes([b.outer,...b.holes],[],true).length).toBe(1);});
it('nested set yields distinct non-overlapping annular blanks',()=>{const p=mergePopup({sets:{count:3,scale:.6}}),out=POPUP.build(p,CTX);expect(out.error).toBeUndefined();const b=out.parts[0],islands=unionShapes([b.outer,...b.holes],[],true);expect(islands.length).toBe(3);for(let i=0;i<islands.length;i++)for(let j=i+1;j<islands.length;j++){expect(islands[i].holes.length+islands[j].holes.length).toBeGreaterThan(0);}});
it('all outline families offset or report collapsed geometry without broken paths',()=>{for(const shape of ['circle','ellipse','rounded','polygon','star','heart','flower','leaf','pumpkin','snowflake']){const out=POPUP.build(mergePopup({outline:{shape},rings:{center:shape==='leaf'?25:35,rim:12,width:12}}),CTX);expect(out.error,shape).toBeUndefined();expect(out.parts[0].holes.every(finite)).toBe(true);}});
it('custom curve and segmented settings change geometry',()=>{const a=POPUP.build(mergePopup({}),CTX),b=POPUP.build(mergePopup({pattern:{segmented:true},profile:{kind:'custom',curve:'0,0;0.5,0.8;1,1'}}),CTX);expect(b.error).toBeUndefined();expect(b.parts[0].holes).not.toEqual(a.parts[0].holes);expect(b.parts[0].views3d?.at(2)?.place.z).not.toEqual(a.parts[0].views3d?.at(2)?.place.z);});
it('two crossed ribs and three/four radial ribs stay single connected parts',()=>{for(const count of [2,3,4]){const out=POPUP.build(mergePopup({support:{ribs:count}}),CTX);expect(out.error).toBeUndefined();const ribs=out.parts.filter(p=>p.id.startsWith('rib-')&&p.id!=='rib-hub');expect(ribs.length).toBe(count);for(const r of ribs)expect(unionShapes([r.outer,...r.holes],[],true).length).toBe(1);expect(out.parts.some(p=>p.id==='rib-hub')).toBe(count>2);}});
it('assembly card has shaped instructions and score diagram',()=>{const out=POPUP.build(mergePopup({sets:{assemblyCard:true}}),CTX);expect(out.error).toBeUndefined();const card=out.parts.find(p=>p.id==='assembly-card')!;expect(card.engrave!.length).toBeGreaterThan(0);expect(card.score!.length).toBeGreaterThan(0);});
it('every rib stays one piece on lopsided and concave outlines',()=>{for(const outline of [{shape:'heart'},{shape:'star',points:5},{shape:'polygon',sides:3},{shape:'polygon',sides:4,corner:0},{shape:'pumpkin'},{shape:'snowflake'}]){for(const mode of ['bowl','tower']){const out=POPUP.build(mergePopup({mode,outline,profile:{depth:mode==='tower'?160:40}}),CTX);expect(out.error,JSON.stringify(outline)).toBeUndefined();const ribs=out.parts.filter(p=>p.id.startsWith('rib-')&&p.id!=='rib-hub');expect(ribs.map(r=>r.id),`${mode} ${JSON.stringify(outline)}`).toEqual(['rib-1-0','rib-2-0']);}}});
it('a tiered stand rises to its centre like a tower',()=>{const p=mergePopup({mode:'tiered',profile:{kind:'pagoda',tiers:3,depth:150}});expect(profileHeight(p,0)).toBeCloseTo(150);expect(profileHeight(p,1)).toBeCloseTo(0);const z=POPUP.build(p,CTX).parts[0].views3d!.map(v=>v.place.z);expect(new Set(z.map(v=>Math.round(v))).size).toBe(3);});
it('3D pieces carry their open placement, so thumbnails show the open form',()=>{const out=POPUP.build(mergePopup({mode:'hanging',support:{kind:'cords'},profile:{depth:120}}),CTX);for(const v of out.parts[0].views3d!){expect(v.frames).toBeUndefined();expect(v.place.m![11]).toBeCloseTo(v.place.z);}});
it('supports that set every ring height ask for snapped bridges instead of warning about strain',()=>{for(const kind of ['ribs','post','cords']){const p=mergePopup({mode:'tower',support:{kind},profile:{depth:220}}),issues=POPUP.check(p,POPUP.build(p,CTX)).map(i=>i.code);expect(issues,kind).toContain('popup-snap-bridges');expect(issues,kind).not.toContain('popup-strain');expect(issues,kind).not.toContain('popup-support');}const h=mergePopup({support:{kind:'handles'},profile:{depth:220}});expect(POPUP.check(h,POPUP.build(h,CTX)).map(i=>i.code)).toContain('popup-snap-bridges');});
it('cords list the knot spacing from ring to ring',()=>{const out=POPUP.build(mergePopup({mode:'hanging',support:{kind:'cords'},profile:{kind:'linear',depth:100}}),CTX);const s=out.stats.find(q=>q.label==='Knot spacing')!;expect(s.value).toMatch(/^\d+( to \d+)? mm$/);expect(out.assembly!.join(' ')).toMatch(/knot/);});
it('every preset opens without a warning except the LED reminder',()=>{for(const pr of POPUP_PRESETS){const p=POPUP.merge(pr.params),issues=POPUP.check(p,POPUP.build(p,CTX));expect(issues.filter(i=>i.level!=='info'&&i.code!=='popup-led').map(i=>i.code),pr.id).toEqual([]);}},60000);

import {ringPlan} from '../popup/build';
import type {Hardware3D} from '../types';
import {bboxOf} from '../geom';
const presetP=(id:string)=>POPUP.merge(POPUP_PRESETS.find(x=>x.id===id)!.params);
const step=(p:ReturnType<typeof mergePopup>)=>{const g=ringPlan(p);let s=0;for(let i=0;i+1<g.rings.length;i++)s=Math.max(s,Math.abs(g.rings[i].height-g.rings[i+1].height));return s;};
describe('Pop-up engineering and 3D',()=>{
 it('a dome is a spherical cap: the wall reaches 65 degrees at the rim, not vertical',()=>{const p=mergePopup({profile:{kind:'dome',depth:100}});const dz=profileHeight(p,1)-profileHeight(p,.98);expect(dz).toBeLessThan(10);expect(profileHeight(p,1)).toBeCloseTo(100,6);expect(profileHeight(p,0)).toBeCloseTo(0,6);});
 it('varied rings are spaced along the slope, so steep parts get narrower rings and smaller steps',()=>{const p=mergePopup({mode:'hanging',support:{kind:'cords'},profile:{kind:'bell',depth:200},rings:{width:10}});expect(step({...p,rings:{...p.rings,variable:true}})).toBeLessThan(step(p));});
 it('bowl presets leave no wall slit taller than 12 mm',()=>{for(const pr of POPUP_PRESETS){const p=POPUP.merge(pr.params);if(p.mode!=='bowl'||p.extras.plantSeat||p.profile.kind==='pagoda')continue;expect(step(p)-p.T,pr.id).toBeLessThanOrEqual(12);}});
 it('hanging designs show three cords through every cord hole, gathered at a hanging ring, with a knot under each ring',()=>{const p=presetP('bell-pendant'),out=POPUP.build(p,CTX),hw=out.hardware!;const g=popupGeometry(p,CTX);const cords=hw.filter((h):h is Extract<Hardware3D,{kind:'cord'}>=>h.kind==='cord'&&h.d<5);expect(cords).toHaveLength(3);for(const q of g.suspension!.positions)expect(cords[q.cord].pts.some(([x,y,z])=>Math.hypot(x-q.x,y-q.y)<1e-6&&Math.abs(z-(q.z+p.T/2))<1e-6)).toBe(true);expect(hw.filter(h=>h.kind==='knot')).toHaveLength(g.suspension!.positions.length);const ring=hw.find(h=>h.kind==='ring')!;expect(ring.kind==='ring'&&ring.at[2]).toBeGreaterThan(Math.max(...g.rings.map(r=>r.height)));expect(hw.some(h=>h.kind==='bulb')).toBe(true);});
 it('an LED bulb clears the ring under the centre disc on every lamp preset',()=>{for(const id of ['scandinavian-spiral-pendant-e27','bell-pendant','table-lamp-shade']){const p=presetP(id);expect(p.rings.center,id).toBeGreaterThanOrEqual(80);}expect(POPUP.check(mergePopup({mode:'hanging',support:{kind:'cords'},rings:{center:55},extras:{socket:'E27'},profile:{depth:150}}),POPUP.build(mergePopup({mode:'hanging',support:{kind:'cords'},rings:{center:55},extras:{socket:'E27'},profile:{depth:150}}),CTX)).map(i=>i.code)).toContain('popup-bulb');});
 it('nested sizes stand side by side in 3D instead of inside each other',()=>{const p=presetP('kids-nursery-mobile'),out=POPUP.build(p,CTX);const views=out.parts[0].views3d!;const xs=views.map(v=>{const b=bboxOf([v.outer]);return [b.x0+v.place.m![3],b.x1+v.place.m![3]];});const groups=[...new Set(views.map(v=>Math.round(v.place.m![3])))].sort((a,b)=>a-b);expect(groups.length).toBe(3);const span=(dx:number)=>{const g=xs.filter((_,i)=>Math.round(views[i].place.m![3])===dx);return [Math.min(...g.map(v=>v[0])),Math.max(...g.map(v=>v[1]))];};for(let i=1;i<groups.length;i++)expect(span(groups[i])[0]).toBeGreaterThan(span(groups[i-1])[1]);});
 it('a vase sleeve stands on radial ribs round an open ring, nothing crosses the opening',()=>{const p=presetP('vase-sleeve'),out=POPUP.build(p,CTX);expect(out.error).toBeUndefined();const hub=out.parts.find(v=>v.id==='rib-hub')!;expect(hub.holes.some(h=>Math.abs(Math.max(...h.map(q=>Math.hypot(q[0],q[1])))-p.extras.sleeveDiameter/2)<.5)).toBe(true);for(const r of out.parts.filter(v=>/^rib-\d/.test(v.id)))expect(Math.min(...r.outer.map(q=>q[0])),r.id).toBeGreaterThan(p.extras.sleeveDiameter/2);expect(profileHeight(p,1)).toBeGreaterThanOrEqual(150);});
 it('a finial stands on a tab through a slot in the top disc; a base goes on the floor under ribs',()=>{const p=presetP('pagoda-tower-decor'),out=POPUP.build(p,CTX);const f=out.parts.find(v=>v.id==='finial')!;expect(Math.max(...f.outer.map(q=>q[1]))).toBeCloseTo(p.T,6);expect(out.parts[0].holes.some(h=>{const b=bboxOf([h]);return Math.abs(b.x0+b.x1)<1e-6&&Math.abs(b.x1-b.x0-(2*p.T+p.support.fit))<1e-6;})).toBe(true);const b=POPUP.build(mergePopup({extras:{base:true}}),CTX).parts.find(v=>v.id==='base')!;expect(b.place!.z).toBeLessThan(0);});
});

import { lighten } from "../popup/supports";
import { distToContour } from "../geom";
describe("Pop-up ribs are one solid frame", () => {
  it("has no slit narrower than the stock anywhere in a rib (they were combs of 9 mm strips)", () => {
    for (const pr of POPUP_PRESETS) {
      const p = POPUP.merge(pr.params), out = POPUP.build(p, CTX);
      for (const rib of out.parts.filter((x) => /^rib-\d/.test(x.id))) {
        const o = rib.outer;
        for (let i = 0; i < o.length; i++) {
          const a = o[i], b = o[(i + 1) % o.length], c = o[(i + 2) % o.length], d = o[(i + 3) % o.length];
          // a narrow U: down a long edge, a short step across, back up a long edge
          const slit = Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(c[0] - d[0]) < 1e-6 && Math.abs(c[1] - b[1]) < 1e-6 && Math.abs(c[0] - b[0]) < p.T
            && Math.abs(b[1] - a[1]) > 5 && Math.abs(d[1] - c[1]) > 5 && Math.sign(b[1] - a[1]) !== Math.sign(d[1] - c[1]);
          expect(slit, `${pr.id} ${rib.id} at x=${a[0].toFixed(1)}`).toBe(false);
        }
      }
    }
  }, 240000);
  it("lightens tall ribs with windows that keep a frame of at least 4 T round every edge", () => {
    for (const id of ["cupcake-tower-3-tiers", "spiral-christmas-tree-with-star", "pyramid", "vase-sleeve"]) {
      const p = POPUP.merge(POPUP_PRESETS.find((x) => x.id === id)!.params), out = POPUP.build(p, CTX);
      const ribs = out.parts.filter((x) => /^rib-\d/.test(x.id));
      expect(ribs.every((r) => r.holes.length > 0), id).toBe(true);
      const band = Math.max(10, 4 * p.T);
      for (const r of ribs) for (const h of r.holes) for (const q of h) expect(distToContour(q, r.outer), id).toBeGreaterThan(band - .5);
    }
    // a low bowl rib stays solid
    const bowl = POPUP.build(POPUP.merge(POPUP_PRESETS.find((x) => x.id === "nut-snack-bowl")!.params), CTX);
    expect(bowl.parts.filter((x) => /^rib-\d/.test(x.id)).every((r) => r.holes.length === 0)).toBe(true);
    expect(lighten([], 3)).toEqual([]);
  }, 240000);
});
