# AveroAI

AveroAI es la interfaz web propia (marca, experiencia, historial y selector de modelos). **La inferencia real y el catálogo de modelos los proporciona Venice AI**, mediante sus endpoints oficiales. No entrenamos ni fingimos tener modelos propios, y no presentamos a AveroAI como si fuera el sitio oficial de Venice.

## Arquitectura de AveroAI
- **AveroAI es la aplicación:** interfaz Liquid Glass, selector, historial, sesiones, validación de modelos, límites de entrada, control de flujo y streaming.
- **Motor de conexión propio:** el servidor de AveroAI descubre el catálogo oficial, lee los modelos de texto disponibles, sus traits, compatibilidades y metadatos, valida el ID seleccionado y crea la solicitud de inferencia.
- **Inferencia:** cada modelo se invoca por su ID real en el endpoint oficial de Venice. AveroAI no sustituye los nombres de modelos por una identidad ficticia ni añade un prompt de sistema de Venice (`include_venice_system_prompt: false`).
- **Límite honesto:** los modelos cerrados siguen ejecutándose en la infraestructura que Venice ofrece; AveroAI no aloja sus pesos. Para alojar modelos nosotros mismos necesitaríamos pesos descargables, GPU, memoria y licencias compatibles. Esta integración sí conecta cada modelo individualmente desde nuestro backend, pero no convierte AveroAI en el dueño de los modelos.

## Catálogo oficial de Venice
AveroAI descubre en vivo `GET /models?type=text`, `GET /models/traits?type=text` y `GET /models/compatibility_mapping?type=text`. El selector incluye todos los modelos de texto disponibles que Venice devuelve, no solo los marcados Uncensored ni modelos de OpenRouter. El distintivo Uncensored se muestra únicamente cuando `model_spec.uncensored === true`. El catálogo también expone contexto, máximo de tokens de salida, capacidades, privacidad, traits y precios publicados por millón de tokens. Los modelos offline se excluyen; las IDs y los modelos cambian según el catálogo vivo. Si Venice no devuelve el catálogo, AveroAI falla cerrado.

Este selector es para modelos de texto/chat. Venice también ofrece catálogos separados de imagen, vídeo, música, TTS, ASR y embeddings; esos modelos no deben enviarse a `/chat/completions` y requieren sus propios flujos de interfaz y endpoints. No se presentan como modelos de chat hasta integrar esos flujos.

## Sin API keys: qué significa realmente
Venice x402 permite acceder a las rutas de inferencia sin API key ni cuenta Venice. La identidad se prueba con una firma SIWX de una wallet EVM en Base o Solana; cada solicitud se firma con un nonce nuevo. El consumo se paga con saldo x402 prepagado en USDC. Si la wallet está vinculada a una cuenta Venice con saldo DIEM elegible, Venice consume ese saldo primero.

**x402 no significa tokens ilimitados ni una suscripción Max gratuita.** El saldo x402/USDC se consume por uso y por modelo. Los límites de contexto publicados (por ejemplo 1M) no son una cuota mensual ni equivalen a 1M tokens de salida.

## Venice Max y el requisito que no se puede ocultar
La página oficial de precios anuncia para Max un paquete de US$225 de gasto mensual en API (sujeto a los términos y condiciones del plan). La API estándar utiliza una API key de la cuenta. x402 autentica con wallet y saldo USDC/DIEM elegible. La documentación consultada no garantiza que el paquete API de Max se consuma automáticamente a través de x402; AveroAI no afirmará que sí. Si se quiere usar el saldo API de Max, hay que confirmar el flujo de facturación con Venice y probablemente habilitar su API key como método alternativo.

## Seguridad y acceso privado
La rama incluye una puerta de acceso con código compartido y cookie de sesión HttpOnly firmada (duración de 7 días). El servidor bloquea la aplicación si faltan `AVERO_ACCESS_CODE` o `AVERO_SESSION_SECRET`. El chat también aplica un límite temporal en memoria por IP. Esto protege una instalación personal o privada, pero **no equivale a cuentas multiusuario ni a cuotas persistentes**: antes de ofrecer el servicio públicamente hacen falta usuarios individuales, cuotas persistentes, rate limiting distribuido y un límite de gasto externo. Usa una wallet x402 dedicada con saldo limitado y sin recarga automática.

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
AVERO_ACCESS_CODE=un_codigo_privado_largo
AVERO_SESSION_SECRET=secreto_aleatorio_de_32_bytes_o_mas

# Genera un secreto de sesión en PowerShell:
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

No pegues la clave privada en chats, no la añadas a commits y no uses tu wallet principal. La wallet debe tener saldo USDC x402 en Base/Solana (y gas de red). Configura un código privado largo en `AVERO_ACCESS_CODE` y un secreto aleatorio en `AVERO_SESSION_SECRET`; nunca compartas esos valores. La aplicación redirige a `/access` hasta que se inicie sesión.

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
5. Configura `AVERO_ACCESS_CODE` y `AVERO_SESSION_SECRET` como secretos del hosting, además de la wallet.
6. Mantén la aplicación privada: el acceso actual usa un código compartido, no cuentas individuales. No la abras al público hasta añadir cuotas persistentes por usuario y límites de gasto.

## Motor AveroAI y endpoints
- `GET /api/providers`: descubre todos los modelos de texto de Venice y devuelve traits, compatibilidades, capacidades, contexto, salida y precios.
- `POST /api/chat`: valida que el ID esté en el catálogo de texto vigente, envía la solicitud desde el servidor y retransmite el streaming.
- El navegador nunca recibe la clave privada de la wallet.
- No se inyecta un prompt oculto de AveroAI ni el prompt por defecto de Venice: se transmiten los mensajes de la conversación y los parámetros explícitos del usuario.

## Estado de verificación
La integración está en una rama de desarrollo y PR; no se declara producción ni 100% completada. La rama incorpora acceso privado básico y estética Liquid Glass reforzada. La conexión dinámica de todos los modelos de texto de Venice, validación estricta del ID y el motor server-side están implementados en la rama. GitHub Actions ya pasó para el commit actual: typecheck, lint, build de Next.js y Docker build. Aún faltan la prueba real de balance x402, smoke tests con wallet financiada para cada modelo y controles multiusuario/cuotas persistentes para despliegue público. La compilación no demuestra por sí sola que el catálogo x402 o cada modelo responda correctamente.
