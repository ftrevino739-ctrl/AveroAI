import { models, type ProviderId } from "@/lib/models";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const names:Record<ProviderId,string>={openai:"OpenAI",anthropic:"Anthropic",google:"Google Gemini",openrouter:"OpenRouter",custom:"Endpoint personalizado"};
export async function GET(){
 const keys:Record<ProviderId,boolean>={openai:Boolean(process.env.OPENAI_API_KEY),anthropic:Boolean(process.env.ANTHROPIC_API_KEY),google:Boolean(process.env.GOOGLE_API_KEY),openrouter:Boolean(process.env.OPENROUTER_API_KEY),custom:Boolean(process.env.CUSTOM_API_KEY&&process.env.CUSTOM_BASE_URL)};
 const catalogue=[...models,...(keys.custom&&process.env.CUSTOM_MODEL_ID?[{id:process.env.CUSTOM_MODEL_ID,name:process.env.CUSTOM_MODEL_NAME||"Custom model",provider:names.custom,providerId:"custom" as const,description:"OpenAI-compatible custom model",category:"Open" as const,context:"Provider defined"}]:[])];
 const providers=(Object.keys(names) as ProviderId[]).map(id=>({id,name:names[id],configured:keys[id],models:catalogue.filter(m=>m.providerId===id).length}));
 return Response.json({providers,models:catalogue.map(({id,name,provider,providerId,description,category,context})=>({id,name,provider,providerId,description,category,context,configured:keys[providerId]}))},{headers:{"Cache-Control":"no-store"}});
}
