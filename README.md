# AveroAI

AveroAI es la interfaz web propia (marca, experiencia, historial y selector de modelos). **La inferencia real y el catálogo de modelos los proporciona Venice AI**, mediante sus endpoints oficiales. No entrenamos ni fingimos tener modelos propios, y no presentamos a AveroAI como si fuera el sitio oficial de Venice.

## Arquitectura real
- Frontend AveroAI: Next.js, interfaz Liquid Glass y conversaciones locales.
- Proveedor de inferencia: Venice AI, `https://api.venice.ai/api/v1`.
- Autenticación sin API key tradicional: Venice x402 / SIWX, mediante una wallet.
- Modelos: se consultan en el catálogo público de Venice (`GET /models?type=text`) y se muestran en AveroAI; la lista fallback solo permite abrir la interfaz si el catálogo no responde.
- Chat: `POST /chat/completions` en Venice, con streaming.

## Modelos solicitados
Estos identificadores están publicados en el catálogo oficial de Venice consultado el 8 de noviembre de 2026:
- DeepSeek V4.1 Flash Uncensored — `deepseek-v4-1-flash-uncensored`
- DeepSeek V4.1 Flash (1017) — `deepseek-v4-1-flash-1017`
- DeepSeek V4.1 Flash (1017) Uncensored — `deepseek-v4-1-flash-1017-uncensored`
- Kimi K2.5 — `kimi-k2-5` (Retiring)
- Kimi K3 — `kimi-k3`
- Claude Fable 5.1 — `claude-fable-5-1`
- Claude Opus 5 — `claude-opus-5`
- Claude Sonnet 5 — `claude-sonnet-5`
- Claude Opus 4.7 — `claude-opus-4-7`
- Claude Sonnet 4.6 — `claude-sonnet-4-6`
- GLM 5.3 Flash — `z-ai-glm-5-3-flash`
- Grok 4.3 — `grok-4-3`
- Grok 4.6 — `grok-4-6`

El catálogo oficial puede cambiar; la respuesta de `GET /models` es la autoridad para saber qué está disponible ahora. AveroAI no debe mostrar un modelo como operativo si Venice lo ha retirado o no lo devuelve.

## Sin API keys: qué significa realmente
Venice x402 permite acceder a las rutas de inferencia sin API key ni cuenta Venice. La identidad se prueba con una firma SIWX de una wallet EVM en Base o Solana; cada solicitud se firma con un nonce nuevo. El consumo se paga con saldo x402 prepagado en USDC. Si la wallet está vinculada a una cuenta Venice con saldo DIEM elegible, Venice consume ese saldo primero.

**x402 no significa tokens ilimitados ni una suscripción Max gratuita.** El saldo x402/USDC se consume por uso y por modelo. Los límites de contexto publicados (por ejemplo 1M) no son una cuota mensual ni equivalen a 1M tokens de salida.

## Venice Max y el requisito que no se puede ocultar
La página de precios de Venice muestra que Max cuesta US$200/mes e incluye 22,500 créditos mensuales, y describe acceso a la API mediante créditos. Sin embargo, la documentación de autenticación de Venice separa:
- API estándar: API key de la cuenta, que usa sus saldos USD/DIEM y permite consultar facturación.
- x402: firma de wallet sin API key, que usa saldo USDC x402 o saldo DIEM vinculado.

La documentación pública que revisamos **no garantiza que los 22,500 créditos del plan Max se apliquen a solicitudes x402**. Por eso AveroAI no promete utilizar los créditos Max con x402. Si la prioridad absoluta es gastar los créditos del plan Max, habrá que confirmar con Venice si ese saldo se puede consumir con x402; si no, el método oficial de API requiere una API key. No hay una forma legítima documentada de combinar “sin API key” + “usar automáticamente todos los créditos Max”.

## Seguridad
Esta versión utiliza una wallet de servidor compartida. Un visitante público podría consumir el saldo de esa wallet. Antes de abrir AveroAI al público, añadir autenticación de usuarios, cuotas persistentes por usuario, rate limits distribuidos, límite de gasto y monitoreo de balance. Usar una wallet dedicada y nunca subir su clave privada al repositorio.

## Instalación local (Windows PowerShell)
Requisitos: Node.js 20.9+ (recomendado Node 22 LTS) y Git.

```powershell
git clone https://github.com/ftrevino739-ctrl/AveroAI.git
cd AveroAI
git checkout feature/venice-x402-keyless
npm install
Copy-Item .env.example .env.local
notepad .env.local
```

Configura el secreto localmente:
```env
VENICE_WALLET_PRIVATE_KEY=clave_privada_de_wallet_dedicada
APP_URL=http://localhost:3000
```

No pegues la clave privada en chats, no la añadas a commits y no uses tu wallet principal. La wallet debe tener saldo USDC x402 en Base/Solana (y gas de red); el SDK debe configurarse con una clave compatible con el modo de wallet que uses.

Ejecuta:
```powershell
npm run typecheck
npm run lint
npm run build
npm run dev
```
Abre `http://localhost:3000`.

## Despliegue web
1. Prueba localmente y revisa los resultados de build/typecheck/lint.
2. Despliega la rama en un hosting Node compatible con Next.js (Node 20.9+).
3. Configura `VENICE_WALLET_PRIVATE_KEY` como secreto del servidor y `APP_URL` como dominio HTTPS.
4. Build: `npm run build`; Start: `npm run start`.
5. No abras el chat al público hasta incorporar login y cuotas/límites de gasto por usuario.

## Endpoints de AveroAI
- `GET /api/providers`: consulta catálogo público de Venice y devuelve estado de wallet.
- `POST /api/chat`: envía el chat a Venice x402 y retransmite el streaming.

## Estado de verificación
La integración está en una rama de desarrollo y PR; no se declara producción ni 100% completada. Aún faltan build en un entorno limpio, prueba real de balance x402, pruebas de respuesta/streaming por modelo y controles de acceso para despliegue público.
