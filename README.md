# AveroAI

Chat multimodelo Liquid Glass con catálogo Venice AI y autenticación x402 basada en wallet. No usa API keys tradicionales de proveedores.

## Qué se integró
- Gateway server-side compatible con Venice Chat Completions y streaming.
- Autenticación x402 con `venice-x402-client`; firma nueva por solicitud.
- Catálogo dinámico desde `GET /api/v1/models?type=text`, con catálogo fallback para los modelos solicitados.
- Modelos destacados: DeepSeek V4.1 Flash Uncensored, DeepSeek V4.1 Flash (1017) y DeepSeek V4.1 Flash (1017) Uncensored, Kimi K2.5, Kimi K3, Claude Fable 5.1, Claude Opus 5, Claude Sonnet 5, Claude Opus 4.7, Claude Sonnet 4.6, GLM 5.3 Flash, Grok 4.3 y Grok 4.6.
- Contexto de conversación ampliado y salida solicitada hasta 65,536 tokens (el modelo puede imponer un máximo menor).
- Historial local, selector, streaming, cancelar, exportar y UI Liquid Glass.

## Importante: cómo funciona x402 y cuánto cuesta
x402 elimina la API key, no el pago ni la identidad. El servidor firma solicitudes usando una wallet dedicada y gasta saldo prepagado USDC en Base o Solana. Necesitas clave privada de esa wallet como secreto del servidor; nunca la publiques ni la compartas. El saldo se consume por tokens según el modelo.

**El plan Venice Max de la web/app no incluye inferencia API ilimitada ni transfiere su cuota a x402.** Venice indica que el uso API se cobra aparte por modelo. Por tanto, esta integración no promete tokens ilimitados ni un presupuesto de Max. Los contextos de 500K/1M son ventanas máximas de contexto, no una cuota gratuita ni salida garantizada de ese tamaño.

## Seguridad antes de publicar
Esta primera integración usa una wallet de servidor compartida. Cualquier visitante que pueda usar el chat puede consumir su saldo. No publiques la app abierta al público hasta añadir autenticación de usuarios, cuotas persistentes por usuario y límites de gasto. El rate limit incluido es solo básico/en memoria y no sustituye esas protecciones. Usa una wallet dedicada con saldo limitado; no uses tu wallet principal. No habilites auto-top-up.

## Configuración local (Windows PowerShell)
Requisitos: Node.js 20.9+ (Node 22 LTS recomendado) y Git.

```powershell
git clone https://github.com/ftrevino739-ctrl/AveroAI.git
cd AveroAI
git checkout feature/venice-x402-keyless
npm install
Copy-Item .env.example .env.local
notepad .env.local
```

En `.env.local` configura:
```env
VENICE_WALLET_PRIVATE_KEY=tu_clave_privada_de_una_wallet_dedicada
APP_URL=http://localhost:3000
```

La clave privada se queda solo en el servidor local. No la subas a GitHub ni la pegues en el chat. La wallet debe tener saldo x402 en USDC y gas según la red elegida. El cliente x402 oficial admite wallet EVM/Base; consulta la documentación vigente antes de fondearla.

Después:
```powershell
npm run typecheck
npm run lint
npm run build
npm run dev
```
Abre http://localhost:3000.

## Despliegue web
1. Sube/mergea esta rama a `main` después de probarla.
2. Importa el repositorio en un hosting Node.js compatible con Next.js (Node 20.9+).
3. Añade `VENICE_WALLET_PRIVATE_KEY` como secret/environment variable privada del proyecto y `APP_URL` con el dominio HTTPS.
4. Build: `npm run build`; Start: `npm run start`.
5. No expongas el servicio públicamente hasta implementar login y cuotas persistentes; la wallet del servidor paga las solicitudes.

## Endpoints
- `GET /api/providers`: estado de x402 y catálogo en vivo/fallback.
- `POST /api/chat`: streaming de chat por Venice x402.

## Limitaciones honestas
- Los nombres e IDs corresponden al catálogo de Venice consultado al preparar esta integración; Venice puede retirar o renombrar modelos. Kimi K2.5 y DeepSeek V4.1 Flash figuran como retiring en el catálogo consultado.
- “Uncensored” es una etiqueta/capacidad publicada para modelos específicos, no garantía de que todos los modelos de Anthropic/xAI/otros carezcan de sus políticas propias.
- No hay bypass de planes, facturación, límites ni controles del proveedor.
- El historial sigue guardándose en localStorage del navegador; no se sincroniza entre dispositivos.
- La integración debe pasar pruebas de build y una llamada real con una wallet financiada antes de considerarse producción.

## Arquitectura
- `app/page.tsx`: UI y conversaciones.
- `app/api/chat/route.ts`: gateway x402 con streaming.
- `app/api/providers/route.ts`: catálogo dinámico.
- `lib/models.ts`: catálogo fallback.
