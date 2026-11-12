// Motor generativo (LLM real: Gemini o Ollama según LLM_PROVIDER).
// Debe devolver exactamente: { category, priority, response, requiresHumanReview }
import { NotImplementedError } from '../../errors.js';

export async function analyze(message) {
  throw new NotImplementedError('El motor generativo');
}
