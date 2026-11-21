# Aveiro.ai

Aveiro.ai es una plataforma web multimodelo en desarrollo, con interfaz Liquid Glass, historial local, selector de modelos y un gateway de inferencia en servidor. El objetivo del producto es que el usuario final no tenga que aportar API keys: los modelos open-weight se atenderán remotamente mediante nodos comunitarios y los modelos propietarios solo se habilitarán con acceso oficial financiado por Aveiro.

## Funciones incluidas

- Interfaz adaptable a escritorio, tablet y móvil, con tema claro y oscuro.
- Conversaciones múltiples con guardado local en el navegador.
- Selector de modelos con búsqueda y catálogo inicial.
- Respuestas en streaming y opción para detener la generación.
- Copiar respuestas y exportar conversaciones a JSON.
- Adjuntar archivos de texto, Markdown, CSV, JSON y LOG (hasta 150 KB).
- La ruta pública de inferencia está restringida a modelos open-weight servidos por nodos comunitarios aprobados; los adaptadores de proveedores propietarios no forman parte del catálogo público.
- Prototipo de dispatch a un nodo remoto de Aveiro, autenticado con HMAC y sin API key del usuario.
- Servicio independiente Provider Node con allowlist de modelos, límites, timeout y streaming.
- Las credenciales del servidor no se exponen al navegador.
- GitHub Actions comprueba dependencias de producción (npm audit, bloquea vulnerabilidades altas), tipos, lint, pruebas del nodo, autenticación PostgreSQL/Redis, seguridad de origen y CSRF, compilación de producción y build Docker.

## Experiencia del usuario final: solo navegador

**Aveiro.ai no requiere instalar nada en el dispositivo del usuario.** El usuario entra desde la web pública, elige un modelo y conversa. No necesita Node.js, Python, Docker, extensiones, aplicación de escritorio, modelos descargados, GPU propia ni API keys personales. Toda inferencia ocurre en infraestructura remota autorizada por Aveiro.

Las instrucciones de instalación que aparecen a continuación son exclusivamente para desarrolladores que quieran ejecutar el proyecto durante su desarrollo. La instalación del Provider Node corresponde únicamente a voluntarios/organizaciones que decidan aportar GPU desde una máquina remota propia; nunca forma parte del registro ni del uso normal de Aveiro.

Contrato completo de producto y criterios de aceptación: [End-user installation and remote execution contract](docs/architecture/END-USER-EXPERIENCE.md).

## Requisitos e instalación

Requiere Node.js 20.9 o superior únicamente para desarrollo local. Para revisar la interfaz, el usuario final solo necesita abrir la vista previa web; no necesita instalar nada ni proporcionar API keys.

Para desarrollo local:
1. Clona el repositorio.
2. Ejecuta `npm install`.
3. Copia `.env.example` como `.env.local`.
4. Ejecuta `npm run dev` y abre `http://localhost:3000`.

La interfaz puede revisarse sin una GPU, pero la inferencia real no estará disponible hasta provisionar PostgreSQL, Redis, SMTP y el origen HTTPS, registrar un Provider Node remoto, conectar un runtime compatible y aprobar al menos un modelo exacto. No configures claves personales de OpenAI, Anthropic, Gemini u otros servicios como sustituto: el camino público de inferencia está limitado a nodos comunitarios aprobados.

## Variables de entorno

| Variable | Proveedor / uso |
| --- | --- |
| `AVEIRO_DATABASE_URL` | PostgreSQL durable para cuentas; solo servidor y TLS obligatorio en producción |
| `AVEIRO_DATABASE_SSL` | Configura `require` para exigir TLS en el cliente PostgreSQL |
| `AVEIRO_DEFAULT_REQUESTS_PER_MONTH` | Límite mensual finito de solicitudes para cuentas sin un plan explícito; no habilita facturación por tokens |
| `AVEIRO_AUTH_ORIGIN` | Origen HTTPS canónico para los enlaces de acceso y validación de Origin |
| `AVEIRO_SMTP_HOST` / `AVEIRO_SMTP_PORT` | Servidor SMTP de correo; 465 usa TLS directo y otros puertos requieren STARTTLS |
| `AVEIRO_SMTP_USER` / `AVEIRO_SMTP_PASS` | Credenciales SMTP privadas del servidor |
| `AVEIRO_SMTP_FROM` | Remitente verificado de correo de acceso |
| `AVEIRO_REQUIRE_AUTH` | Fuerza el login en desarrollo; producción lo requiere por defecto (Vercel Preview queda como entorno de revisión) |
| `AVEIRO_PROVIDER_NODE_URL` | URL HTTPS del Provider Node (HTTP solo en loopback para desarrollo) |
| `AVEIRO_NODE_ID` | Identificador del nodo |
| `AVEIRO_NODE_SECRET` | Secreto HMAC compartido entre el servidor de Aveiro y ese nodo |
| `AVEIRO_COMMUNITY_MODEL_ID` | ID exacto del modelo que el nodo tiene autorizado |
| `AVEIRO_COMMUNITY_MODEL_NAME` | Nombre que aparece en el selector |
| `AVEIRO_REDIS_REST_URL` | Endpoint HTTPS de Upstash Redis REST, solo servidor |
| `AVEIRO_REDIS_REST_TOKEN` | Token de Upstash, solo servidor |
| `AVEIRO_NODE_SECRET_ENCRYPTION_KEY` | Clave de 32 bytes (64 hex) para cifrar secretos HMAC en Redis |
| `AVEIRO_ADMIN_TOKEN` | Token Bearer privado para administrar nodos |
| `AVEIRO_APPROVED_COMMUNITY_MODELS` | Lista de IDs exactos aprobados tras revisión de licencia |

Todos los valores del proceso Provider Node se configuran por separado en `provider-node/.env.example` (plantilla); nunca los necesita un usuario final ni deben copiarse al proyecto web. `AVEIRO_NODE_ID` y `AVEIRO_NODE_SECRET` aparecen arriba solo para compatibilidad con el adaptador estático antiguo.


No guardes secretos en Git ni en variables del cliente como `NEXT_PUBLIC_*`. Los usuarios finales nunca configuran claves de proveedores de IA: la inferencia pública depende exclusivamente de los nodos GPU remotos aprobados de Aveiro. Los secretos de infraestructura y de nodos se configuran únicamente en los paneles privados del servidor y nunca llegan al navegador.

## Registro y disponibilidad de nodos comunitarios

La configuración de hosting y el proceso de primera publicación están en [Infrastructure Bootstrap](docs/deployment/INFRASTRUCTURE-BOOTSTRAP.md). El servicio incluye `GET /api/health` para liveness y `GET /api/ready` para validar los secretos, PostgreSQL con TLS, Redis, el origen HTTPS, SMTP y un límite mensual finito. Readiness comprueba `PING` real de Redis y `SELECT 1` en PostgreSQL; SMTP se valida por configuración, sin enviar correos de prueba.

El control plane ya incluye un registro persistente y privado de proveedores, emisión de credenciales por el administrador, revocación y heartbeats HMAC. Usa Redis REST compatible con Upstash; los secretos HMAC se almacenan cifrados con AES-256-GCM. El Provider Node envía heartbeats cada 30 segundos y reporta solo los modelos exactos que su runtime anuncia en `GET /v1/models`. Un nodo se considera desconectado después de 90 segundos sin heartbeat. El selector publica modelos solo cuando están aprobados y hay un nodo listo; el gateway reserva capacidad y despacha al nodo remoto que sirve el ID exacto.

Configuración y endpoints: [Provider Registry and Heartbeat](docs/architecture/PROVIDER-REGISTRY-AND-HEARTBEAT.md). El scheduler inicial ya puede enrutar las conversaciones a nodos registrados y listos, con reservas atómicas de concurrencia en Redis. Si no hay capacidad para el modelo exacto, devuelve indisponibilidad y no hace fallback a otro modelo. El Provider Node puede opt-in a reportes de tokens que exponga su runtime, firmados por HMAC y vinculados a la solicitud exacta. Se guardan solo como telemetría `provider_self_reported`, no como medición financiera: el operador controla el secreto y puede falsear sus propios conteos. El scheduler todavía no tiene cola durable ni reintentos entre nodos; el conjunto no se ha probado contra una base Redis de producción ni una GPU real y no habilita créditos ni facturación.

## Infraestructura web y despliegue

La primera ruta de staging preparada es **Vercel + Upstash Redis REST + PostgreSQL administrado + SMTP**. Incluye `vercel.json` con la región inicial `iad1`, duración máxima de 180 segundos para el gateway de chat, un endpoint de liveness (`GET /api/health`) y un endpoint de readiness (`GET /api/ready`) que valida la configuración de cuentas y comprueba conectividad real con Redis y PostgreSQL.

Guía de aprovisionamiento de PostgreSQL, Redis, SMTP, configuración de secretos y verificación: [Infrastructure Bootstrap](docs/deployment/INFRASTRUCTURE-BOOTSTRAP.md). Ninguna cuenta, base de datos, dominio, servicio de correo ni GPU se ha creado automáticamente: esos recursos pertenecen al administrador y se configuran desde los paneles oficiales. El Dockerfile existente se conserva para desplegar en otros proveedores de contenedores.

**Importante:** Vercel Hobby solo permite uso personal/no comercial. Antes de convertir Aveiro en un servicio comercial o público, hay que elegir un plan/host que autorice ese uso y definir presupuesto operativo. Upstash Free es para prototipos y tiene límites mensuales; no debe tratarse como infraestructura ilimitada.

## Provider Node comunitario (prototipo)

El servicio está en `provider-node/`. El operador del nodo ejecuta el servicio junto a un runtime local compatible con OpenAI, como vLLM, SGLang o llama.cpp. El nodo solo acepta los IDs exactos configurados en `AVEIRO_ALLOWED_MODELS`, valida firmas HMAC con marca temporal y nonce, y envía los trabajos al runtime de loopback local.

La plataforma puede añadir al selector el modelo configurado en el servidor mediante las variables `AVEIRO_*`. El usuario final solo elige el modelo y conversa; nunca introduce una API key. Aveiro envía el trabajo al Provider Node remoto y procesa el flujo de respuesta.

Configuración, comandos y límites técnicos: [Provider Node README](provider-node/README.md). Protocolo: [Provider Node Protocol v1](docs/architecture/PROVIDER-NODE-PROTOCOL.md).

**Estado actual:** ya están implementados y cubiertos por CI el registro privado de nodos, heartbeat firmado, scheduler inicial, cuentas por enlace mágico, sesiones Redis con CSRF, cuotas mensuales persistentes por cuenta, panel de uso, endpoint de readiness y telemetría de tokens firmada y no facturable. El despliegue Preview de Vercel está publicado, pero el indicador `Ready` solo confirma que Vercel creó el deployment; no demuestra que PostgreSQL, Redis, SMTP o una GPU estén configurados y disponibles.

**Lo que falta para probar inferencia real:** provisionar PostgreSQL y Redis persistentes; configurar SMTP con remitente verificado y `AVEIRO_AUTH_ORIGIN` HTTPS; aplicar las migraciones `0001` y `0002`; registrar un Provider Node remoto con HTTPS y restricciones de red; conectar un runtime compatible con un checkpoint y licencia revisados; aprobar el ID exacto del modelo y comprobar una conversación real de extremo a extremo. Sin un nodo aprobado y listo, el selector debe permanecer vacío y el chat debe responder que el modelo no está disponible.

**Pendiente de producto/operación:** cola durable y reintentos controlados entre nodos, sincronización cloud del historial, medición de tokens independiente del operador, implementación de cargos/créditos y revisión de seguridad independiente. El reporte HMAC de tokens actual es autorreportado por el operador y no sirve para facturación. El esquema de ledger existe, pero no hay cobros ni recompensas habilitados. Mantén deshabilitado el acceso público de operadores hasta completar la revisión.

## Cuentas: base de persistencia

Se añadió un adaptador PostgreSQL de conexión perezosa y una capa transaccional para emitir y consumir enlaces mágicos de un solo uso. El token se genera de forma criptográficamente aleatoria, solo se guarda su hash SHA-256, caduca a los 15 minutos y su consumo es atómico incluso ante dos redenciones simultáneas. El CI ejecuta pruebas de integración reales contra PostgreSQL 16.

Se añadieron rutas para solicitar y verificar enlaces, consultar la sesión y cerrarla, junto con entrega SMTP genérica. El token viaja en el fragmento del navegador y requiere una confirmación explícita; las sesiones usan cookies host-only `__Host-` y CSRF doble ligado a Redis. Las rutas fallan de forma cerrada si faltan PostgreSQL, Redis, origen canónico o SMTP. Aún falta provisionar esos servicios reales para activar el acceso en el despliegue. El usuario final seguirá entrando únicamente desde el navegador y nunca necesitará API keys.

En producción, el gateway de chat requiere una sesión activa y una prueba CSRF válida; Vercel Preview conserva el modo de revisión. La identidad del usuario nunca se reenvía al Provider Node. El límite mensual de solicitudes por cuenta se reserva y cuenta de forma transaccional en PostgreSQL. La medición autoritativa de tokens y los créditos siguen deshabilitados; una solicitud ejecutada consume una unidad de solicitud, pero no genera cargos ni recompensas.

## Comandos

- `npm run dev` — servidor de desarrollo.
- `npm run typecheck` — comprobación TypeScript.
- `npm run lint` — ESLint.
- `npm run test:provider-node` — pruebas del protocolo y streaming del nodo.
- `npm run test:identity-store` — pruebas PostgreSQL de identidad (requiere `AVEIRO_DATABASE_URL`).
- `npm run test:quota-store` — pruebas PostgreSQL de cuotas concurrentes (requiere `AVEIRO_DATABASE_URL`).
- `npm run test:session-store` — pruebas de sesiones Redis y CSRF usando un almacén simulado.
- `npm run test:auth-security` — pruebas del origen canónico, cookies y construcción de enlaces.
- `npm run test:readiness-config` — pruebas de configuración completa de producción.
- `npm run build` — compilación de producción.
- `npm start` — servidor de producción después de compilar.

## Docker

La imagen de la aplicación se construye con `docker build -t aveiroai .` y se ejecuta con `docker run --env-file .env.local -p 3000:3000 aveiroai`. El contenedor escucha en el puerto 3000 y usa salida standalone de Next.js. El Provider Node es un proceso separado.

## Modelos y acceso

El catálogo de política describe familias y rutas de acceso; no garantiza que un modelo esté activo. GPT y Claude son servicios propietarios y requieren acceso oficial autorizado de Aveiro y presupuesto. DeepSeek, Qwen, Kimi y Gemma se evalúan checkpoint por checkpoint antes de permitir alojamiento comunitario. gpt-oss es opcional y no es el modelo insignia ni una degradación forzada.

Si el modelo elegido no está disponible, Aveiro debe informar la indisponibilidad; nunca debe cambiar silenciosamente a otro modelo o proveedor de pago. Los modelos open-weight no implican inferencia gratuita: los operadores aportan GPU, electricidad, ancho de banda y mantenimiento.

## Arquitectura

- `app/page.tsx`: interfaz y estado de conversaciones.
- `app/api/chat/route.ts`: gateway server-side, autenticación, reserva mensual por cuenta, dispatch al nodo comunitario y streaming.
- `app/api/account/usage/route.ts`: resumen del límite mensual de solicitudes.
- `app/api/providers/route.ts`: catálogo de proveedores configurados.
- `app/api/health/route.ts` y `app/api/ready/route.ts`: liveness y readiness de infraestructura.
- `lib/models.ts`: modelos y tipos de proveedor.
- `lib/community-node.ts`: configuración server-side y firma de solicitudes del nodo.
- `lib/postgres.ts` y `lib/identity-store.ts`: conexión PostgreSQL perezosa y primitivas transaccionales de enlaces mágicos.
- `lib/session-store.ts`: sesiones Redis opacas, CSRF ligado a sesión, revocación y expiraciones.
- `lib/quota-store.ts`: admisión transaccional de solicitudes por cuenta y periodo UTC mensual; registra uso no medido sin estimar tokens.
- `lib/provider-usage.ts` y `lib/provider-usage-store.ts`: verifican y almacenan reportes de uso firmados como telemetría `provider_self_reported`; no habilitan facturación.
- `lib/mail.ts`: adaptador SMTP genérico para enlaces de un solo uso.
- `lib/auth-security.ts`: origen canónico, cookies host-only y validación CSRF.
- `app/auth/page.tsx`: interfaz browser-only de solicitud y confirmación de acceso.
- `provider-node/`: servicio independiente para nodos de GPU.
- `db/migrations/`: esquema PostgreSQL para cuentas, verificación de correo, límites, reservas y ledger append-only; se valida en CI con PostgreSQL 16 y lo utilizan los almacenes de identidad y cuotas.
- `app/globals.css`: sistema visual Liquid Glass.

## Seguridad y privacidad

El historial se almacena en el navegador mediante localStorage y no se sincroniza entre dispositivos. El contenido enviado a un nodo comunitario puede ser inspeccionado técnicamente por el operador de ese nodo; no se promete confidencialidad extremo a extremo. El gateway no debe enviar identidad de usuario al nodo. El endpoint de chat ahora aplica un límite compartido de 15 solicitudes por IP cada 60 segundos mediante Redis Lua atómico; las IP se convierten en HMAC antes de almacenarse y Redis se considera obligatorio (si falla, el gateway responde 503 en lugar de desactivar la protección). Este control por IP no sustituye autenticación, cuotas persistentes por cuenta, moderación, auditoría, reglas de retención ni revisión de seguridad.

El Provider Node restringe su upstream a loopback para no convertirse en proxy arbitrario. No expongas su puerto HTTP directamente a Internet. Usa TLS, un proxy inverso seguro o una red privada, y restringe el tráfico entrante al control plane autorizado. No registres secretos ni prompts sensibles.

## Roadmap y decisiones

- [Community Compute Architecture](docs/architecture/AVEIRO-COMMUNITY-COMPUTE.md)
- [Provider Node Protocol v1](docs/architecture/PROVIDER-NODE-PROTOCOL.md)
- [Model Licensing and Hosting Decision Record](docs/models/MODEL-LICENSING-AND-HOSTING.md)
- Endpoint de política de modelos de solo lectura: `GET /api/model-access`

El objetivo final sigue siendo un servicio público independiente, multimodelo y remoto, sin API keys para usuarios finales. No se depende de cuentas personales, scraping de clientes web ni evasión de límites de proveedores.
