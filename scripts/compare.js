// Ejecuta ambos motores sobre tests/cases.json y genera la tabla comparativa.
// Uso: npm run compare            (ambos motores)
//      npm run compare -- traditional   (solo uno)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { EngineResultSchema, MODES } from '../src/contract.js';
import { getEngine } from '../src/engines/index.js';

const casesUrl = new URL('../tests/cases.json', import.meta.url);
const outDir = new URL('../results/', import.meta.url);

const requested = process.argv[2];
const modes = requested ? [requested] : MODES;
const cases = JSON.parse(await readFile(casesUrl, 'utf8'));

const rows = [];
for (const c of cases) {
  for (const mode of modes) {
    const row = { id: c.id, type: c.type, mode, message: c.message, expected: c.expected };
    const started = Date.now();
    try {
      const raw = await getEngine(mode).analyze(c.message);
      const parsed = EngineResultSchema.safeParse(raw);
      row.formatValid = parsed.success;
      row.output = raw;
      row.categoryCorrect = parsed.success && raw.category === c.expected.category;
      row.priorityCorrect = parsed.success && raw.priority === c.expected.priority;
      row.correct = row.categoryCorrect && row.priorityCorrect;
    } catch (err) {
      row.formatValid = false;
      row.categoryCorrect = row.priorityCorrect = row.correct = false;
      row.error = `${err.code ?? err.name}: ${err.message}`;
    }
    row.ms = Date.now() - started;
    rows.push(row);
    console.log(`#${c.id} [${mode}] ${row.error ?? `${row.output.category}/${row.output.priority}`} ${row.correct ? '✔' : '✘'}`);
  }
}

const summary = Object.fromEntries(
  modes.map((mode) => {
    const r = rows.filter((x) => x.mode === mode);
    const pct = (n) => Math.round((n / r.length) * 1000) / 10;
    return [
      mode,
      {
        total: r.length,
        formatValidPct: pct(r.filter((x) => x.formatValid).length),
        categoryAccuracyPct: pct(r.filter((x) => x.categoryCorrect).length),
        priorityAccuracyPct: pct(r.filter((x) => x.priorityCorrect).length),
        fullAccuracyPct: pct(r.filter((x) => x.correct).length),
      },
    ];
  }),
);

await mkdir(outDir, { recursive: true });
await writeFile(new URL('results.json', outDir), JSON.stringify({ generatedAt: new Date().toISOString(), summary, rows }, null, 2));
await writeFile(new URL('results.md', outDir), toMarkdown(rows, summary));
console.log('\nResumen:', summary);
console.log('Escrito results/results.json y results/results.md');

function toMarkdown(rows, summary) {
  const yn = (b) => (b ? '✅' : '❌');
  const lines = [
    '# Resultados comparativos',
    '',
    `Generado: ${new Date().toISOString()}`,
    '',
    '| # | Tipo | Motor | Esperado | Obtenido | Formato OK | Categoría OK | Prioridad OK | Correcto |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) =>
      [
        r.id,
        r.type,
        r.mode,
        `${r.expected.category}/${r.expected.priority}`,
        r.error ? `ERROR (${r.error.split(':')[0]})` : `${r.output.category}/${r.output.priority}`,
        yn(r.formatValid),
        yn(r.categoryCorrect),
        yn(r.priorityCorrect),
        yn(r.correct),
      ].join(' | ').replace(/^/, '| ').concat(' |'),
    ),
    '',
    '## Resumen',
    '',
    '| Motor | Casos | Formato válido | Acierto categoría | Acierto prioridad | Acierto total |',
    '|---|---|---|---|---|---|',
    ...Object.entries(summary).map(
      ([m, s]) =>
        `| ${m} | ${s.total} | ${s.formatValidPct}% | ${s.categoryAccuracyPct}% | ${s.priorityAccuracyPct}% | ${s.fullAccuracyPct}% |`,
    ),
    '',
  ];
  return lines.join('\n');
}
