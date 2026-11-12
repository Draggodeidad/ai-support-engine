// Contrato compartido entre la API y ambos motores.
// Cualquier motor debe exportar: async analyze(message: string) => EngineResult
import { z } from 'zod';

export const CATEGORIES = ['ACCESS', 'BUG', 'FEATURE', 'SECURITY'];
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const MODES = ['traditional', 'generative'];

export const MAX_MESSAGE_LENGTH = 2000;

// Petición entrante a POST /api/analyze
export const AnalyzeRequestSchema = z
  .object({
    message: z
      .string({ error: 'message debe ser un texto' })
      .trim()
      .min(3, 'message debe tener al menos 3 caracteres')
      .max(MAX_MESSAGE_LENGTH, `message no puede superar ${MAX_MESSAGE_LENGTH} caracteres`),
    mode: z.enum(MODES, { error: `mode debe ser uno de: ${MODES.join(', ')}` }),
  })
  .strict();

// Lo que devuelve cada motor (sin `mode`)
export const EngineResultSchema = z
  .object({
    category: z.enum(CATEGORIES),
    priority: z.enum(PRIORITIES),
    response: z.string().trim().min(1).max(1500),
    requiresHumanReview: z.boolean(),
  })
  .strict();

// Respuesta final de la API (ambos motores cumplen el mismo contrato)
export const AnalyzeResponseSchema = EngineResultSchema.extend({
  mode: z.enum(MODES),
}).strict();
