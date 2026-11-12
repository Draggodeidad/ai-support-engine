import express from 'express';
import { AnalyzeRequestSchema, AnalyzeResponseSchema } from './contract.js';
import { getEngine as defaultGetEngine } from './engines/index.js';
import { AppError } from './errors.js';
import { analyzeMessage } from './pipeline.js';

// getEngine se puede inyectar para tests.
export function createApp({ getEngine = defaultGetEngine } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.post('/api/analyze', async (req, res, next) => {
    try {
      const parsed = AnalyzeRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new AppError('INVALID_REQUEST', 'La solicitud no es válida', 400, formatIssues(parsed.error));
      }
      const { message, mode } = parsed.data;

      // motor -> validación del contrato -> política de seguridad (revisión humana / prioridad mínima)
      const { result, flags } = await analyzeMessage(message, mode, { getEngine });
      if (flags.adjusted.length) console.info(`[security] ${mode}: ${flags.adjusted.join(', ')}`);

      res.json(AnalyzeResponseSchema.parse(result));
    } catch (err) {
      next(err);
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } });
  });

  // Manejador de errores: nunca expone stack traces ni secretos al cliente.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'El cuerpo no es JSON válido' } });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'El cuerpo es demasiado grande' } });
    }
    if (err instanceof AppError) {
      const body = { error: { code: err.code, message: err.message } };
      if (err.details) body.error.details = err.details;
      return res.status(err.status).json(body);
    }
    console.error('[error]', err?.name, err?.message);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } });
  });

  return app;
}

function formatIssues(zodError) {
  return zodError.issues.map((i) => ({ field: i.path.join('.') || '(body)', message: i.message }));
}
