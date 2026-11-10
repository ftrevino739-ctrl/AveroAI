# AveroAI

AveroAI es una aplicación privada de Next.js que ofrece una interfaz propia para conversar con los modelos de texto disponibles en Venice AI. **AveroAI es la interfaz y el enrutador; Venice proporciona el catálogo, la infraestructura de inferencia y el acceso a los modelos.** No entrenamos ni alojamos los pesos de esos modelos y no nos presentamos como el sitio oficial de Venice.

## Qué modelos usa

El backend consulta el catálogo vivo de Venice mediante `GET /models?type=text`, además de sus endpoints de traits y compatibilidad. El selector usa los IDs reales que devuelve Venice y los envía sin sustituirlos a `POST /chat/completions`. Por tanto, las respuestas las genera el modelo seleccionado a través de la infraestructura de Venice; no es una simulación de Venice ni una capa que solo oculte el nombre AveroAI.

El catálogo de Venice puede incluir modelos de distintos desarrolladores y familias. Que un modelo aparezca en Venice significa que Venice lo ofrece mediante su API; no significa que AveroAI posea o entrene ese modelo. El inventario cambia, por eso no fijamos la lista de IDs en el código.

Esta versión integra **chat de texto**. Aunque el catálogo publique capacidades de visión, audio, vídeo o herramientas, esas capacidades no están activadas en la interfaz actual. Se deben añadir flujos y endpoints específicos antes de anunciarlas como funciones de AveroAI.

## Funciones

- Catálogo dinámico de modelos de texto, traits, compatibilidades, capacidades y precios publicados.
- Modelo inicial basado en `traits.default`, con fallback al primer modelo activo disponible.
- Resolución de aliases solo cuando su destino existe en el catálogo actual.
- Chat en streaming desde el backend; la clave privada de la wallet nunca llega al navegador.
- Límite de salida configurable de 1.024, 2.048, 4.096 u 8.192 tokens, con un máximo absoluto de 8.192 en el servidor.
- Historial local, exportación JSON, tema claro/oscuro y adjuntos de texto de hasta 150 KB.
- Puerta privada por código compartido y cookie HttpOnly firmada de siete días.
- Consulta de saldo Venice x402/DIEM de solo lectura desde Ajustes.

## Autenticación y pagos

Se utiliza `venice-x402-client@0.2.0` con una wallet EVM en Base (chain ID 8453). `createAuthFetch()` firma una autenticación SIWX nueva para cada petición. El endpoint de saldo usa `VeniceClient.getBalance()`; muestra por separado el crédito x402 en USD y el saldo DIEM vinculado.

**No hay recarga automática ni pagos iniciados por AveroAI.** La aplicación no llama a `topUp()` y no firma transferencias de USDC. Una respuesta HTTP 402 se muestra como un requisito de pago/autenticación de Venice; el significado concreto depende del cuerpo y los encabezados de la respuesta. No se debe asumir que todo 402 significa únicamente saldo cero.

No uses tu wallet principal. Configura una wallet dedicada con fondos limitados. Nunca pegues la clave privada en chats, en el navegador o en GitHub.

## Configuración local (Windows PowerShell)

Requisitos: Node.js 22 recomendado y Git.

```powershell
git clone https://github.com/ftrevino739-ctrl/AveroAI.git
cd AveroAI
git checkout feature/venice-x402-keyless
npm install
Copy-Item .env.example .env.local
notepad .env.local
```

Configura estos valores en `.env.local`:

```env
VENICE_WALLET_PRIVATE_KEY=0x...clave_hex_de_32_bytes
AVERO_ACCESS_CODE=un_codigo_privado_largo_de_16_caracteres_o_mas
AVERO_SESSION_SECRET=secreto_aleatorio_de_32_bytes_o_mas
```

Genera el secreto de sesión con PowerShell:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

El código de acceso debe tener al menos 16 caracteres. El secreto de sesión debe contener al menos 32 bytes. Cambiar el código invalida las cookies emitidas con el código anterior.

Ejecuta:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm run dev
```

Abre `http://localhost:3000`. Sin los tres secretos necesarios, AveroAI permanece cerrada.

## CI y Docker

GitHub Actions ejecuta pruebas, typecheck, ESLint, build de Next.js y Docker build en pushes a `main` y `feature/**`, y en pull requests a `main`. La imagen utiliza Node 22 y la salida standalone de Next.js.

Los secretos se configuran en el entorno local o en el gestor de secretos del hosting. No deben subirse al repositorio.

## Límites de seguridad y publicación

Esta rama está pensada para uso personal/privado; todavía no es una plataforma multiusuario pública:

- El acceso depende de un solo código compartido, no de cuentas individuales.
- Los límites de login y chat viven en memoria del proceso; no son compartidos entre réplicas ni persisten tras un reinicio.
- El historial se guarda en `localStorage` y no se sincroniza entre dispositivos.
- No hay base de datos, cuotas persistentes por usuario ni medición de gasto por usuario.
- La wallet puede estar configurada y aun así no tener saldo consumible; AveroAI no recarga fondos.
- No hay hosting ni dominio de producción declarado en el repositorio.

Antes de abrir el servicio al público hacen falta cuentas individuales, almacenamiento persistente, rate limiting distribuido, cuotas por usuario y controles externos de gasto.

## Verificación

Las pruebas automatizadas usan un fixture sintético para comprobar el mapeo del catálogo, el filtrado de modelos offline/no-texto, precios, `traits.default` y resolución de aliases. No es una captura del catálogo vivo.

Un build verde no demuestra que una wallet tenga fondos ni que una inferencia real funcione. Para eso hace falta una prueba controlada con una wallet dedicada y financiada, con un gasto máximo definido previamente.
