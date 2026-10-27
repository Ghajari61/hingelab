import { readPhotoRequest, PhotoInputError } from "@/lib/photoproduct/request";
import { desktopJSON, desktopError, requireDesktopUser } from "@/lib/desktop/http";
import { desktopPlan } from "@/lib/desktop/session";
import { aiAllowance, aiConfigured, aiLimitMessage } from "@/lib/ai/request";
import { declaredLength, isJSONRequest } from "@/lib/security/request";
import { MAX_PHOTO_BODY } from "@/lib/photoproduct/contracts";
import { analyzeProductPhotos, PhotoAnalysisError } from "@/lib/photoproduct/analyze";
export const maxDuration=180;
export async function POST(request:Request){
 const who=await requireDesktopUser(request);if(who instanceof Response)return who;
 if(!isJSONRequest(request))return desktopError("invalid","Send JSON.",415);
 if((declaredLength(request)??0)>MAX_PHOTO_BODY)return desktopError("invalid","The photo set is too large.",413);
 if(!aiConfigured())return desktopError("unavailable","Photo analysis is not configured on this server.",503);
 let input;try{input=await readPhotoRequest(request);}catch(e){return desktopError("invalid",e instanceof Error?e.message:"Invalid photo set.",e instanceof PhotoInputError?e.status:400);}
 const plan=await desktopPlan(who.userId),allowance=await aiAllowance(plan,who.userId);
 if(!allowance.ok)return desktopError("invalid",aiLimitMessage(plan,allowance.daily),429,{"retry-after":String(Math.max(1,allowance.retryAfter))});
 try{return desktopJSON(await analyzeProductPhotos(input,who.userId,{signal:request.signal}));}catch(e){return desktopError("server_error",e instanceof PhotoAnalysisError?e.message:"Product analysis could not be completed.",e instanceof PhotoAnalysisError?e.status:500);}
}
