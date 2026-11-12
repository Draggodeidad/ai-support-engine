// Motor tradicional por reglas (sin LLM)
// Clasifica mensajes basado en palabras clave con pesos por categoría
import { CATEGORIES, PRIORITIES } from '../../contract.js';

// Normaliza texto: minúsculas, eliminando tildes y caracteres especiales
function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Diccionario de palabras clave con pesos por categoría
// Pesos más altos indican mayor relevancia para esa categoría
const KEYWORDS = {
  ACCESS: {
    // Fallas de acceso y autenticación (sin tildes para comparar con texto normalizado)
    login: 3, password: 3, contrasena: 3, acceso: 2, credenciales: 2,
    cuenta: 2, iniciarsesion: 3, 'iniciar sesion': 3, authentication: 2,
    'no puedo entrar': 4, 'no me deja entrar': 4, bloqueado: 2,
    'contrasena incorrecta': 3, 'olvide mi contrasena': 3, resetpassword: 2,
    'no funciona': 5
  },
  BUG: {
    // Errores, fallos y comportamientos inesperados
    error: 3, 'error en': 3, falla: 3, crash: 3, cuelga: 3,
    'se cuelga': 4, 'no funciona': 3, 'no carga': 3, bug: 3, problema: 3,
    'comportamiento extraño': 4, 'da error': 3, 'se rompe': 4,
    'se bloquea': 4, 'falla al': 3, 'no se puede': 3, 'no se permite': 3,
    'exportar': 2, 'reportes': 2, 'cargando': 2, 'funcion': 2, 'eternamente': 2
  },
  FEATURE: {
    // Solicitudes de nuevas funciones o mejoras
    quieres: 2, quieresque: 2, anadir: 2, agregar: 2, mejora: 2,
    sugerencia: 2, 'me gustaria': 3, 'podrian anadir': 3, feature: 2,
    'quiero una': 3, 'nueva funcionalidad': 3, 'mejorar el': 2,
    'faltaria': 2, 'le falta': 2
  },
  SECURITY: {
    // Amenazas de seguridad y vulnerabilidades
    vulnerabilidad: 4, 'ataque en': 4, seguridad: 3, hack: 3,
    'fuga de': 5, 'datos expuestos': 5, 'explotacion': 5, malware: 5,
    'codigo malicioso': 5, 'invasion': 4, 'acceso no autorizado': 5,
    'sistemafuera de linea': 4, 'todo caido': 5, 'caido': 4, 'todos los usuarios': 4
  }
};

// Prioridad base por categoría
const BASE_PRIORITY = {
  ACCESS: 'MEDIUM',
  BUG: 'MEDIUM',
  FEATURE: 'LOW',
  SECURITY: 'HIGH'
};

// Modificadores que suben la prioridad
const UP_MODIFIERS = {
  'critico': 1, 'urgente': 1, 'grave': 1,
  'produccion': 1, 'todos los usuarios': 2, 'caido': 2,
  'todos caidos': 2, 'fuera de linea': 2, 'todos fuera': 2,
  'data leak': 2, 'explotacion activa': 3, 'activa': 1, 'fuera de': 2,
  'se cayo': 2
};

// Modificadores que bajan la prioridad
const DOWN_MODIFIERS = {
  'cuando puedan': -1, 'sugerencia': -1, 'no es urgente': -1,
  'relajado': -1, 'cuando tengan tiempo': -1
};

// Respuestas en español por categoría (varían según prioridad)
const RESPONSES = {
  ACCESS: {
    LOW: 'Recuerda verificar tu correo de registro. Si el problema persiste, intenta restablecer la contraseña.',
    MEDIUM: 'Lamentamos el inconveniente. Verifica tus credenciales y la conexión. Si necesitas ayuda, te guiaremos paso a paso.',
    HIGH: 'Priorizamos tu acceso. Comparte detalles de tu intento y te ayudaremos inmediatamente.',
    CRITICAL: 'ACCESO URGENTE: Un experto te contactará en los próximos 15 minutos. Mientras, intenta restablecer tu contraseña.'
  },
  BUG: {
    LOW: 'Gracias por tu reporte. La registraré para análisis futuro.',
    MEDIUM: 'Registro tu reporte. Necesitamos detalles del paso a paso para reproducirlo.',
    HIGH: 'Investigando el fallo. Comparte: screenshot, navegador y paso a paso exacto.',
    CRITICAL: 'FALLO CRÍTICO: Servicio afectado. Un técnico se conectará en 30 min. ¿Hay pérdida de datos?'
  },
  FEATURE: {
    LOW: 'Gracias por tu sugerencia. La añadimos a nuestra lista de mejoras.',
    MEDIUM: 'Tu idea esvaliosa. La evaluaremos en la próxima reunion de planificación.',
    HIGH: 'Interesante propuesta. Podemos priorizarla si hay demanda. ¿Te interesa betalearla?',
    CRITICAL: 'Implementación prioritaria. Haremos una llamada para alinear requerimientos.'
  },
  SECURITY: {
    LOW: 'Gracias por avisar. Revisaremos los registros de acceso.',
    MEDIUM: 'Seguridad prioritaria. Comparte pruebas (capturas, logs) para.evaluar el daño.',
    HIGH: 'AMENAZA ACTIVA: Aislamos sistemas afectados. No hagas clic en enlaces sospechosos.',
    CRITICAL: 'EMERGENCIA DE SEGURIDAD: Equipo de respuesta inmediata activado. Apaga accesos no esenciales.'
  }
};

// Determina la categoría basada en palabras clave
function detectCategory(text) {
  const normalized = normalizeText(text);
  const words = new Set(normalized.split(' '));

  let bestCategory = 'BUG';
  let maxScore = 0;

  for (const [category, keywords] of Object.entries(KEYWORDS)) {
    let score = 0;
    for (const [kw, weight] of Object.entries(keywords)) {
      if (kw.includes(' ')) {
        // Phrases
        if (normalized.includes(kw)) score += weight * 2;
      } else if (words.has(kw)) {
        score += weight;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestCategory = category;
    }
  }

  // Si no hubo coincidencias claras, default a BUG (requiere revisión humana)
  if (maxScore === 0) return { category: 'BUG', isAmbiguous: true };
  return { category: bestCategory, isAmbiguous: maxScore <= 2 };
}

// Determina la prioridad basada en el texto y categoría base
function detectPriority(category, text) {
  const normalized = normalizeText(text);
  let priority = BASE_PRIORITY[category];

  let upLevel = 0;
  let downLevel = 0;

  for (const [kw, delta] of Object.entries(UP_MODIFIERS)) {
    if (normalized.includes(kw)) upLevel += delta;
  }
  for (const [kw, delta] of Object.entries(DOWN_MODIFIERS)) {
    if (normalized.includes(kw)) downLevel -= delta;
  }

  // Calcula índice de prioridad final
  let priorityIndex = PRIORITIES.indexOf(priority) + upLevel + downLevel;

  // CRITICAL para SECURITY con fuga/explotación activa o caída total
  if (category === 'SECURITY') {
    if (normalized.includes('explotación') || normalized.includes('fuga') || 
        normalized.includes('caído') || normalized.includes('todos caídos')) {
      return PRIORITIES[3]; // CRITICAL
    }
  }

  // Límites
  if (priorityIndex < 0) priorityIndex = 0;
  if (priorityIndex > 3) priorityIndex = 3;

  return PRIORITIES[priorityIndex];
}

// Determina si requiere revisión humana
function requiresReview(category, isAmbiguous) {
  // Siempre true para SECURITY o si la clasificación es dudosa
  return category === 'SECURITY' || isAmbiguous;
}

export async function analyze(message) {
  const { category, isAmbiguous } = detectCategory(message);
  const priority = detectPriority(category, message);
  const response = RESPONSES[category][priority];
  const requiresHumanReview = requiresReview(category, isAmbiguous);

  return { category, priority, response, requiresHumanReview };
}
