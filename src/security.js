// Capa de seguridad compartida por ambos motores.
// 1) Redacta secretos antes de enviarlos a un proveedor externo o devolverlos.
// 2) Detecta indicios de incidentes de seguridad e intentos de prompt injection.
// 3) Aplica la política final: revisión humana y prioridad mínima para SECURITY.

export function normalize(text) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

// Patrones de secretos que un usuario podría pegar en su solicitud.
const SECRET_PATTERNS = [
  [/AIza[0-9A-Za-z_-]{35}/g, '[API_KEY]'], // Google
  [/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}/g, '[API_KEY]'], // OpenAI / Anthropic
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/g, '[TOKEN]'], // GitHub
  [/\bAKIA[0-9A-Z]{16}\b/g, '[AWS_KEY]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[JWT]'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi, 'Bearer [TOKEN]'],
  [/\b(?:\d[ -]?){13,19}\b/g, '[NUMERO_TARJETA]'],
  // "contraseña: xxx", "password=xxx", "token: xxx"
  [/\b(contrase(?:ñ|n)a|password|passwd|clave|pin|token|api[_ -]?key|secret)(\s*[:=]\s*)(\S+)/gi, '$1$2[REDACTADO]'],
  // "mi contraseña es Abc123!" (solo si el valor parece un secreto: >=6 chars con dígito o símbolo,
  // para no redactar frases como "mi contraseña es incorrecta")
  [/\b(contrase(?:ñ|n)a|password|clave|pin)(\s+es\s+)(?=\S*[\d!@#$%^&*_.-])(\S{6,})/gi, '$1$2[REDACTADO]'],
];

export function redactSecrets(text) {
  return SECRET_PATTERNS.reduce((acc, [re, repl]) => acc.replace(re, repl), text);
}

// Indicios de un posible incidente de seguridad (texto normalizado, sin acentos).
const SECURITY_INDICATORS = [
  /vulnerab/, /inyeccion/, /injection/, /\bxss\b/, /\bcsrf\b/, /exploit/, /\brce\b/,
  /hacke/, /hackea/, /\bhack/, /ataque/, /malware/, /ransomware/, /phishing/, /\bvirus\b/, /troyano/,
  /filtra(?:cion|do|da|ron)/, /fuga de (?:datos|informacion)/, /brecha/, /datos expuestos/, /expuest[oa]s? (?:publicamente|en internet)/,
  /acceso no autorizado/, /sin autorizacion/, /suplant/, /robo de (?:cuenta|datos|credenciales)/, /robaron/, /me (?:hackearon|robaron)/,
  /credenciales (?:expuestas|filtradas|comprometidas)/, /comprometid[oa]/, /ddos/, /fuerza bruta/, /escalada de privilegios/,
  /alguien (?:entro|accedio|inicio sesion) (?:a|en) mi cuenta/, /actividad sospechosa/,
];

// Intentos de manipular al clasificador (prompt injection / jailbreak).
const INJECTION_PATTERNS = [
  /ignora(?:r)? (?:todas? )?(?:las |tus )?(?:instrucciones|reglas|indicaciones)/,
  /olvida(?:r)? (?:todas? )?(?:las |tus )?(?:instrucciones|reglas)/,
  /ignore (?:all |any )?(?:previous|prior|above) (?:instructions|rules)/,
  /disregard (?:all |the )?(?:previous|prior|above)/,
  /(?:clasifica|marca|categoriza|asigna)(?:la|lo|le)? (?:esta|este|esto|la|el)?\s*\w* ?(?:como|con) (?:prioridad|categoria|low|medium|high|critical|access|bug|feature|security|baja|media|alta)/,
  /(?:prioridad|priority) (?:baja|low)(?: por favor)?[,.]? (?:aunque|aun si|even if)/,
  /\b(?:system prompt|prompt del sistema|instrucciones del sistema)\b/,
  /(?:actua|actuar|act) (?:como|as) (?:si|if|un|una|an?)\b/,
  /responde (?:solo|unicamente) con/,
  /requireshumanreview\s*[:=]?\s*false/,
  /<\/?\s*(?:solicitud|system|instructions?)\s*>/,
  /"(?:category|priority)"\s*:/,
];

export function detectSecurityIndicators(message) {
  const n = normalize(message);
  return SECURITY_INDICATORS.some((re) => re.test(n));
}

export function detectPromptInjection(message) {
  const n = normalize(message);
  return INJECTION_PATTERNS.some((re) => re.test(n));
}

const PRIORITY_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const atLeast = (priority, min) =>
  PRIORITY_ORDER.indexOf(priority) >= PRIORITY_ORDER.indexOf(min) ? priority : min;

/**
 * Política final aplicada a la salida de cualquier motor.
 * No cambia la categoría (eso es decisión del motor); solo endurece revisión y prioridad.
 * Devuelve { result, flags } donde flags explica qué ajustó la política.
 */
export function applySecurityPolicy(message, engineResult) {
  const flags = {
    securityIndicators: detectSecurityIndicators(message),
    promptInjection: detectPromptInjection(message),
    adjusted: [],
  };
  const result = { ...engineResult, response: redactSecrets(engineResult.response) };

  if (result.category === 'SECURITY') {
    const p = atLeast(result.priority, 'HIGH');
    if (p !== result.priority) flags.adjusted.push(`priority ${result.priority}->${p}`);
    result.priority = p;
  }

  const mustReview = result.category === 'SECURITY' || flags.securityIndicators || flags.promptInjection;
  if (mustReview && !result.requiresHumanReview) {
    flags.adjusted.push('requiresHumanReview false->true');
    result.requiresHumanReview = true;
  }

  return { result, flags };
}
