// Ejecuta ambos motores sobre tests/cases.json usando el mismo flujo que la API
// (motor -> validación -> política de seguridad) y genera la tabla comparativa.
// Uso: npm run compare                 (ambos motores)
//      npm run compare -- traditional  (solo uno)
// Variable opcional: COMPARE_DELAY_MS (pausa entre llamadas generativas, por el límite del plan gratuito)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { MODES } from '../src/contract.js';
import { analyzeMessage } from '../src/pipeline.js';

const casesUrl = new URL('../tests/cases.json', import.meta.url);
const outDir = new URL('../results/', import.meta.url);

const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();
const delayMs = Number(process.env.COMPARE_DELAY_MS ?? (provider === 'gemini' ? 13000 : 0));
const requested = process.argv[2];
if (requested && !MODES.includes(requested)) {
  console.error(`Modo inválido: ${requested}. Usa: ${MODES.join(', ')}`);
  process.exit(1);
}
const modes = requested ? [requested] : MODES;
const cases = JSON.parse(await readFile(casesUrl, 'utf8'));

const rows = [];
for (const c of cases) {
  for (const mode of modes) {
    const row = { id: c.id, type: c.type, mode, message: c.message, expected: c.expected };
    const started = Date.now();
    try {
      const { result, raw, flags } = await withRateLimitRetry(() => analyzeMessage(c.message, mode));
      row.formatValid = true; // analyzeMessage lanza ENGINE_INVALID_OUTPUT si el contrato no se cumple
      row.output = result;
      row.engineRaw = raw;
      row.securityAdjustments = flags.adjusted;
      row.categoryCorrect = result.category === c.expected.category;
      row.priorityCorrect = result.priority === c.expected.priority;
      row.correct = row.categoryCorrect && row.priorityCorrect;
    } catch (err) {
      row.formatValid = false;
      row.categoryCorrect = row.priorityCorrect = row.correct = false;
      row.error = `${err.code ?? err.name}: ${err.message}`;
    }
    row.ms = Date.now() - started;
    rows.push(row);
    const out = row.error ?? `${row.output.category}/${row.output.priority} review=${row.output.requiresHumanReview}`;
    console.log(`#${c.id} [${mode}] esperado ${c.expected.category}/${c.expected.priority} -> ${out} ${row.correct ? '✔' : '✘'} (${row.ms} ms)`);
    if (mode === 'generative' && delayMs) await sleep(delayMs);
  }
}

const summary = Object.fromEntries(
  modes.map((mode) => {
    const r = rows.filter((x) => x.mode === mode);
    const pct = (n) => (r.length ? Math.round((n / r.length) * 1000) / 10 : 0);
    return [
      mode,
      {
        total: r.length,
        formatValidPct: pct(r.filter((x) => x.formatValid).length),
        categoryAccuracyPct: pct(r.filter((x) => x.categoryCorrect).length),
        priorityAccuracyPct: pct(r.filter((x) => x.priorityCorrect).length),
        fullAccuracyPct: pct(r.filter((x) => x.correct).length),
        avgMs: r.length ? Math.round(r.reduce((a, x) => a + x.ms, 0) / r.length) : 0,
      },
    ];
  }),
);

const meta = {
  generatedAt: new Date().toISOString(),
  provider,
  model: provider === 'ollama' ? process.env.OLLAMA_MODEL : process.env.GEMINI_MODEL,
};
await mkdir(outDir, { recursive: true });
await writeFile(new URL('comparison.json', outDir), JSON.stringify({ ...meta, summary, rows }, null, 2));
await writeFile(new URL('results.md', outDir), toMarkdown(rows, summary, meta));
console.log('\nResumen:', summary);
console.log('Escrito results/comparison.json y results/results.md');

async function withRateLimitRetry(fn, retries = 4) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err.code !== 'LLM_RATE_LIMITED' || i >= retries) throw err;
      console.warn('  límite de uso alcanzado, esperando 60 s…');
      await sleep(60000);
    }
  }
}

function toMarkdown(rows, summary, meta) {
  const yn = (b) => (b ? '✅' : '❌');
  const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return [
    '# Resultados comparativos',
    '',
    `Generado: ${meta.generatedAt} · Proveedor generativo: ${meta.provider} (${meta.model ?? 'default'})`,
    '',
    '| # | Tipo | Motor | Esperado | Obtenido | Revisión humana | Formato OK | Categoría OK | Prioridad OK | Correcto | Ajuste seguridad |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.id} | ${r.type} | ${r.mode} | ${r.expected.category}/${r.expected.priority} | ${
          r.error ? `ERROR (${r.error.split(':')[0]})` : `${r.output.category}/${r.output.priority}`
        } | ${r.output ? yn(r.output.requiresHumanReview) : '—'} | ${yn(r.formatValid)} | ${yn(r.categoryCorrect)} | ${yn(
          r.priorityCorrect,
        )} | ${yn(r.correct)} | ${cell(r.securityAdjustments?.join(', ') || '—')} |`,
    ),
    '',
    '## Resumen',
    '',
    '| Motor | Casos | Formato válido | Acierto categoría | Acierto prioridad | Acierto total | Tiempo medio |',
    '|---|---|---|---|---|---|---|',
    ...Object.entries(summary).map(
      ([m, s]) =>
        `| ${m} | ${s.total} | ${s.formatValidPct}% | ${s.categoryAccuracyPct}% | ${s.priorityAccuracyPct}% | ${s.fullAccuracyPct}% | ${s.avgMs} ms |`,
    ),
    '',
    '## Mensajes y respuestas',
    '',
    ...rows.map((r) => `- **#${r.id} ${r.mode}** — _${cell(r.message)}_ → ${cell(r.output?.response ?? r.error)}`),
    '',
  ].join('\n');
}
