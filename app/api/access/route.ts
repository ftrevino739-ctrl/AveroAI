import { NextRequest,NextResponse } from "next/server";
const COOKIE="avero_session",encoder=new TextEncoder(),SESSION_LIFETIME_SECONDS=7*24*60*60;
const attempts=new Map<string,{count:number;reset:number}>();
async function signature(payload:string,secret:string){
  const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const bytes=await crypto.subtle.sign("HMAC",key,encoder.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function constantTimeEqual(expected:string,actual:string){
  const a=encoder.encode(expected),b=encoder.encode(actual);let diff=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a[i]||0)^(b[i]||0);
  return diff===0;
}
function clientIp(request:NextRequest){
  return request.headers.get("x-real-ip")?.trim()||request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
}
function json(body:Record<string,unknown>,status=200){return NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});}
export async function POST(request:NextRequest){
  const accessCode=process.env.AVERO_ACCESS_CODE||"",secret=process.env.AVERO_SESSION_SECRET||"";
  if(accessCode.length<16||encoder.encode(secret).byteLength<32)return json({error:"Configura un código de acceso de 16 caracteres y un secreto de sesión de 32 bytes como mínimo."},503);
  const now=Date.now();
  if(attempts.size>2000)for(const [ip,e] of attempts)if(e.reset<=now)attempts.delete(ip);
  const ip=clientIp(request),attempt=attempts.get(ip);
  if(attempt&&attempt.reset>now&&attempt.count>=5)return json({error:"Demasiados intentos. Espera 15 minutos."},429);
  if(!attempt||attempt.reset<=now)attempts.set(ip,{count:1,reset:now+15*60_000});
  else{attempt.count++;attempts.set(ip,attempt);}
  let body:{code?:unknown}={};
  try{const raw=await request.text();if(encoder.encode(raw).byteLength>4096)return json({error:"Solicitud demasiado grande."},413);body=JSON.parse(raw);}
  catch{return json({error:"Solicitud inválida."},400);}
  if(typeof body.code!=="string"||body.code.length>256||!constantTimeEqual(accessCode,body.code))return json({error:"Código de acceso incorrecto."},401);
  const issued=String(Date.now()),token=issued+"."+await signature(issued+":"+accessCode,secret);
  const response=json({ok:true});
  response.cookies.set(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:SESSION_LIFETIME_SECONDS});
  return response;
}
export async function DELETE(){
  const response=json({ok:true});
  response.cookies.set(COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:0});
  return response;
}
