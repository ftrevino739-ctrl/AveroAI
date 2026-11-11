# Aveiro.ai

Aveiro.ai es una plataforma web multimodelo en desarrollo, con interfaz Liquid Glass, historial local, selector de modelos y un gateway de inferencia en servidor. El objetivo del producto es que el usuario final no tenga que aportar API keys: los modelos open-weight se atenderán remotamente mediante nodos comunitarios y los modelos propietarios solo se habilitarán con acceso oficial financiado por Aveiro.

## Funciones incluidas

- Interfaz adaptable a escritorio, tablet y móvil, con tema claro y oscuro.
- Conversaciones múltiples con guardado local en el navegador.
- Selector de modelos con búsqueda y catálogo inicial.
- Respuestas en streaming y opción para detener la generación.
- Copiar respuestas y exportar conversaciones a JSON.
- Adjuntar archivos de texto, Markdown, CSV, JSON y LOG (hasta 150 KB).
- Adaptadores de servidor para OpenAI, Anthropic, Gemini mediante endpoint compatible con OpenAI, OpenRouter y endpoint personalizado.
- Prototipo de dispatch a un nodo remoto de Aveiro, autenticado con HMAC y sin API key del usuario.
- Servicio independiente Provider Node con allowlist de modelos, límites, timeout y streaming.
- Las credenciales del servidor no se exponen al navegador.
- GitHub Actions comprueba tipos, lint, pruebas del nodo, compilación de producción y build Docker.

## Experiencia del usuario final: solo navegador

**Aveiro.ai no requiere instalar nada en el dispositivo del usuario.** El usuario entra desde la web pública, elige un modelo y conversa. No necesita Node.js, Python, Docker, extensiones, aplicación de escritorio, modelos descargados, GPU propia ni API keys personales. Toda inferencia ocurre en infraestructura remota autorizada por Aveiro.

Las instrucciones de instalación que aparecen a continuación son exclusivamente para desarrolladores que quieran ejecutar el proyecto durante su desarrollo. La instalación del Provider Node corresponde únicamente a voluntarios/organizaciones que decidan aportar GPU desde una máquina remota propia; nunca forma parte del registro ni del uso normal de Aveiro.

Contrato completo de producto y criterios de aceptación: [End-user installation and remote execution contract](docs/architecture/END-USER-EXPERIENCE.md).

## Requisitos e instalación

Requiere Node.js 20.9 o superior. Para probar solo el chat existente, configura una API key de proveedor en el servidor. Para probar la ruta comunitaria, configura un Provider Node remoto siguiendo la sección correspondiente; los usuarios finales no necesitan API keys.

1. Clona el repositorio.
2. Ejecuta `npm install`.
3. Copia `.env.example` como `.env.local`.
4. Configura un proveedor autorizado o la conexión al nodo comunitario.
5. Ejecuta `npm run dev`.
6. Abre `http://localhost:3000`.

## Variables de entorno

| Variable | Proveedor / uso |
| --- | --- |
| `OPENAI_API_KEY` | Integración oficial de OpenAI, privada del servidor |
| `ANTHROPIC_API_KEY` | Integración oficial de Anthropic, privada del servidor |
| `GOOGLE_API_KEY` | Integración oficial de Gemini, privada del servidor |
| `OPENROUTER_API_KEY` | Integración autorizada de OpenRouter |
| `CUSTOM_BASE_URL` | URL base del endpoint compatible personalizado |
| `CUSTOM_API_KEY` | Clave del endpoint personalizado |
| `CUSTOM_MODEL_ID` | Identificador de modelo del endpoint personalizado |
| `CUSTOM_MODEL_NAME` | Nombre visible del modelo personalizado |
| `APP_URL` | URL pública de Aveiro; se envía como metadato a OpenRouter |
| `AVEIRO_PROVIDER_NODE_URL` | URL HTTPS del Provider Node (HTTP solo en loopback para desarrollo) |
| `AVEIRO_NODE_ID` | Identificador del nodo |
| `AVEIRO_NODE_SECRET` | Secreto HMAC compartido entre el servidor de Aveiro y ese nodo |
| `AVEIRO_COMMUNITY_MODEL_ID` | ID exacto del modelo que el nodo tiene autorizado |
| `AVEIRO_COMMUNITY_MODEL_NAME` | Nombre que aparece en el selector |

No guardes claves reales en Git ni en variables del cliente como `NEXT_PUBLIC_*`. En producción, usa el panel privado de variables de entorno del hosting. El secreto HMAC debe ser único por nodo y nunca debe llegar al navegador.

## Provider Node comunitario (prototipo)

El servicio está en `provider-node/`. El operador del nodo ejecuta el servicio junto a un runtime local compatible con OpenAI, como vLLM, SGLang o llama.cpp. El nodo solo acepta los IDs exactos configurados en `AVEIRO_ALLOWED_MODELS`, valida firmas HMAC con marca temporal y nonce, y envía los trabajos al runtime de loopback local.

La plataforma puede añadir al selector el modelo configurado en el servidor mediante las variables `AVEIRO_*`. El usuario final solo elige el modelo y conversa; nunca introduce una API key. Aveiro envía el trabajo al Provider Node remoto y procesa el flujo de respuesta.

Configuración, comandos y límites técnicos: [Provider Node README](provider-node/README.md). Protocolo: [Provider Node Protocol v1](docs/architecture/PROVIDER-NODE-PROTOCOL.md).

**Límite actual:** solo existe el adaptador de un nodo configurado por variables de entorno. Todavía no hay alta automática de nodos, heartbeats, scheduler multi-nodo, cola distribuida, ledger de créditos, cancelación extremo a extremo ni verificación automática de licencias. La conexión remota requiere HTTPS y restricción de acceso de red; el Provider Node por sí solo no termina TLS. No habilites nodos comunitarios públicos o no confiables todavía.

## Comandos

- `npm run dev` — servidor de desarrollo.
- `npm run typecheck` — comprobación TypeScript.
- `npm run lint` — ESLint.
- `npm run test:provider-node` — pruebas del protocolo y streaming del nodo.
- `npm run build` — compilación de producción.
- `npm start` — servidor de producción después de compilar.

## Docker

La imagen de la aplicación se construye con `docker build -t aveiroai .` y se ejecuta con `docker run --env-file .env.local -p 3000:3000 aveiroai`. El contenedor escucha en el puerto 3000 y usa salida standalone de Next.js. El Provider Node es un proceso separado.

## Modelos y acceso

El catálogo de política describe familias y rutas de acceso; no garantiza que un modelo esté activo. GPT y Claude son servicios propietarios y requieren acceso oficial autorizado de Aveiro y presupuesto. DeepSeek, Qwen, Kimi y Gemma se evalúan checkpoint por checkpoint antes de permitir alojamiento comunitario. gpt-oss es opcional y no es el modelo insignia ni una degradación forzada.

Si el modelo elegido no está disponible, Aveiro debe informar la indisponibilidad; nunca debe cambiar silenciosamente a otro modelo o proveedor de pago. Los modelos open-weight no implican inferencia gratuita: los operadores aportan GPU, electricidad, ancho de banda y mantenimiento.

## Arquitectura

- `app/page.tsx`: interfaz y estado de conversaciones.
- `app/api/chat/route.ts`: gateway server-side, dispatch al nodo comunitario y streaming.
- `app/api/providers/route.ts`: catálogo de proveedores configurados.
- `lib/models.ts`: modelos y tipos de proveedor.
- `lib/community-node.ts`: configuración server-side y firma de solicitudes del nodo.
- `provider-node/`: servicio independiente para nodos de GPU.
- `app/globals.css`: sistema visual Liquid Glass.

## Seguridad y privacidad

El historial se almacena en el navegador mediante localStorage y no se sincroniza entre dispositivos. El contenido enviado a un nodo comunitario puede ser inspeccionado técnicamente por el operador de ese nodo; no se promete confidencialidad extremo a extremo. El gateway no debe enviar identidad de usuario al nodo. La limitación incluida en memoria es una protección básica para despliegues pequeños; antes de abrir Aveiro al público hacen falta autenticación de usuarios, rate limiting compartido, cuotas, moderación, auditoría, reglas de retención y revisión de seguridad.

El Provider Node restringe su upstream a loopback para no convertirse en proxy arbitrario. No expongas su puerto HTTP directamente a Internet. Usa TLS, un proxy inverso seguro o una red privada, y restringe el tráfico entrante al control plane autorizado. No registres secretos ni prompts sensibles.

## Roadmap y decisiones

- [Community Compute Architecture](docs/architecture/AVEIRO-COMMUNITY-COMPUTE.md)
- [Provider Node Protocol v1](docs/architecture/PROVIDER-NODE-PROTOCOL.md)
- [Model Licensing and Hosting Decision Record](docs/models/MODEL-LICENSING-AND-HOSTING.md)
- Endpoint de política de modelos de solo lectura: `GET /api/model-access`

El objetivo final sigue siendo un servicio público independiente, multimodelo y remoto, sin API keys para usuarios finales. No se depende de cuentas personales, scraping de clientes web ni evasión de límites de proveedores.
