/**
 * Filtra por tag y pagina el índice YA construido por getIndex() (desde
 * caché o en vivo) — nunca vuelve a tocar Drive, opera en memoria sobre el
 * array que ya está armado. Por eso un solo manifiesto cacheado alcanza para
 * servir cualquier combinación de page/perPage/tag sin pagar de nuevo el
 * costo de escanear Drive.
 *
 * Controlado por config.js (PAGINATION_CONFIG / FILTER_CONFIG): si alguno
 * está desactivado, el parámetro de URL correspondiente se ignora.
 */
function filterAndPaginate_(indexResult, params) {
  let posts = indexResult.posts;

  if (FILTER_CONFIG.ENABLED && params.tag) {
    posts = posts.filter(p => p.tags.indexOf(params.tag) !== -1);
  }

  if (!PAGINATION_CONFIG.ENABLED) {
    return { success: true, total: posts.length, posts };
  }

  const perPage = clampPerPage_(parsePositiveInt_(params.perPage, PAGINATION_CONFIG.DEFAULT_PER_PAGE));
  const requestedPage = parsePositiveInt_(params.page, 1);

  const total = posts.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(requestedPage, totalPages); // pedir una página fuera de rango no rompe, devuelve la última

  const start = (page - 1) * perPage;
  const pagePosts = posts.slice(start, start + perPage);

  return { success: true, total, page, perPage, totalPages, posts: pagePosts };
}

/** Convierte un parámetro de query a entero positivo, o devuelve el fallback si es inválido. */
function parsePositiveInt_(value, fallback) {
  const n = parseInt(value, 10);
  return (isNaN(n) || n < 1) ? fallback : n;
}

/** Recorta perPage al máximo configurado, avisando por qué si hizo falta. */
function clampPerPage_(perPage) {
  if (perPage > PAGINATION_CONFIG.MAX_PER_PAGE) {
    Logger.log(`?perPage=${perPage} supera el máximo configurado (${PAGINATION_CONFIG.MAX_PER_PAGE}); se usa el máximo.`);
    return PAGINATION_CONFIG.MAX_PER_PAGE;
  }
  return perPage;
}
