import "server-only";
import { MAX_PHOTO_BODY,parsePhotoRequest } from "./contracts";
export class PhotoInputError extends Error {constructor(message:string,readonly status=400){super(message);}}
export async function readPhotoRequest(request:Request){
 if(!request.body)throw new PhotoInputError("Upload at least one photo.");
 const reader=request.body.getReader(),decoder=new TextDecoder();let bytes=0,text="";
 try{
  for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_PHOTO_BODY){await reader.cancel();throw new PhotoInputError("The photo set is too large.",413);}text+=decoder.decode(value,{stream:true});}
  text+=decoder.decode();
 }finally{reader.releaseLock();}
 try{return parsePhotoRequest(text);}catch(error){throw new PhotoInputError(error instanceof Error?error.message:"Invalid photo set.");}
}
