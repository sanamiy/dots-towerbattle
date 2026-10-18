import type { ZodTypeAny } from 'zod';
// Only the closed set of Zod primitives used by our tool contracts is supported.
export function schemaToJson(schema:ZodTypeAny):Record<string,unknown>{
 const d=schema._def as any;
 switch(d.typeName){
  case 'ZodObject':{const entries=Object.entries(d.shape()) as [string,ZodTypeAny][];return {type:'object',properties:Object.fromEntries(entries.map(([k,v])=>[k,schemaToJson(v)])),required:entries.filter(([,v])=>!v.isOptional()).map(([k])=>k),additionalProperties:false};}
  case 'ZodOptional':return schemaToJson(d.innerType);
  case 'ZodString':{const s:Record<string,unknown>={type:'string'};for(const c of d.checks??[]){if(c.kind==='min')s.minLength=c.value;if(c.kind==='max')s.maxLength=c.value;if(c.kind==='uuid')s.format='uuid';if(c.kind==='regex')s.pattern=c.regex.source;}return s;}
  case 'ZodNumber':{const s:Record<string,unknown>={type:'number'};for(const c of d.checks??[]){if(c.kind==='int')s.type='integer';if(c.kind==='min')s.minimum=c.value;if(c.kind==='max')s.maximum=c.value;}return s;}
  case 'ZodBoolean':return {type:'boolean'};
  case 'ZodEnum':return {type:'string',enum:d.values};
  case 'ZodLiteral':return {type:typeof d.value,const:d.value};
  case 'ZodArray':return {type:'array',items:schemaToJson(d.type),...(d.minLength?{minItems:d.minLength.value}:{}),...(d.maxLength?{maxItems:d.maxLength.value}:{})};
  case 'ZodDiscriminatedUnion':return {oneOf:d.options.map(schemaToJson)};
  default:throw new Error(`Unsupported tool schema: ${d.typeName}`);
 }
}
