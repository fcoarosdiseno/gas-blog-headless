/**
 * Feed RSS y sitemap del blog (?action=rss, ?action=sitemap). Ambos se arman
 * en memoria a partir del mismo índice cacheado que ?action=index — sin
 * costo extra de Drive, y comparten los mismos helpers de armado de URL/XML.
 *
 * Necesitan SITE_CONFIG (en config.js) configurado con la URL real del
 * frontend: este backend no tiene forma de saber en qué dominio vive.
 */

/** Feed RSS 2.0 con todos los posts del índice (más nuevo primero). */
function buildRss_() {
  const result = getIndex(); // indexCache.js
  const posts = result.posts || [];

  const items = posts.map(post => {
    const link = buildPostUrl_(post.slug);
    const pubDate = post.pubDate ? new Date(post.pubDate).toUTCString() : '';
    return `
    <item>
      <title>${escapeXml_(post.title)}</title>
      <link>${escapeXml_(link)}</link>
      <guid>${escapeXml_(link)}</guid>
      <description>${escapeXml_(post.description)}</description>${pubDate ? `
      <pubDate>${pubDate}</pubDate>` : ''}
    </item>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml_(SITE_CONFIG.TITLE)}</title>
    <link>${escapeXml_(SITE_CONFIG.URL)}</link>
    <description>${escapeXml_(SITE_CONFIG.DESCRIPTION)}</description>${items}
  </channel>
</rss>`;
}

/** Sitemap XML con la home y todas las URLs de posts (con lastmod = pubDate). */
function buildSitemap_() {
  const result = getIndex(); // indexCache.js
  const posts = result.posts || [];

  const homeEntry = `
  <url>
    <loc>${escapeXml_(SITE_CONFIG.URL)}</loc>
  </url>`;

  const postEntries = posts.map(post => `
  <url>
    <loc>${escapeXml_(buildPostUrl_(post.slug))}</loc>${post.pubDate ? `
    <lastmod>${escapeXml_(post.pubDate)}</lastmod>` : ''}
  </url>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${homeEntry}${postEntries}
</urlset>`;
}

/** Arma la URL pública de un post a partir de SITE_CONFIG.URL — asume la ruta /blog/[slug]. */
function buildPostUrl_(slug) {
  return `${SITE_CONFIG.URL.replace(/\/$/, '')}/blog/${slug}`;
}

/** Escapa los 5 caracteres especiales de XML — nada de esto pasa por un parser real. */
function escapeXml_(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
