# AveroAI

**Una idea. Muchas posibilidades.**

AveroAI es un espacio de chat multimodelo con una interfaz Liquid Glass, historial local, selector de modelos y un gateway de inferencia en servidor.

## Funciones incluidas

- Interfaz adaptable a escritorio, tablet y móvil, con tema claro y oscuro.
- Conversaciones múltiples con guardado local en el navegador.
- Selector de modelos con búsqueda y catálogo inicial.
- Respuestas en streaming y opción para detener la generación.
- Copiar respuestas y exportar conversaciones a JSON.
- Adjuntar archivos de texto, Markdown, CSV, JSON y LOG (hasta 150 KB).
- Adaptadores para OpenAI, Anthropic, Gemini mediante endpoint compatible con OpenAI, OpenRouter y endpoint personalizado compatible.
- Las API keys permanecen en el servidor; no se exponen al navegador.
- Validación de entradas, límites de tamaño, timeout y limitación básica de solicitudes.
- GitHub Actions para comprobar tipos, lint y compilación de producción.

## Requisitos e instalación

Requiere Node.js 20.9 o superior y una API key válida de al menos un proveedor.

1. Clona el repositorio.
2. Ejecuta `npm install`.
3. Copia `.env.example` como `.env.local`.
4. Añade al menos una API key válida.
5. Ejecuta `npm run dev`.
6. Abre `http://localhost:3000`.

## Variables de entorno

| Variable | Proveedor / uso |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic |
| `GOOGLE_API_KEY` | Gemini |
| `OPENROUTER_API_KEY` | OpenRouter |
| `CUSTOM_BASE_URL` | URL base del endpoint compatible personalizado |
| `CUSTOM_API_KEY` | Clave del endpoint personalizado |
| `CUSTOM_MODEL_ID` | Identificador de modelo del endpoint personalizado |
| `CUSTOM_MODEL_NAME` | Nombre visible del modelo personalizado |
| `APP_URL` | URL pública de AveroAI; se envía como metadato a OpenRouter |

No guardes claves reales en Git ni en variables del cliente como `NEXT_PUBLIC_*`. En producción, configúralas en el panel privado de variables de entorno del hosting.

## Comandos

- `npm run dev` — servidor de desarrollo.
- `npm run typecheck` — comprobación TypeScript.
- `npm run lint` — ESLint.
- `npm run build` — compilación de producción.
- `npm start` — servidor de producción después de compilar.

## Modelos y acceso

El catálogo es una selección inicial y no garantiza que un modelo siga habilitado, que esté incluido en tu plan o que tu clave tenga permiso para usarlo. Verifica los identificadores y el acceso en el panel/documentación de cada proveedor. Los precios y límites los determina el proveedor. AveroAI enruta solicitudes autorizadas; no evita suscripciones, facturación ni controles de acceso.

## Arquitectura

- `app/page.tsx`: interfaz y estado de conversaciones.
- `app/api/chat/route.ts`: gateway server-side y streaming.
- `lib/models.ts`: catálogo de modelos.
- `app/globals.css`: sistema visual Liquid Glass.

## Seguridad y privacidad

El historial se almacena en el navegador mediante localStorage y no se sincroniza entre dispositivos. El contenido que envías se transmite al proveedor seleccionado. No introduzcas secretos en prompts. La limitación incluida en memoria es una protección básica para despliegues pequeños; una instalación pública con varias instancias necesita rate limiting compartido, autenticación, cuotas y protección contra abuso antes de abrir el servicio al público.

El endpoint personalizado se configura exclusivamente en el servidor. Usa HTTPS en producción. No registres API keys ni contenido sensible.

## Licencia

Todos los derechos reservados. No se concede una licencia de redistribución.
