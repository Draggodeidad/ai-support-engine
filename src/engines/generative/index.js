// Motor generativo: interpreta la solicitud con un LLM real (Gemini u Ollama) y devuelve JSON validado.
import { setTimeout as sleep } from 'node:timers/promises';
import { EngineResultSchema } from '../../contract.js';
import { AppError } from '../../errors.js';
import { redactSecrets } from '../../security.js';
import { SYSTEM_INSTRUCTION, buildUserPrompt, RESPONSE_JSON_SCHEMA } from './prompt.js';
import { createGeminiProvider } from './providers/gemini.js';
import { createOllamaProvider } from './providers/ollama.js';

const MAX_ATTEMPTS = 2; // 1 intento + 1 reintento (JSON inválido o error transitorio del proveedor)

export function createProviderFromEnv(env = process.env) {
  const name = (env.LLM_PROVIDER || 'gemini').toLowerCase();
  if (name === 'gemini') return createGeminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || undefined });
  if (name === 'ollama') return createOllamaProvider({ host: env.OLLAMA_HOST || undefined, model: env.OLLAMA_MODEL || undefined });
  throw new AppError('LLM_NOT_CONFIGURED', 'Proveedor generativo no soportado', 503);
}

export function createGenerativeEngine({ getProvider = () => createProviderFromEnv(), timeoutMs = Number(process.env.LLM_TIMEOUT_MS) || 30000, retryDelayMs = 1500 } = {}) {
  let provider;

  async function analyze(message) {
    provider ??= getProvider();
    if (!provider) throw new AppError('LLM_NOT_CONFIGURED', 'El motor generativo no está configurado', 503);

    // No se envían secretos del usuario a un proveedor externo.
    const user = buildUserPrompt(redactSecrets(message));

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let text;
      try {
        text = await callWithTimeout(provider, user, timeoutMs);
      } catch (err) {
        // Errores transitorios del proveedor (500/503 "high demand"): un reintento con espera.
        if (err.transient && attempt < MAX_ATTEMPTS) {
          console.warn(`[generative] error transitorio de ${provider.name}, reintentando (intento ${attempt}/${MAX_ATTEMPTS})`);
          await sleep(retryDelayMs);
          continue;
        }
        throw err;
      }
      const result = parseAndValidate(text);
      if (result) return result;
      console.warn(`[generative] salida inválida de ${provider.name} (intento ${attempt}/${MAX_ATTEMPTS})`);
    }
    throw new AppError('LLM_INVALID_OUTPUT', 'El modelo generativo devolvió una respuesta con formato inválido', 502);
  }

  return { analyze };
}

async function callWithTimeout(provider, user, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await provider.generate({ system: SYSTEM_INSTRUCTION, user, schema: RESPONSE_JSON_SCHEMA, signal: controller.signal });
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Solo se registra el estado, nunca la key ni el cuerpo de la petición.
    console.error(`[generative] error de ${provider.name}: status=${err?.providerStatus ?? 'n/a'} aborted=${!!err?.aborted}`);
    if (err?.aborted || controller.signal.aborted) {
      throw new AppError('LLM_TIMEOUT', 'El modelo generativo no respondió a tiempo', 504);
    }
    if (err?.providerStatus === 429) {
      throw new AppError('LLM_RATE_LIMITED', 'Se alcanzó el límite de uso del proveedor generativo, intenta más tarde', 429);
    }
    const appErr = new AppError('LLM_PROVIDER_ERROR', 'Error al comunicarse con el proveedor generativo', 502);
    appErr.transient = [500, 502, 503].includes(err?.providerStatus);
    throw appErr;
  } finally {
    clearTimeout(timer);
  }
}

// Comprueba que la respuesta del modelo sea JSON y cumpla el contrato exacto.
export function parseAndValidate(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let data;
  try {
    data = JSON.parse(cleaned);
  } catch {
    return null;
  }
  const parsed = EngineResultSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

const defaultEngine = createGenerativeEngine();
export const analyze = defaultEngine.analyze;
