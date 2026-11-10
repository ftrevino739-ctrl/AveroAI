# AveroAI — motor local

AveroAI es una interfaz privada de chat con identidad visual propia. En esta rama, **la generación se ejecuta en el equipo del usuario mediante Ollama y pesos descargados localmente**. AveroAI no usa la API de Venice, no manda prompts a Venice y no tiene wallet ni pagos x402.

## Cómo funciona

```text
Navegador
   │
AveroAI (Next.js, en el mismo PC)
   │
Ollama local (127.0.0.1:11434)
   │
Pesos GGUF instalados en el disco
   │
CPU / GPU local
```

La API interna de Ollama en localhost solo es el puente local entre AveroAI y el motor de inferencia. No es una API de Venice ni un servicio remoto. Para el modo local, AveroAI y Ollama deben ejecutarse en el mismo equipo. Un despliegue de AveroAI en un hosting remoto no puede acceder al `127.0.0.1` del visitante.

## Catálogo investigado en Venice

El catálogo de Venice publica modelos de varios proveedores. Su filtro de pesos distingue entre modelos abiertos (el creador publicó los pesos) y cerrados (solo disponibles mediante la API del creador). La lista de modelos cambia y los recuentos incluyen texto, imagen, vídeo y audio; no todos son modelos LLM ni todos son descargables.

AveroAI conserva metadatos y enlaces de origen, pero no incluye archivos de pesos dentro de GitHub, Docker ni el despliegue web.

### Selección honesta para este equipo

Se toma como referencia un equipo con 8 GB de RAM total y GPU/VRAM no confirmada.

| Modelo | Estado de pesos | Tamaño / requisitos | Decisión |
|---|---|---|---|
| Qwen 2.5 3B Uncensored Test Q4_K_M (TensorBlock) | Derivado comunitario GGUF, Apache-2.0 | Archivo de unos 1.93 GB | Candidato más realista para probar en 8 GB; no es el checkpoint exacto de Venice. |
| Qwen 2.5 7B Abliterated Q3_K_M (TensorBlock) | Derivado comunitario GGUF, Apache-2.0 | Archivo de unos 3.547 GB; requiere memoria adicional al archivo | No recomendado con 8 GB totales; mejor equipo con 12–16 GB o más. |
| Venice Uncensored 1.2 | Pesos abiertos, Apache-2.0; Mistral 24B | 24B parámetros; las cuantizaciones comunitarias siguen siendo grandes | No cabe en 8 GB. |
| Gemma 4 Uncensored | Pesos abiertos según la ficha de Venice; 26B totales / ~4B activos | Los parámetros activos no representan el tamaño completo de los pesos | No cabe en 8 GB. |
| DeepSeek V4.1 Flash 1017 Uncensored | Pesos abiertos, MIT; MoE de 552B totales | FP8 y cuantizaciones comunitarias enormes; 8B/16B activos no significan un modelo de 8B | No cabe en 8 GB. |
| Kimi K3.1 Pro | Open weights, licencia propia de Moonshot; 2.8T totales | Enorme modelo MoE | No cabe en 8 GB. |

El preset inicial de 3B es una variante comunitaria de Qwen 2.5, no una copia exacta del modelo Qwen 2.5 7B que Venice ofrece. “Uncensored” o “abliterated” indica un ajuste para reducir negativas; no garantiza respuestas correctas, ausencia total de rechazos ni que todos los usos estén permitidos. Respeta la licencia de cada peso.

## Instalar el modelo ligero para 8 GB

Recomendación inicial: cerrar aplicaciones pesadas y probar con contexto moderado. La RAM real necesaria es mayor que el tamaño del archivo GGUF; Windows también necesita memoria. Si el sistema empieza a usar mucho archivo de paginación o se queda sin memoria, detén el modelo.

1. Instala Ollama para Windows desde https://ollama.com/download.
2. Abre PowerShell y ejecuta:

```powershell
ollama run hf.co/tensorblock/Qwen2.5-3B-Instruct-Uncensored-Test-GGUF:Q4_K_M
```

El primer inicio descarga los pesos desde Hugging Face. El modelo Q4_K_M ocupa aproximadamente 1.93 GB en disco. El modelo puede tardar en cargar y generar despacio en CPU.
3. Deja Ollama abierto. AveroAI detectará modelos instalados automáticamente.

Para intentar la variante de 7B (no recomendada con 8 GB totales):

```powershell
ollama run hf.co/tensorblock/Qwen2.5-7B-Instruct-abliterated-GGUF:Q3_K_M
```

No instales los modelos 24B, 26B, 552B o 2.8T en este equipo.

## Ejecutar AveroAI localmente

Requisitos: Node.js 22, Git y Ollama instalado.

```powershell
git clone https://github.com/ftrevino739-ctrl/AveroAI.git
cd AveroAI
git checkout feature/local-models-8gb
npm install
Copy-Item .env.example .env.local
notepad .env.local
```

Configura `AVERO_ACCESS_CODE` (16 caracteres como mínimo) y `AVERO_SESSION_SECRET` (32 bytes como mínimo). La URL de Ollama por defecto es `http://127.0.0.1:11434`.

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm run dev
```

Abre `http://localhost:3000`. La sección de ajustes muestra los modelos instalados y una biblioteca curada con el tamaño, licencia, fuente y comando de importación.

## Hosting gratuito: límite importante

Un hosting gratuito puede alojar una landing page o la interfaz, pero no proporciona automáticamente GPU/RAM para estos modelos. Si AveroAI se aloja remotamente, el backend remoto no puede usar la RAM de tu PC. Para conservar inferencia sin API externa, AveroAI y Ollama se deben ejecutar en el mismo PC, o se necesitaría un cliente/compañero local instalado junto a la web. Para dar inferencia local a otras personas, cada persona tendría que ejecutar sus propios pesos o habría que pagar un servidor con GPU.

## Seguridad y privacidad

- No hay llamadas a Venice ni proveedores externos para generar respuestas.
- No hay claves privadas de wallet ni recargas.
- Los pesos se descargan desde la fuente del creador directamente al dispositivo; no se suben al repositorio.
- El servidor local por defecto escucha en localhost. No lo expongas públicamente ni abras el puerto 11434 al Internet sin autenticación y controles adecuados.
- El código de acceso es compartido y las sesiones usan cookie HttpOnly; no es una solución multiusuario para publicación pública.

## Estado y verificaciones

GitHub Actions verifica pruebas, TypeScript, lint, build y Docker. Esas comprobaciones no sustituyen la prueba real de una descarga ni de inferencia en una máquina con 8 GB. Primero hay que confirmar que Ollama descarga y ejecuta el modelo ligero en el PC objetivo.
