// Proveedor Gemini (Google AI Studio) con salida JSON estructurada.
import { GoogleGenAI } from '@google/genai';

export function createGeminiProvider({ apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || 'gemini-3.5-flash' } = {}) {
  if (!apiKey) return null;
  const ai = new GoogleGenAI({ apiKey });

  return {
    name: 'gemini',
    model,
    async generate({ system, user, schema, signal }) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: user,
          config: {
            systemInstruction: system,
            responseMimeType: 'application/json',
            responseJsonSchema: schema,
            temperature: 0,
            thinkingConfig: { thinkingLevel: 'low' }, // clasificación simple: menos razonamiento = menor latencia
            abortSignal: signal,
          },
        });
        return res.text ?? '';
      } catch (err) {
        throw toProviderError(err, signal);
      }
    },
  };
}

// Normaliza errores sin arrastrar el mensaje original (podría incluir datos de la petición).
function toProviderError(err, signal) {
  const e = new Error('Gemini request failed');
  e.providerStatus = err?.status;
  e.aborted = signal?.aborted || err?.name === 'AbortError';
  return e;
}
