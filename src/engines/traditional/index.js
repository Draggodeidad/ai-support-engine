// Motor tradicional por reglas (IA simbólica, SIN modelos generativos).
// Clasifica por palabras clave con pesos, calcula la prioridad con reglas y devuelve
// una respuesta predeterminada según la categoría y la prioridad.
import { PRIORITIES } from '../../contract.js';

// Normaliza el texto: minúsculas, sin tildes ni signos de puntuación, espacios simples.
// Así "Contraseña", "contraseña" y "CONTRASENA" se comparan igual.
export function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Una clave puede ser:
//  - una RAÍZ (una sola palabra): coincide con cualquier palabra que empiece por ella
//    ("hack" -> hackeo, hackearon, hackeado; "vulnerab" -> vulnerabilidad, vulnerabilidades).
//  - una FRASE (con espacios): debe aparecer completa en el texto normalizado.
// Todas las claves se escriben ya normalizadas (sin tildes ni ñ).
function matches(normalized, words, key) {
  if (key.includes(' ')) return ` ${normalized} `.includes(` ${key} `);
  return words.some((w) => w.startsWith(key));
}

// Diccionarios por categoría. Peso: 2 = indicio débil/genérico, 3 = indicio claro,
// 4-5 = indicio casi inequívoco de la categoría.
const KEYWORDS = {
  // Problemas para entrar al sistema o a un recurso.
  ACCESS: {
    login: 3, logue: 3, 'iniciar sesion': 3, 'inicio de sesion': 3,
    contrasen: 3, password: 3, credencial: 3, clave: 2,
    'no puedo entrar': 4, 'no me deja entrar': 4, 'no puedo acceder': 4,
    acceso: 2, acced: 2, bloquead: 2, autentic: 2, permiso: 2,
    restablec: 2, 'olvide mi': 3, '2fa': 3, cuenta: 1,
  },
  // Fallas o comportamiento incorrecto del sistema. Una caída del servicio es una falla
  // del sistema aunque el síntoma sea "no puedo entrar", por eso pesa más que ACCESS.
  BUG: {
    error: 3, falla: 3, fallo: 3, crash: 3, bug: 3,
    cuelga: 3, 'se cierra': 3, 'se rompe': 3, 'no responde': 3, 'no carga': 3,
    'se queda cargando': 3, 'pantalla en blanco': 3, 'no guarda': 3,
    caido: 4, caida: 4, 'se cayo': 4, 'fuera de linea': 4,
    lent: 2, 'no funciona': 2, 'no me funciona': 2, problema: 1,
  },
  // Pedidos de algo nuevo o de una mejora.
  FEATURE: {
    anadir: 3, agregar: 2, 'me gustaria': 3, 'seria genial': 3, 'seria bueno': 3,
    'estaria bien': 3, sugerencia: 3, sugiero: 3, quisiera: 2, 'quiero que': 2,
    'podrian': 2, mejora: 2, funcionalidad: 2, 'nueva funcion': 4, implementar: 2,
    'soporte para': 2, 'opcion de': 2,
  },
  // Vulnerabilidades e incidentes. Pesos altos: preferimos un falso positivo de
  // seguridad (lo revisa una persona) antes que dejar pasar un incidente.
  SECURITY: {
    vulnerab: 5, inyeccion: 5, 'sql injection': 5, xss: 5, csrf: 5, exploit: 5,
    hack: 5, malware: 5, ransomware: 5, virus: 4, phishing: 5, troyano: 5,
    atacante: 5, ataque: 4, brecha: 5, ddos: 5, 'fuerza bruta': 5,
    filtracion: 5, 'se filtraron': 5, 'datos filtrados': 5, 'fuga de': 5,
    'datos expuestos': 5, 'acceso no autorizado': 6, 'sin autorizacion': 4,
    robaron: 5, 'robo de': 4, comprometid: 4, suplant: 4,
    'correo sospechoso': 4, 'enlace sospechoso': 4, seguridad: 2,
  },
};

// Si SECURITY alcanza este puntaje gana aunque otra categoría sume más: un mensaje que
// mezcla "sugerencia" con "acceso no autorizado" es un incidente, no una sugerencia.
const SECURITY_PRECEDENCE_SCORE = 4;

// Por debajo de este puntaje, o si la segunda categoría queda a 1 punto o menos,
// la clasificación se considera dudosa y se pide revisión humana.
const MIN_CONFIDENT_SCORE = 3;

// Prioridad de partida por categoría.
const BASE_PRIORITY = { ACCESS: 'MEDIUM', BUG: 'MEDIUM', FEATURE: 'LOW', SECURITY: 'HIGH' };

// Modificadores: cada coincidencia suma (o resta) niveles de prioridad.
const UP_MODIFIERS = {
  urgente: 1, critico: 1, grave: 1, produccion: 1, pagos: 1,
  'todos los usuarios': 2, 'ningun usuario': 2, 'perdida de datos': 2,
  caido: 2, caida: 2, 'se cayo': 2, 'fuera de linea': 2,
};
const DOWN_MODIFIERS = {
  'cuando puedan': -1, 'cuando tengan tiempo': -1, 'no es urgente': -1,
  'sin prisa': -1, sugerencia: -1, 'detalle menor': -1,
};

// SECURITY sube directo a CRITICAL si hay explotación activa, intrusión o datos comprometidos.
const SECURITY_CRITICAL = [
  'exploit', 'explotad', 'inyeccion', 'hack', 'atacante', 'ransomware', 'masiv',
  'filtracion', 'se filtraron', 'datos filtrados', 'fuga de', 'datos expuestos',
  'acceso no autorizado', 'sin autorizacion', 'robaron', 'en uso',
];

// Respuestas predeterminadas. No prometen plazos ni acciones que el sistema no garantiza
// y nunca piden contraseñas.
const RESPONSES = {
  ACCESS: {
    LOW: 'Gracias por escribirnos. Puede recuperar el acceso con la opción "¿Olvidó su contraseña?" en la pantalla de inicio de sesión.',
    MEDIUM: 'Lamentamos el inconveniente. Verifique sus credenciales y utilice la recuperación de contraseña si es necesario; si el problema continúa, indíquenos el mensaje de error que aparece.',
    HIGH: 'Lamentamos el inconveniente. Hemos priorizado su caso de acceso; por favor indíquenos el usuario afectado y el mensaje de error, sin compartir su contraseña.',
    CRITICAL: 'Hemos detectado un problema de acceso que afecta a varios usuarios y lo escalamos con máxima prioridad. Le informaremos en cuanto haya novedades.',
  },
  BUG: {
    LOW: 'Gracias por el reporte. Lo registramos para su análisis por el equipo técnico.',
    MEDIUM: 'Gracias por el reporte. Para reproducir el error, indíquenos los pasos que siguió, el navegador o dispositivo y, si es posible, una captura de pantalla.',
    HIGH: 'Hemos priorizado su reporte de falla. Indíquenos desde cuándo ocurre, a cuántos usuarios afecta y los pasos para reproducirla.',
    CRITICAL: 'Hemos escalado la falla con máxima prioridad al equipo técnico. Le mantendremos informado sobre el avance de la solución.',
  },
  FEATURE: {
    LOW: 'Gracias por su sugerencia. La registramos para que el equipo de producto la evalúe.',
    MEDIUM: 'Gracias por su propuesta. La compartiremos con el equipo de producto para evaluar su viabilidad e impacto.',
    HIGH: 'Gracias por su propuesta. Dado su impacto, el equipo de producto la revisará con prioridad y podría contactarle para conocer más detalles.',
    CRITICAL: 'Gracias por su propuesta. El equipo de producto la revisará con prioridad y le contactará para entender el caso de uso.',
  },
  SECURITY: {
    LOW: 'Gracias por informarnos. El equipo de seguridad revisará su reporte.',
    MEDIUM: 'Gracias por informarnos. El equipo de seguridad revisará su reporte; si tiene evidencia (capturas o registros), compártala sin incluir contraseñas.',
    HIGH: 'Gracias por su reporte. Lo hemos escalado al equipo de seguridad para su revisión. No comparta contraseñas ni códigos con nadie mientras lo analizamos.',
    CRITICAL: 'Su reporte fue escalado de inmediato al equipo de seguridad como posible incidente crítico. Por precaución, cambie su contraseña y no comparta datos sensibles.',
  },
};

// Calcula el puntaje de cada categoría y elige la ganadora.
function detectCategory(normalized, words) {
  const scores = Object.fromEntries(
    Object.entries(KEYWORDS).map(([category, keywords]) => [
      category,
      Object.entries(keywords).reduce((sum, [key, weight]) => sum + (matches(normalized, words, key) ? weight : 0), 0),
    ]),
  );

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [[top, topScore], [, secondScore]] = ranked;

  // Sin ninguna coincidencia: se asume BUG (lo más común en soporte) y se pide revisión humana.
  if (topScore === 0) return { category: 'BUG', isAmbiguous: true, scores };

  const category = scores.SECURITY >= SECURITY_PRECEDENCE_SCORE ? 'SECURITY' : top;
  const isAmbiguous = topScore < MIN_CONFIDENT_SCORE || (secondScore > 0 && topScore - secondScore <= 1);
  return { category, isAmbiguous, scores };
}

// Prioridad = base de la categoría + modificadores, limitada al rango LOW..CRITICAL.
function detectPriority(category, normalized, words) {
  if (category === 'SECURITY' && SECURITY_CRITICAL.some((k) => matches(normalized, words, k))) {
    return 'CRITICAL';
  }

  let delta = 0;
  let rest = ` ${normalized} `;
  for (const [key, d] of Object.entries(DOWN_MODIFIERS)) {
    if (matches(normalized, words, key)) {
      delta += d; // d es negativo
      rest = rest.replaceAll(` ${key} `, ' '); // "no es urgente" no debe contar además como "urgente"
    }
  }
  const restWords = rest.trim().split(' ');
  for (const [key, d] of Object.entries(UP_MODIFIERS)) if (matches(rest.trim(), restWords, key)) delta += d;

  const min = category === 'SECURITY' ? PRIORITIES.indexOf('HIGH') : 0; // un incidente nunca baja de HIGH
  const index = Math.min(PRIORITIES.length - 1, Math.max(min, PRIORITIES.indexOf(BASE_PRIORITY[category]) + delta));
  return PRIORITIES[index];
}

export async function analyze(message) {
  const normalized = normalizeText(message);
  const words = normalized.split(' ');

  const { category, isAmbiguous } = detectCategory(normalized, words);
  const priority = detectPriority(category, normalized, words);

  return {
    category,
    priority,
    response: RESPONSES[category][priority],
    // Siempre revisión humana en seguridad o cuando la clasificación es dudosa.
    requiresHumanReview: category === 'SECURITY' || isAmbiguous,
  };
}
