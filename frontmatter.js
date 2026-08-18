/**
 * Parser minimalista de frontmatter YAML-ish, sin dependencias externas.
 * Soporta: strings (con o sin comillas), booleans true/false, arrays inline [a, b, c].
 * NO es un parser YAML completo: solo cubre el subconjunto plano usado en los posts.
 */
function parseFrontmatter(rawText) {
  const DELIM = '---';
  const lines = rawText.split('\n');

  // El frontmatter debe empezar en la primera línea con '---'.
  if (lines[0].trim() !== DELIM) {
    return { data: {}, content: rawText };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === DELIM) {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    // No se encontró el delimitador de cierre: tratamos todo como contenido.
    return { data: {}, content: rawText };
  }

  const frontmatterLines = lines.slice(1, endIndex);
  const contentLines = lines.slice(endIndex + 1);
  const data = {};

  for (const line of frontmatterLines) {
    if (!line.trim()) continue; // líneas vacías se ignoran

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue; // línea sin "key: value" se ignora

    const key = line.slice(0, colonIndex).trim();
    const rawValue = line.slice(colonIndex + 1).trim();

    data[key] = parseValue(rawValue);
  }

  return { data, content: contentLines.join('\n').trim() };
}

/** Convierte el string crudo de un valor de frontmatter a su tipo real (string/bool/array). */
function parseValue(rawValue) {
  if (rawValue === '') return '';

  // Booleans.
  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;

  // Arrays inline: tags: [a, b, c]
  if (rawValue.charAt(0) === '[' && rawValue.charAt(rawValue.length - 1) === ']') {
    const inner = rawValue.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map(item => stripQuotes(item.trim()));
  }

  // Strings con comillas simples o dobles.
  return stripQuotes(rawValue);
}

/** Quita comillas simples/dobles envolventes de un string, si las tiene. */
function stripQuotes(str) {
  const first = str.charAt(0);
  const last = str.charAt(str.length - 1);
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return str.slice(1, -1);
  }
  return str;
}

const PUBDATE_PATTERN_ = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Revisa el frontmatter ya parseado y devuelve una lista de advertencias en
 * texto plano — nunca bloquea nada, un post con datos incompletos sigue
 * publicándose igual (con strings vacíos donde falte, como hasta ahora).
 * La idea es que el autor se entere de un typo o un campo olvidado en vez de
 * que quede fallando en silencio: se loguea server-side y viaja en la
 * respuesta (`warnings`) para que un frontend lo muestre si quiere.
 */
function validateFrontmatter_(data) {
  const warnings = [];

  if (!data.title) warnings.push('Falta "title"');
  if (!data.description) warnings.push('Falta "description"');
  if (!data.author) warnings.push('Falta "author"');

  if (!data.pubDate) {
    warnings.push('Falta "pubDate"');
  } else if (!PUBDATE_PATTERN_.test(data.pubDate)) {
    warnings.push(`"pubDate" ("${data.pubDate}") no tiene el formato YYYY-MM-DD`);
  }

  if (data.tags !== undefined && !Array.isArray(data.tags)) {
    warnings.push('"tags" debería ser un array, ej: [a, b, c]');
  }

  if (data.draft !== undefined && typeof data.draft !== 'boolean') {
    warnings.push('"draft" debería ser true o false (sin comillas), no un string');
  }

  return warnings;
}
