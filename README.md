# AveroAI

AveroAI es una aplicación privada de Next.js para conversar desde una interfaz propia con los modelos de texto publicados por Venice AI. **Venice ejecuta la inferencia y aloja los modelos; AveroAI no entrena modelos ni aloja sus pesos.** AveroAI no es el sitio oficial de Venice.

## Funciones actuales

- Catálogo dinámico de modelos de texto, traits y mapa oficial de aliases de Venice.
- Selector de modelos con selección inicial basada en \`traits.default\`.
- Chat server-side con streaming; la clave de wallet nunca llega al navegador.
- Límite de salida ajustable (1.024, 2.048, 4.096 u 8.192 tokens), con límite absoluto de servidor.
- Historial local, exportación JSON, temas claro/oscuro y adjuntos de texto de hasta 150 KB.
- Acceso privado por código compartido y cookie HttpOnly firmada.

## Autenticación, pagos y límites

Esta versión usa \`venice-x402-client@0.2.0\` y una wallet EVM en Base (chain ID 8453). \`createAuthFetch()\` añade autenticación SIWX; **esta app no llama a \`topUp()\`, no firma pagos automáticos y no recarga la wallet**. Un HTTP 402 se muestra al usuario. Puede corresponder a credenciales, saldo apto para x402 o límites de gasto de la cuenta; no debe interpretarse automáticamente como falta de saldo.

El backend envía \`max_completion_tokens\`, que sustituye al parámetro anterior \`max_tokens\`. El stream muestra texto final y no expone \`reasoning_content\`. Los metadatos de visión, audio, vídeo y function calling no significan que esas modalidades o herramientas estén integradas en esta UI.

El acceso actual es de un solo código compartido, no cuentas multiusuario. Los rate limits son mapas en memoria y se reinician con el proceso; el historial vive en el navegador. No hay base de datos, cuotas persistentes ni contabilidad de gasto por usuario. **Mantén el proyecto privado y la wallet con saldo limitado. No lo publiques como un servicio multiusuario todavía.**

## Instalación (Windows PowerShell)

Requiere Node.js 22 recomendado y Git.

\`\`\`powershell
git clone https://github.com/ftrevino739-ctrl/AveroAI.git
cd AveroAI
git checkout feature/venice-x402-keyless
npm install
Copy-Item .env.example .env.local
notepad .env.local
\`\`\`

Configura en \`.env.local\`:

\`\`\`env
VENICE_WALLET_PRIVATE_KEY=0x...clave_hex_de_32_bytes
AVERO_ACCESS_CODE=un_codigo_largo_de_16_caracteres_o_mas
AVERO_SESSION_SECRET=secreto_aleatorio_de_32_bytes_o_mas
\`\`\`

Genera el secreto en PowerShell:

\`\`\`powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
\`\`\`

No pegues la clave privada en chats ni la subas a Git. Usa una wallet EVM dedicada en Base, no tu wallet principal. El secreto de sesión debe tener 32 bytes como mínimo; el código debe tener 16 caracteres como mínimo. Cambiar el código invalida las cookies anteriores.

\`\`\`powershell
npm test
npm run typecheck
npm run lint
npm run build
npm run dev
\`\`\`

Abre \`http://localhost:3000\`. GitHub Actions ejecuta pruebas, typecheck, lint, build y Docker build. El Dockerfile usa Node 22 y salida standalone.

## Verificación pendiente antes de cualquier publicación

Un build verde no demuestra que una wallet esté financiada ni que Venice acepte una inferencia por SIWX/x402. Hace falta una prueba controlada con wallet dedicada y saldo limitado. Aún no se declara dominio, hosting ni despliegue de producción. Para abrirlo al público faltan cuentas, almacenamiento persistente, rate limiting distribuido, cuotas por usuario y controles externos de gasto.
