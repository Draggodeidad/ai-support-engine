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

    it('tiene al menos 5 casos normales', () => {
      expect(normalCases.length).toBeGreaterThanOrEqual(5);
    });

    it('tiene al menos 3 casos ambiguos', () => {
      expect(ambiguousCases.length).toBeGreaterThanOrEqual(3);
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

    // Todos los casos deben cumplir el contrato. No exigimos 100% de aciertos en el dataset:
    // forzarlo llevaría a reglas hechas a la medida de cada caso. El % real se mide en `npm run compare`.
    cases.forEach((testCase) => {
      it(`caso #${testCase.id} cumple el contrato`, async () => {
        expect(EngineResultSchema.safeParse(await analyze(testCase.message)).success).toBe(true);
      });
    });

    it('acierta al menos 80% de los casos normales (categoría y prioridad)', async () => {
      let hits = 0;
      for (const c of normalCases) {
        const r = await analyze(c.message);
        if (r.category === c.expected.category && r.priority === c.expected.priority) hits++;
      }
      expect(hits / normalCases.length).toBeGreaterThanOrEqual(0.8);
    });

    it('nunca baja de HIGH un caso adversarial de seguridad', async () => {
      for (const c of adversarialCases.filter((x) => x.expected.category === 'SECURITY')) {
        const r = await analyze(c.message);
        expect(r.category).toBe('SECURITY');
        expect(['HIGH', 'CRITICAL']).toContain(r.priority);
        expect(r.requiresHumanReview).toBe(true);
      }
    });
  });
});

describe('Motor tradicional: regresiones', () => {
  it('"no funciona" es BUG, no ACCESS', async () => {
    expect((await analyze('El botón de guardar no funciona')).category).toBe('BUG');
  });

  it('una caída general es BUG/CRITICAL, no SECURITY', async () => {
    expect(await analyze('El servidor está caído para todos los usuarios')).toMatchObject({ category: 'BUG', priority: 'CRITICAL' });
  });

  it('reconoce variantes por raíz (hackearon, vulnerabilidades)', async () => {
    expect((await analyze('Creo que me hackearon la cuenta')).category).toBe('SECURITY');
    expect((await analyze('Encontré varias vulnerabilidades XSS')).category).toBe('SECURITY');
  });

  it('los modificadores de baja no suben la prioridad', async () => {
    expect((await analyze('Me gustaría exportar a Excel, cuando puedan')).priority).toBe('LOW');
    expect((await analyze('El reporte da error, no es urgente')).priority).toBe('LOW');
  });

  it('SECURITY gana aunque se mezcle con palabras de otra categoría', async () => {
    const r = await analyze('Es solo una sugerencia de mejora: alguien accedió sin autorización a la base de datos');
    expect(r).toMatchObject({ category: 'SECURITY', priority: 'CRITICAL', requiresHumanReview: true });
  });

  it('las respuestas no piden la contraseña', async () => {
    for (const m of ['No puedo iniciar sesión', 'Creo que me hackearon la cuenta']) {
      expect((await analyze(m)).response).not.toMatch(/(env[ií]e|comparta|indique|d[ée]nos) su contrase[ñn]a/i);
    }
  });
});
