/**
 * Punto de entrada del Web App. Enruta según el parámetro `action`.
 * Deploy: Implementar > Nueva implementación > Aplicación web.
 */
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === 'index') {
    const result = getIndex();
    const paginated = filterAndPaginate_(result, e.parameter);
    return respondJson(paginated);
  }

  if (action === 'rss') {
    return ContentService.createTextOutput(buildRss_()).setMimeType(ContentService.MimeType.RSS);
  }

  if (action === 'sitemap') {
    return ContentService.createTextOutput(buildSitemap_()).setMimeType(ContentService.MimeType.XML);
  }

  if (action === 'images') {
    const slug = e.parameter.slug;
    if (!slug) {
      return respondJson({ success: false, error: 'Falta el parámetro slug. Usa ?action=images&slug=...' });
    }
    if (!isValidSlug_(slug)) {
      return respondJson({ success: false, error: `Slug inválido: "${slug}"` });
    }
    return respondJson(getImages(slug));
  }

  if (action === 'post') {
    const slug = e.parameter.slug;
    if (!slug) {
      return respondJson({ success: false, error: 'Falta el parámetro slug. Usa ?action=post&slug=...' });
    }
    if (!isValidSlug_(slug)) {
      return respondJson({ success: false, error: `Slug inválido: "${slug}"` });
    }
    return respondJson(getPost(slug));
  }

  // Acción no reconocida: devolvemos error limpio, no un 500 crudo.
  return respondJson({
    success: false,
    error: `Acción no reconocida: "${action}". Usa ?action=index, ?action=post&slug=..., ?action=images&slug=..., ?action=rss o ?action=sitemap`
  });
}

/**
 * El slug llega directo del visitante (?slug=...) y termina interpolado sin
 * escapar dentro de una consulta a la API de Drive (ver findPostFolderBySlug_
 * en getImages.js) — sin este filtro, alguien podría mandar un slug con
 * comillas y otros caracteres del lenguaje de búsqueda de Drive para intentar
 * que la búsqueda se salga de la carpeta raíz del blog. Los slugs reales solo
 * usan minúsculas, números y guiones (ver "Cómo armar la carpeta de un post"
 * en el README), así que este patrón no bloquea ningún caso legítimo.
 */
const SLUG_PATTERN_ = /^[a-z0-9-]+$/;

function isValidSlug_(slug) {
  return typeof slug === 'string' && SLUG_PATTERN_.test(slug);
}

/** Helper: serializa un objeto JS como respuesta JSON del Web App. */
function respondJson(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
