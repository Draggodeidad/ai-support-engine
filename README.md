# AI Support Engine

Prototipo de clasificación inteligente de solicitudes de soporte con dos motores que cumplen el mismo contrato:

- **traditional**: IA simbólica basada en reglas y palabras clave (sin modelos generativos).
- **generative**: LLM real, configurable entre **Gemini** (Google AI Studio, plan gratuito) y **Ollama** (local).

Enunciado completo: [`docs/reto.md`](docs/reto.md) · Reparto del equipo: [`docs/TAREAS.md`](docs/TAREAS.md)

> 🚧 Estado: baseline. Los motores devuelven `501 NOT_IMPLEMENTED` hasta que se integren sus ramas.

## Requisitos

- Node.js ≥ 22
- Para el motor generativo: una API key de Gemini (https://aistudio.google.com/api-keys) **o** Ollama instalado con un modelo descargado (`ollama pull qwen2.5:3b`).

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
| 500 | `INTERNAL_ERROR` | Error inesperado (sin detalles internos) |

Ejemplo:
```bash
curl -X POST localhost:3000/api/analyze -H 'Content-Type: application/json' \
  -d '{"message":"No puedo iniciar sesión","mode":"traditional"}'
```

### `GET /health`
`{ "status": "ok" }`

## Estructura

```
src/
  contract.js              # Schemas Zod compartidos (petición, salida de motor, respuesta)
  app.js / server.js       # Express
  engines/traditional/     # Motor por reglas
  engines/generative/      # Motor LLM (Gemini / Ollama)
scripts/compare.js         # Ejecuta ambos motores sobre tests/cases.json
tests/                     # Vitest + dataset de casos con clasificación de referencia
results/                   # Evidencias y tabla comparativa
```

## Resultados y conclusión

_Pendiente._
