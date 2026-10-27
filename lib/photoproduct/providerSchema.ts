import 'server-only';
import {jsonSchema,zodSchema} from 'ai';
import {GeneratedAnalysisSchema} from './contracts';
import type {z} from 'zod';
/** Large nested array/range grammars exceed Gemini's constrained-decoding state budget.
 * These hints are omitted ONLY from the provider grammar. The original Zod validator and
 * all geometry/complexity checks remain authoritative before a model reaches the editor.
 */
function providerGrammar<T>(node:T):T{
 if(Array.isArray(node))return node.map(providerGrammar) as T;
 if(node&&typeof node==='object')return Object.fromEntries(Object.entries(node).filter(([key])=>!['minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf','minItems','maxItems','minLength','maxLength','pattern'].includes(key)).map(([key,value])=>[key,providerGrammar(value)])) as T;
 return node;
}
export const PhotoProviderSchema=jsonSchema<z.infer<typeof GeneratedAnalysisSchema>>(async()=>providerGrammar(await zodSchema(GeneratedAnalysisSchema).jsonSchema),{validate(value){const result=GeneratedAnalysisSchema.safeParse(value);return result.success?{success:true,value:result.data}:{success:false,error:result.error};}});
