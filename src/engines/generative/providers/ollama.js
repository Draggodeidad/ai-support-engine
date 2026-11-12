// Proveedor Ollama (modelo local) usando /api/chat con `format` = JSON Schema.
export function createOllamaProvider({
  host = process.env.OLLAMA_HOST || 'http://localhost:11434',
  model = process.env.OLLAMA_MODEL || 'qwen2.5:3b',
} = {}) {
  return {
    name: 'ollama',
    model,
    async generate({ system, user, schema, signal }) {
      let res;
      try {
        res = await fetch(`${host.replace(/\/$/, '')}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            format: schema,
            options: { temperature: 0 },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
          signal,
        });
      } catch (err) {
        const e = new Error('Ollama request failed');
        e.aborted = signal?.aborted || err?.name === 'AbortError';
        throw e;
      }
      if (!res.ok) {
        const e = new Error('Ollama request failed');
        e.providerStatus = res.status;
        throw e;
      }
      const data = await res.json();
      return data?.message?.content ?? '';
    },
  };
}
