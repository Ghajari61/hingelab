import {it,expect} from 'vitest';
import{POPUP}from'../popup';import{popupGeometry}from'../popup/build';import{mergePopup}from'../popup/params';import{placePoint}from'../place';import{pointInContour}from'../geom';
it('every ring has real tabs entering matching blank slots at the same height',()=>{
 const p=mergePopup({});const g=popupGeometry(p);const blank=g.parts[0];
 for(const r of g.rings){let tabs=0;for(const rib of g.parts.filter(v=>v.id.startsWith('rib-')&&v.id!=='rib-hub')){
  for(let x=-p.outline.width/2;x<p.outline.width/2;x+=.5){if(!pointInContour([x,-r.height-p.T/2],rib.outer)||rib.holes.some(h=>pointInContour([x,-r.height-p.T/2],h)))continue;
   const world=placePoint(rib.place!,x,-r.height-p.T/2,p.T/2);if(!pointInContour([world[0],world[1]],r.outer)||r.inner&&pointInContour([world[0],world[1]],r.inner))continue;
   expect(blank.holes.some(h=>pointInContour([world[0],world[1]],h)),'tab intersects uncut ring').toBe(true);tabs++;
  }
 }expect(tabs,'ring must positively locate on its support').toBeGreaterThan(0);}
});
it('a spiral cannot claim a precision ring-seat assembly',()=>{expect(POPUP.build(mergePopup({pattern:{kind:'spiral'}}),{}).error).toMatch(/spiral|ring/i);});
import{POPUP_PRESETS}from'../popup/presets';import{CTX}from'./ctx';
function row(c:number[][],y:number){const xs:number[]=[];for(let i=0;i<c.length;i++){const a=c[i],b=c[(i+1)%c.length];if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}return xs.sort((a,b)=>a-b);}
for(const preset of POPUP_PRESETS)it(`${preset.id}: tabs and support solids do not collide with assembled rings`,()=>{
 const p=POPUP.merge(preset.params),g=popupGeometry(p,CTX),b=g.parts[0],ribs=g.parts.filter(v=>/^rib-\d/.test(v.id));
 if(!ribs.length){expect(p.support.kind).toBe('cords');return;}
 for(const ring of g.rings){let contacts=0;for(const rib of ribs){const y=-ring.height-p.T/2;const xs=[...row(rib.outer,y),...rib.holes.flatMap(h=>row(h,y))].sort((a,b)=>a-b);
  for(let i=0;i<xs.length-1;i++){const u=(xs[i]+xs[i+1])/2;if(!pointInContour([u,y],rib.outer)||rib.holes.some(h=>pointInContour([u,y],h)))continue;
   const xyz=placePoint(rib.place!,u,y,p.T/2),xy:[number,number]=[xyz[0],xyz[1]];
   if(!pointInContour(xy,ring.outer)||ring.inner&&pointInContour(xy,ring.inner))continue;
   expect(b.holes.some(h=>pointInContour(xy,h)),`${rib.id} at ring ${ring.height}`).toBe(true);contacts++;
   for(const edge of [xs[i]+.01,u,xs[i+1]-.01])for(const t of [.01,p.T-.01]){const q=placePoint(rib.place!,edge,y,t);expect(b.holes.some(h=>pointInContour([q[0],q[1]],h)),'full stock thickness must fit').toBe(true);}
  }
 }expect(contacts,'each ring needs positive locating tabs').toBeGreaterThanOrEqual(ribs.length);}
},20000);
it('joint coupons use the same clearance as production slots',()=>{const p=mergePopup({T:4,support:{fit:.2,coupon:true}}),out=POPUP.build(p,{});expect(out.error).toBeUndefined();const slot=out.parts.find(v=>v.id==='fit-slot')!.holes[0];expect(Math.max(...slot.map(v=>v[1]))-Math.min(...slot.map(v=>v[1]))).toBeCloseTo(4.2);expect(out.parts.some(v=>v.id==='fit-tab')).toBe(true);});
it('rejects rings too narrow to leave material beside a matching slot',()=>{expect(POPUP.build(mergePopup({T:6,rings:{center:15,rim:5,width:5}}),{}).error).toMatch(/joint layout/);});
it('matching joints rebuild at measured stock thicknesses and clearances',()=>{for(const T of [2,3,4,6])for(const fit of [0,.15,.4]){const p=mergePopup({T,support:{fit},rings:{width:18,center:65,rim:18}});expect(POPUP.build(p,{}).error,`${T}/${fit}`).toBeUndefined();}},20000);
it('all suspension holes occur in the actual 3D ring pieces, including the centre',()=>{const p=mergePopup({mode:'hanging',support:{kind:'cords'},outline:{shape:'snowflake'},rings:{width:12,center:40}}),g=popupGeometry(p);expect(g.suspension!.positions.length).toBe(g.rings.length*3);for(const at of g.suspension!.positions){expect(g.parts[0].holes.some(h=>pointInContour([at.x,at.y],h))).toBe(true);const views=g.parts[0].views3d!.filter(v=>v.place.z===at.z);expect(views.some(v=>v.holes.some(h=>pointInContour([at.x,at.y],h)))).toBe(true);}});
import{unplacePoint}from'../place';import{ribFoot}from'../popup/build';
it('crossed ribs have complementary half-laps through their stock thickness',()=>{const p=mergePopup({}),g=popupGeometry(p),ribs=g.parts.filter(v=>/^rib-\d/.test(v.id));for(const z of [-ribFoot(p)*.25,-ribFoot(p)*.75]){const solid=ribs.filter(r=>{const q=unplacePoint(r.place!,[0,0,z]);return pointInContour([q[0],q[1]],r.outer)&&!r.holes.some(h=>pointInContour([q[0],q[1]],h));});expect(solid).toHaveLength(1);}});
it('radial rib bottom tabs enter the matching hub slots',()=>{for(const ribs of [3,4]){const p=mergePopup({support:{ribs}}),g=popupGeometry(p),hub=g.parts.find(v=>v.id==='rib-hub')!;for(const rib of g.parts.filter(v=>/^rib-\d/.test(v.id))){const at=placePoint(rib.place!,4*p.T,ribFoot(p)+p.T/2,p.T/2);expect(at[2]).toBeCloseTo(hub.place!.z+p.T/2);expect(hub.holes.some(h=>pointInContour([at[0],at[1]],h))).toBe(true);}}});
import{handleAssembly}from'../popup/supports';import{ringPlan}from'../popup/build';
it('thick-stock handle shoulders are wider than their tabs',()=>{const p=mergePopup({T:10,outline:{width:400,height:400},rings:{rim:40,center:100,width:30}}),r=ringPlan(p).rings[0],h=handleAssembly(p,r,[]).parts[0];const shoulder=row(h.outer,-r.height-p.T-1),tab=row(h.outer,-r.height-p.T/2);expect(shoulder.at(-1)!-shoulder[0]).toBeGreaterThan(tab.at(-1)!-tab[0]+p.support.fit);});
import{jointCoupons}from'../popup/supports';
it('coupon holes retain surrounding stock at 20 mm thickness',()=>{const [slot]=jointCoupons(mergePopup({T:20}));for(const pt of slot.holes[0])expect(pointInContour(pt,slot.outer)).toBe(true);});
