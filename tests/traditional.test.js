import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyze } from '../src/engines/traditional/index.js';
import { EngineResultSchema } from '../src/contract.js';

const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));

describe('Motor tradicional', () => {
  it('devuelve resultado válido según el contrato', async () => {
    const result = await analyze('No puedo iniciar sesión');
    expect(EngineResultSchema.safeParse(result).success).toBe(true);
  });

  it('categoriza mensajes de acceso correctamente', async () => {
    const result = await analyze('Mi contraseña no funciona');
    expect(result.category).toBe('ACCESS');
  });

  it('categoriza mensajes de error correctamente', async () => {
    const result = await analyze('El sistema falla al guardar');
    expect(result.category).toBe('BUG');
  });

  it('categoriza solicitudes de funcionalidades correctamente', async () => {
    const result = await analyze('Quiero añadir un nuevo reporte');
    expect(result.category).toBe('FEATURE');
  });

  it('categoriza amenazas de seguridad correctamente', async () => {
    const result = await analyze('Hay una vulnerabilidad en el login');
    expect(result.category).toBe('SECURITY');
  });

  it('prioridad CRITICAL para amenazas activas de seguridad', async () => {
    const result = await analyze('Datos expuestos y en uso por atacantes');
    expect(result.priority).toBe('CRITICAL');
  });

  it('prioridad CRITICAL para caída total del sistema', async () => {
    const result = await analyze('Todos los usuarios no pueden acceder, todo caído');
    expect(result.priority).toBe('CRITICAL');
  });

  it('prioridad LOW para sugerencias de características', async () => {
    const result = await analyze('Me gustaría añadir un botón de ayuda');
    expect(result.priority).toBe('LOW');
  });

  it('requiere revisión humana para seguridad', async () => {
    const result = await analyze('Hackeado el servidor principal');
    expect(result.requiresHumanReview).toBe(true);
  });

  it('requiere revisión humana para casos ambiguos', async () => {
    const result = await analyze('El sistema no funciona');
    expect(result.requiresHumanReview).toBe(true);
  });

  it('responden en español', async () => {
    const result = await analyze('No puedo entrar');
    expect(typeof result.response).toBe('string');
    expect(result.response.length).toBeGreaterThan(0);
    expect(result.response).toMatch(/[áéíóúñ]/);
  });

  describe('Dataset de casos', () => {
    const normalCases = cases.filter(c => c.type === 'normal');
    const ambiguousCases = cases.filter(c => c.type === 'ambiguous');
    const adversarialCases = cases.filter(c => c.type === 'adversarial');

    it('tiene al menos 12 casos', () => {
      expect(cases.length).toBeGreaterThanOrEqual(12);
    });

    it('tiene ~6 casos normales', () => {
      expect(normalCases.length).toBeGreaterThanOrEqual(5);
      expect(normalCases.length).toBeLessThanOrEqual(7);
    });

    it('tiene ~3 casos ambiguos', () => {
      expect(ambiguousCases.length).toBeGreaterThanOrEqual(2);
      expect(ambiguousCases.length).toBeLessThanOrEqual(4);
    });

    it('tiene al menos 2 casos adversariales', () => {
      expect(adversarialCases.length).toBeGreaterThanOrEqual(2);
    });

    it('cubre las 4 categorías', () => {
      const categories = new Set(cases.map(c => c.expected.category));
      expect(categories.size).toBe(4);
      expect(categories).toContain('ACCESS');
      expect(categories).toContain('BUG');
      expect(categories).toContain('FEATURE');
      expect(categories).toContain('SECURITY');
    });

    cases.forEach((testCase) => {
      it(`clasifica el caso #${testCase.id} correctamente`, async () => {
        const result = await analyze(testCase.message);
        expect(result.category).toBe(testCase.expected.category);
        expect(result.priority).toBe(testCase.expected.priority);
      });
    });
  });
});
