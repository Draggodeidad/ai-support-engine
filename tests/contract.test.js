import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { AnalyzeRequestSchema, AnalyzeResponseSchema, CATEGORIES, PRIORITIES } from '../src/contract.js';

describe('AnalyzeRequestSchema', () => {
  it('acepta una petición válida', () => {
    expect(AnalyzeRequestSchema.safeParse({ message: 'No puedo iniciar sesión', mode: 'traditional' }).success).toBe(true);
  });
  it.each([
    [{}],
    [{ message: 'hola que tal', mode: 'magic' }],
    [{ message: '', mode: 'generative' }],
    [{ message: 'x'.repeat(2001), mode: 'generative' }],
    [{ message: 123, mode: 'generative' }],
    [{ message: 'hola que tal', mode: 'generative', extra: true }],
  ])('rechaza %j', (body) => {
    expect(AnalyzeRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('AnalyzeResponseSchema', () => {
  const ok = { category: 'ACCESS', priority: 'MEDIUM', response: 'Texto', requiresHumanReview: false, mode: 'generative' };
  it('acepta el ejemplo del enunciado', () => {
    expect(AnalyzeResponseSchema.safeParse(ok).success).toBe(true);
  });
  it('rechaza categoría o prioridad fuera del catálogo', () => {
    expect(AnalyzeResponseSchema.safeParse({ ...ok, category: 'OTHER' }).success).toBe(false);
    expect(AnalyzeResponseSchema.safeParse({ ...ok, priority: 'URGENT' }).success).toBe(false);
  });
});

describe('tests/cases.json', () => {
  const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));
  it('cada caso tiene formato válido e id único', () => {
    const ids = new Set();
    for (const c of cases) {
      expect(typeof c.message).toBe('string');
      expect(['normal', 'ambiguous', 'adversarial']).toContain(c.type);
      expect(CATEGORIES).toContain(c.expected.category);
      expect(PRIORITIES).toContain(c.expected.priority);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
    }
  });
});
