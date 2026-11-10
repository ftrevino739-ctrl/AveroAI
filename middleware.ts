import { NextRequest,NextResponse } from "next/server";
const COOKIE="avero_session";
const encoder=new TextEncoder();
const SESSION_LIFETIME_MS=7*24*60*60*1000;
async function signature(payload:string,secret:string){
  const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const bytes=await crypto.subtle.sign("HMAC",key,encoder.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
export async function middleware(request:NextRequest){
  const path=request.nextUrl.pathname;
  if(path.startsWith("/_next")||path==="/favicon.ico"||path==="/access"||path.startsWith("/api/access"))return NextResponse.next();
  const secret=process.env.AVERO_SESSION_SECRET||"",accessCode=process.env.AVERO_ACCESS_CODE||"";
  if(encoder.encode(secret).byteLength<32||accessCode.length<16){
    if(path.startsWith("/api/"))return NextResponse.json({error:"AveroAI está cerrado: configura un código de acceso de 16 caracteres y un secreto de sesión de 32 bytes como mínimo."},{status:503,headers:{"Cache-Control":"no-store"}});
    return NextResponse.redirect(new URL("/access?setup=1",request.url));
  }
  const token=request.cookies.get(COOKIE)?.value||"",separator=token.indexOf(".");
  const issued=separator>0?token.slice(0,separator):"",supplied=separator>0?token.slice(separator+1):"";
  const timestamp=Number(issued),now=Date.now();
  const validTime=Number.isSafeInteger(timestamp)&&timestamp>0&&now-timestamp>=0&&now-timestamp<SESSION_LIFETIME_MS;
  // Include the access code in the MAC payload so rotating it invalidates old cookies.
  const expected=validTime?await signature(issued+":"+accessCode,secret):"";
  if(validTime&&supplied&&supplied===expected)return NextResponse.next();
  if(path.startsWith("/api/"))return NextResponse.json({error:"Acceso no autorizado. Inicia sesión en AveroAI."},{status:401,headers:{"Cache-Control":"no-store"}});
  const target=new URL("/access",request.url);target.searchParams.set("from",path);return NextResponse.redirect(target);
}
export const config={matcher:["/((?!_next/static|_next/image).*)"]};
