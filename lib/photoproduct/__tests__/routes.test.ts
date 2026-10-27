import {beforeEach,describe,it,expect,vi} from "vitest";
import {NextRequest} from "next/server";
import {Resvg} from "@resvg/resvg-js";
import {createHash} from "node:crypto";
vi.mock("@/lib/billing/plan",()=>({currentPlan:vi.fn()}));
vi.mock("@/lib/ai/request",()=>({aiAllowance:vi.fn(),aiConfigured:vi.fn(),aiLimitMessage:()=>"AI allowance reached."}));
vi.mock("@/lib/desktop/http",()=>({requireDesktopUser:vi.fn(),desktopJSON:(body:unknown,status=200)=>Response.json(body,{status}),desktopError:(code:string,message:string,status:number)=>Response.json({error:code,message},{status})}));
vi.mock("@/lib/desktop/session",()=>({desktopPlan:vi.fn()}));
vi.mock("@/lib/photoproduct/analyze",()=>({analyzeProductPhotos:vi.fn(),PhotoAnalysisError:class extends Error{status=502;}}));
import {currentPlan} from "@/lib/billing/plan";
import {aiAllowance,aiConfigured} from "@/lib/ai/request";
import {requireDesktopUser} from "@/lib/desktop/http";
import {desktopPlan} from "@/lib/desktop/session";
import {analyzeProductPhotos} from "../analyze";
import {POST as webPOST} from "@/app/api/ai/photoproduct/route";
import {POST as desktopPOST} from "@/app/api/desktop/photoproduct/route";
const bytes=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/>',{font:{loadSystemFonts:false}}).render().asPng();
const photo={id:"test-photo",name:"view.png",data:"data:image/png;base64,"+Buffer.from(bytes).toString("base64"),width:64,height:64,digest:createHash("sha256").update(bytes).digest("hex")};
const body={photos:[photo],note:"",measurements:{width:0,depth:0,height:0,thickness:0}};
const request=(data:unknown=body,headers:Record<string,string>={})=>new NextRequest("https://hingelab.test/api/ai/photoproduct",{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(data)});
beforeEach(()=>{
 vi.clearAllMocks();vi.mocked(currentPlan).mockResolvedValue({plan:"pro",userId:"test"});vi.mocked(aiConfigured).mockReturnValue(true);
 vi.mocked(aiAllowance).mockResolvedValue({ok:true,remaining:1,retryAfter:0} as Awaited<ReturnType<typeof aiAllowance>>);
 vi.mocked(requireDesktopUser).mockResolvedValue({userId:"test",sessionId:"session"});vi.mocked(desktopPlan).mockResolvedValue("pro");
 vi.mocked(analyzeProductPhotos).mockResolvedValue({analysis:{family:"unsupported"} as Awaited<ReturnType<typeof analyzeProductPhotos>>["analysis"],provider:"mock"});
});
describe("photo-analysis route boundaries",()=>{
 it("requires web sign-in and blocks cross-site requests before any model call",async()=>{
  expect((await webPOST(request(body,{origin:"https://attacker.test"}))).status).toBe(403);
  vi.mocked(currentPlan).mockResolvedValue({plan:"free",userId:null});expect((await webPOST(request())).status).toBe(401);
  expect(analyzeProductPhotos).not.toHaveBeenCalled();
 });
 it("rejects wrong content type, oversized declarations and a sixth photo before charging allowance",async()=>{
  expect((await webPOST(request(body,{"content-type":"text/plain"}))).status).toBe(415);
  expect((await webPOST(request(body,{"content-length":"3000000"}))).status).toBe(413);
  expect((await webPOST(request({...body,photos:Array.from({length:6},(_,i)=>({...photo,id:"p"+i}))}))).status).toBe(400);
  expect(aiAllowance).not.toHaveBeenCalled();expect(analyzeProductPhotos).not.toHaveBeenCalled();
 });
 it("uses the existing AI allowance and does not leak provider errors",async()=>{
  vi.mocked(aiAllowance).mockResolvedValue({ok:false,remaining:0,retryAfter:10} as Awaited<ReturnType<typeof aiAllowance>>);
  expect((await webPOST(request())).status).toBe(429);expect(analyzeProductPhotos).not.toHaveBeenCalled();
  vi.mocked(aiAllowance).mockResolvedValue({ok:true,retryAfter:0} as Awaited<ReturnType<typeof aiAllowance>>);vi.mocked(analyzeProductPhotos).mockRejectedValue(new Error("private provider credentials"));
  const response=await webPOST(request());expect(response.status).toBe(500);expect(await response.text()).not.toContain("credentials");
 });
 it("accepts valid web input and forwards its abort signal",async()=>{
  const req=request();expect((await webPOST(req)).status).toBe(200);expect(analyzeProductPhotos).toHaveBeenCalledWith(expect.objectContaining({photos:[photo]}),"test",{signal:req.signal});
 });
 it("requires desktop authentication and shares the same validated request format",async()=>{
  vi.mocked(requireDesktopUser).mockResolvedValueOnce(Response.json({error:"unauthorized"},{status:401}));expect((await desktopPOST(request())).status).toBe(401);
  expect(analyzeProductPhotos).not.toHaveBeenCalled();expect((await desktopPOST(request())).status).toBe(200);expect(analyzeProductPhotos).toHaveBeenCalledTimes(1);
 });
});
