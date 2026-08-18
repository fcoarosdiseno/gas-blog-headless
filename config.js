/**
 * Configuración central del proyecto. Es el único archivo que debería hacer
 * falta tocar para adaptar este backend a otro blog o ajustar su comportamiento
 * — todo lo demás funciona solo con estos valores.
 */

/** ID de la carpeta raíz en Drive que contiene una subcarpeta por post. */
const ROOT_FOLDER_ID = 'PON_AQUI_TU_FOLDER_ID';

/**
 * Paginación del índice (?action=index&page=...&perPage=...).
 * - ENABLED en false: ?action=index siempre devuelve TODOS los posts sin
 *   paginar (el comportamiento de siempre), ignorando page/perPage aunque
 *   lleguen por URL. Útil mientras el frontend todavía no sabe pedir páginas.
 * - DEFAULT_PER_PAGE: cuántos posts trae una página cuando no se manda
 *   ?perPage=. 20 es un buen default para un blog personal.
 * - MAX_PER_PAGE: tope duro, aunque alguien pida más por URL (se recorta y
 *   se loguea una advertencia). fetchAll aguanta ~200 URLs por llamada sin
 *   romperse, pero pedir de más igual perjudica el tiempo de esa respuesta
 *   puntual sin necesidad real para un blog.
 */
const PAGINATION_CONFIG = {
  ENABLED: false,
  DEFAULT_PER_PAGE: 20,
  MAX_PER_PAGE: 100
};

/**
 * Filtrado del índice (?action=index&tag=...).
 * - ENABLED en false: el parámetro ?tag= se ignora, siempre devuelve todos
 *   los posts (filtrados solo por draft, como siempre).
 * Activado por defecto: a diferencia de la paginación, filtrar es aditivo
 * (si no mandas ?tag=, no cambia nada), así que no hay riesgo en tenerlo
 * prendido desde ya.
 */
const FILTER_CONFIG = {
  ENABLED: true
};

/**
 * Datos del sitio, usados para armar links reales en el feed RSS (?action=rss)
 * y el sitemap (?action=sitemap) — este backend no sabe en qué dominio vive tu
 * frontend, así que hay que decírselo. URL sin "/" al final.
 */
const SITE_CONFIG = {
  URL: 'PON_AQUI_LA_URL_DE_TU_BLOG',
  TITLE: 'PON_AQUI_EL_TITULO_DE_TU_BLOG',
  DESCRIPTION: 'PON_AQUI_UNA_DESCRIPCION_CORTA_DE_TU_BLOG'
};

/** Cuántos posts relacionados (mismo tag) devuelve getPost() como máximo. */
const RELATED_POSTS_LIMIT = 3;
