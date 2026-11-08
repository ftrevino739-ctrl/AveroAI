import { models, type ProviderId } from "@/lib/models";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const names:Record<ProviderId,string>={openai:"OpenAI",anthropic:"Anthropic",google:"Google Gemini",openrouter:"OpenRouter",custom:"Endpoint personalizado"};
export async function GET(){
 const keys:Record<ProviderId,boolean>={openai:Boolean(process.env.OPENAI_API_KEY),anthropic:Boolean(process.env.ANTHROPIC_API_KEY),google:Boolean(process.env.GOOGLE_API_KEY),openrouter:Boolean(process.env.OPENROUTER_API_KEY),custom:Boolean(process.env.CUSTOM_API_KEY&&process.env.CUSTOM_BASE_URL)};
 const providers=(Object.keys(names) as ProviderId[]).map(id=>({id,name:names[id],configured:keys[id],models:models.filter(m=>m.providerId===id).length}));
 return Response.json({providers,models:models.map(({id,name,provider,providerId,description,category,context})=>({id,name,provider,providerId,description,category,context,configured:keys[providerId]}))},{headers:{"Cache-Control":"no-store"}});
}
