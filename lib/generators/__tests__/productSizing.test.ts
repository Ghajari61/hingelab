import { it, expect } from "vitest";
import { POPUP } from "../popup";
import { modeDefaults } from "../popup/params";
import { QR } from "../qr";
import { CTX } from "./ctx";
it("switching to sleeve mode leaves enough material around the object opening",()=>{
 const p=modeDefaults(POPUP.defaults(),"sleeve");
 expect(p.rings.center).toBeGreaterThan(p.extras.sleeveDiameter+2*p.T);
 expect(POPUP.build(p,CTX).error).toBeUndefined();
});
it("scaling a connected pop-up blank requires an explicit choice",()=>{
 const p=POPUP.merge({outline:{width:700,height:700}});
 const issue=POPUP.check(p,POPUP.build(p,CTX)).find(i=>i.code==="popup-bed");
 expect(issue).toBeDefined();expect(issue!.fixes[0].safe).toBe(false);
});
it("enlarging a QR symbol requires an explicit choice",()=>{
 const p=QR.merge({code:{size:10}});
 const issue=QR.check(p,QR.build(p,CTX)).find(i=>i.code==="SMALL_MODULES");
 expect(issue).toBeDefined();expect(issue!.fixes[0].safe).toBe(false);
});
