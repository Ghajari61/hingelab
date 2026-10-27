import { readPhotoRequest, PhotoInputError } from "@/lib/photoproduct/request";
import { NextResponse, type NextRequest } from "next/server";
import { currentPlan } from "@/lib/billing/plan";
import { aiAllowance, aiConfigured, aiLimitMessage } from "@/lib/ai/request";
import { declaredLength, isCrossSite, isJSONRequest, siteOrigins } from "@/lib/security/request";
import { MAX_PHOTO_BODY } from "@/lib/photoproduct/contracts";
import { analyzeProductPhotos, PhotoAnalysisError } from "@/lib/photoproduct/analyze";
export const maxDuration=120;
const json=(body:unknown,status=200,headers:Record<string,string>={})=>NextResponse.json(body,{status,headers:{"cache-control":"no-store",...headers}});
export async function POST(request:NextRequest){
 if(isCrossSite(request,siteOrigins()))return json({error:"Cross-site requests are not allowed."},403);
 if(!isJSONRequest(request))return json({error:"Send JSON."},415);
 if((declaredLength(request)??0)>MAX_PHOTO_BODY)return json({error:"The photo set is too large."},413);
 const {plan,userId}=await currentPlan();if(!userId)return json({error:"Sign in to analyze product photos."},401);
 if(!aiConfigured())return json({error:"Photo analysis is not configured on this server."},503);
 let input;try{input=await readPhotoRequest(request);}catch(e){return json({error:e instanceof Error?e.message:"Invalid photo set."},e instanceof PhotoInputError?e.status:400);}
 const allowance=await aiAllowance(plan,userId);if(!allowance.ok)return json({error:aiLimitMessage(plan,allowance.daily)},429,{"retry-after":String(Math.max(1,allowance.retryAfter))});
 try{return json(await analyzeProductPhotos(input,userId,{signal:request.signal}));}catch(e){return json({error:e instanceof PhotoAnalysisError?e.message:"Product analysis could not be completed."},e instanceof PhotoAnalysisError?e.status:500);}
}
