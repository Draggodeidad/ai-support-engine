// Flujo común para la API y el script comparativo:
// motor -> validación del contrato -> política de seguridad.
import { EngineResultSchema } from './contract.js';
import { getEngine as defaultGetEngine } from './engines/index.js';
import { AppError } from './errors.js';
import { applySecurityPolicy } from './security.js';

export async function analyzeMessage(message, mode, { getEngine = defaultGetEngine } = {}) {
  const raw = await getEngine(mode).analyze(message);

  const parsed = EngineResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError('ENGINE_INVALID_OUTPUT', 'El motor devolvió un formato inválido', 502);
  }

  const { result, flags } = applySecurityPolicy(message, parsed.data);
  return { result: { ...result, mode }, raw: parsed.data, flags };
}
