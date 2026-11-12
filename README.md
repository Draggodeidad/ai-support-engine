# AI Support Engine

Prototipo de clasificación inteligente de solicitudes de soporte con dos motores que cumplen el mismo contrato:

- **traditional**: IA simbólica basada en reglas y palabras clave (sin modelos generativos).
- **generative**: LLM real, configurable entre **Gemini** (Google AI Studio, plan gratuito) y **Ollama** (local).

Enunciado completo: [`docs/reto.md`](docs/reto.md) · Reparto del equipo: [`docs/TAREAS.md`](docs/TAREAS.md)

> 🚧 Estado: motor generativo y capa de seguridad listos; motor tradicional en desarrollo (`501` hasta integrarse).

## Requisitos

- Node.js ≥ 22
- Para el motor generativo: una API key de Gemini (https://aistudio.google.com/api-keys, plan gratuito) **o** Ollama instalado con un modelo descargado (`ollama pull qwen2.5:3b`).

## Configuración (`.env`)

| Variable | Default | Descripción |
|---|---|---|
| `LLM_PROVIDER` | `gemini` | `gemini` o `ollama` |
| `GEMINI_API_KEY` | — | Key de Google AI Studio (nunca se versiona) |
| `GEMINI_MODEL` | `gemini-3.5-flash` | Modelo Gemini |
| `OLLAMA_HOST` | `http://localhost:11434` | Servidor Ollama |
| `OLLAMA_MODEL` | `qwen2.5:3b` | Modelo local |
| `LLM_TIMEOUT_MS` | `30000` | Timeout por llamada al LLM |
| `COMPARE_DELAY_MS` | `4000` (gemini) | Pausa entre llamadas en `npm run compare` (límite del plan gratuito) |

## Instalación y ejecución

```bash
npm install
cp .env.example .env      # rellena GEMINI_API_KEY o cambia LLM_PROVIDER=ollama
npm run dev               # http://localhost:3000
npm test                  # pruebas unitarias y de API
npm run compare           # pruebas comparativas -> results/results.md
```

## API

### `POST /api/analyze`

Petición:
```json
{ "message": "No puedo iniciar sesión", "mode": "generative" }
```
- `message`: texto de 3 a 2000 caracteres.
- `mode`: `traditional` | `generative`.

Respuesta `200`:
```json
{
  "category": "ACCESS",
  "priority": "MEDIUM",
  "response": "Lamentamos el inconveniente. Verifique sus credenciales...",
  "requiresHumanReview": false,
  "mode": "generative"
}
```
- `category`: `ACCESS` | `BUG` | `FEATURE` | `SECURITY`
- `priority`: `LOW` | `MEDIUM` | `HIGH` | `CRITICAL`

Errores (siempre `{ "error": { "code", "message", "details?" } }`):

| Status | code | Causa |
|---|---|---|
| 400 | `INVALID_REQUEST` / `INVALID_JSON` | Body inválido |
| 413 | `PAYLOAD_TOO_LARGE` | Body > 10 KB |
| 501 | `NOT_IMPLEMENTED` | Motor aún no disponible |
| 502 | `ENGINE_INVALID_OUTPUT` | El motor devolvió un formato que no cumple el contrato |
| 502 | `LLM_INVALID_OUTPUT` | El LLM devolvió JSON inválido dos veces seguidas |
| 502 | `LLM_PROVIDER_ERROR` | Error del proveedor (tras 1 reintento si era transitorio) |
| 503 | `LLM_NOT_CONFIGURED` | Falta `GEMINI_API_KEY` o el proveedor no es válido |
| 504 | `LLM_TIMEOUT` | El LLM no respondió en `LLM_TIMEOUT_MS` |
| 429 | `LLM_RATE_LIMITED` | Límite de uso del proveedor |
| 500 | `INTERNAL_ERROR` | Error inesperado (sin detalles internos) |

Ejemplo:
```bash
curl -X POST localhost:3000/api/analyze -H 'Content-Type: application/json' \
  -d '{"message":"No puedo iniciar sesión","mode":"traditional"}'
```

### `GET /health`
`{ "status": "ok" }`

## Motor generativo

`src/engines/generative/`:
1. **Interpreta** la solicitud con un LLM real (Gemini vía `@google/genai` u Ollama vía `/api/chat`). Nada está simulado.
2. **Salida estructurada**: se pasa al modelo un JSON Schema generado desde el contrato Zod (`z.toJSONSchema`), con `temperature: 0`.
3. **Validación**: la respuesta se parsea y valida contra `EngineResultSchema` (campos exactos, enums). Si no cumple, se reintenta una vez y después se devuelve `502 LLM_INVALID_OUTPUT`.
4. **Errores del proveedor**: timeout con `AbortController`, un reintento ante 5xx transitorios y mapeo a códigos HTTP claros. Nunca se reenvía al cliente el mensaje interno del proveedor.

## Seguridad

- **Validación de entrada**: Zod estricto (sin campos extra), 3–2000 caracteres, body ≤ 10 KB, JSON mal formado → 400.
- **Prompt injection**: el mensaje va entre `<solicitud>…</solicitud>` y se trata como dato; los delimitadores inyectados se neutralizan. La instrucción del sistema ordena ignorar órdenes del usuario y marcar la manipulación para revisión humana.
- **Política post-motor** (`src/security.js`, aplicada a **ambos** motores en `src/pipeline.js`): si la categoría es `SECURITY`, si hay indicios de incidente (inyección, hackeo, filtración, phishing…) o si se detecta un intento de manipulación, entonces `requiresHumanReview = true`. `SECURITY` nunca baja de `HIGH`. Así, aunque un modelo fuera manipulado, no puede rebajar un incidente.
- **Secretos**: la API key solo vive en `.env` (ignorado por git). Los secretos que pegue el usuario (keys, tokens, JWT, contraseñas, tarjetas) se redactan **antes** de enviarlos al proveedor externo y también en la respuesta. Los logs solo registran el estado HTTP del proveedor.

## Estructura

```
src/
  contract.js              # Schemas Zod compartidos (petición, salida de motor, respuesta)
  app.js / server.js       # Express
  pipeline.js              # motor -> validación -> política de seguridad (API y comparativa)
  security.js              # redacción de secretos, detección de injection/incidentes, política
  engines/traditional/     # Motor por reglas
  engines/generative/      # Motor LLM (Gemini / Ollama)
scripts/compare.js         # Ejecuta ambos motores sobre tests/cases.json
tests/                     # Vitest + dataset de casos con clasificación de referencia
results/                   # Evidencias y tabla comparativa
```

## Resultados y conclusión

_Pendiente._
