import { NextRequest } from "next/server";
import { getVeniceTextCatalog } from "@/lib/venice";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const WALLET_KEY_PATTERN=/^0x[0-9a-f]{64}$/i;
export async function GET(request:NextRequest){
  const configured=WALLET_KEY_PATTERN.test(process.env.VENICE_WALLET_PRIVATE_KEY||"");
  const forceRefresh=new URL(request.url).searchParams.get("refresh")==="1";
  try{
    const catalog=await getVeniceTextCatalog(forceRefresh);
    return Response.json({
      providers:[{id:"venice",name:"Venice AI",configured,models:catalog.models.length}],
      models:catalog.models,defaultModelId:catalog.defaultModelId,traits:catalog.traits,compatibilityMapping:catalog.compatibilityMapping,
      connection:{provider:"Venice x402",configured,balance:"not-checked",catalogue:"live",filter:"all-available-text-models"},
      policy:"Todos los modelos de texto activos del catálogo oficial. Uncensored solo cuando Venice lo confirma."
    },{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return Response.json({
      providers:[{id:"venice",name:"Venice AI",configured,models:0}],models:[],defaultModelId:"",
      connection:{provider:"Venice x402",configured,balance:"not-checked",catalogue:"error"},
      error:error instanceof Error?error.message:"No se pudo consultar el catálogo oficial de Venice."
    },{status:502,headers:{"Cache-Control":"no-store"}});
  }
}
