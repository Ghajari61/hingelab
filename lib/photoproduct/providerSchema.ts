import 'server-only';
import {jsonSchema,zodSchema} from 'ai';
import {GeneratedAnalysisSchema} from './contracts';
import type {z} from 'zod';
/** Draft-7 tuple arrays are incompatible, and large nested array/range grammars can exceed Gemini's constrained-decoding state budget.
 * These hints are omitted ONLY from the provider grammar. The original Zod validator and
 * all geometry/complexity checks remain authoritative before a model reaches the editor.
 */
function providerGrammar<T>(node:T):T{
 if(Array.isArray(node))return node.map(providerGrammar) as T;
 if(node&&typeof node==='object'&&'items' in node&&Array.isArray(node.items)){
  const {items,...rest}=node as Record<string,unknown>&{items:unknown[]};
  // AI SDK's Zod adapter emits draft-7 homogeneous tuples as items:[...].
  // Gemini responseJsonSchema requires items to be a schema, not an array.
  if(!items.length||!items.every(item=>JSON.stringify(item)===JSON.stringify(items[0])))throw Error('Unsupported heterogeneous provider tuple');
  return {...providerGrammar(rest),items:providerGrammar(items[0]),minItems:items.length,maxItems:items.length} as T;
 }
 if(node&&typeof node==='object')return Object.fromEntries(Object.entries(node).filter(([key])=>!['minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf','minItems','maxItems','minLength','maxLength','pattern','additionalItems'].includes(key)).map(([key,value])=>[key,providerGrammar(value)])) as T;
 return node;
}
const ProviderAnalysisSchema=GeneratedAnalysisSchema.omit({review:true});
export const PhotoProviderSchema=jsonSchema<z.infer<typeof ProviderAnalysisSchema>>(async()=>providerGrammar(await zodSchema(ProviderAnalysisSchema).jsonSchema),{validate(value){const result=ProviderAnalysisSchema.safeParse(value);return result.success?{success:true,value:result.data}:{success:false,error:result.error};}});
