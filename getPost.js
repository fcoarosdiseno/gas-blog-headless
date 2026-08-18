/**
 * Devuelve el contenido completo de UN post: frontmatter parseado, cuerpo en
 * markdown, portada (para SEO), el mapa de imágenes de contenido, post
 * anterior/siguiente y posts relacionados — todo en una sola respuesta, con
 * solo 2 llamadas a Drive (listar archivos + leer index.md); prevPost/
 * nextPost/relatedPosts salen del índice ya cacheado, sin costo extra.
 *
 * A diferencia de buildIndex.js (arma el listado de N posts) y de getImages.js
 * (solo resuelve imágenes), este endpoint sirve la carpeta completa de un
 * post para renderizar /blog/[slug] en Astro: no hace falta un segundo golpe
 * a ?action=images aparte, ya viene todo junto acá.
 */
function getPost(slug) {
  const folder = findPostFolderBySlug_(slug); // definido en getImages.js, mismo scope global
  if (!folder) {
    return { success: false, error: `No se encontró el post "${slug}"` };
  }

  // Una sola consulta trae TODO lo que hay en la carpeta (index.md + imágenes).
  const files = listAllFilesInFolder_(folder.id);

  const articleFile = files.find(f => f.name === 'index.md');
  if (!articleFile) {
    return { success: false, error: `El post "${slug}" no tiene index.md` };
  }

  const rawText = fetchFileContent_(articleFile.id);
  if (rawText === null) {
    return { success: false, error: `No se pudo leer el contenido de "${slug}"` };
  }

  const parsed = parseFrontmatter(rawText);
  const data = parsed.data;

  if (data.draft === true) {
    return { success: false, error: `El post "${slug}" es un borrador` };
  }

  const warnings = validateFrontmatter_(data); // frontmatter.js — nunca bloquea, solo avisa
  if (warnings.length > 0) {
    Logger.log(`⚠️ Frontmatter incompleto en "${slug}": ${warnings.join('; ')}`);
  }

  const bannerFile = files.find(f => BANNER_NAMES_.indexOf(f.name) !== -1); // BANNER_NAMES_ definido en buildIndex.js

  // Todo lo que no sea index.md ni la portada es una imagen de contenido del cuerpo.
  const images = {};
  files.forEach(file => {
    if (file.name === 'index.md') return;
    if (bannerFile && file.id === bannerFile.id) return;
    images[file.name] = buildDriveImageUrl(file.id); // definido en buildIndex.js
  });

  const tags = data.tags || [];
  const { prevPost, nextPost, relatedPosts } = getPostNeighbors_(slug, tags);

  return {
    success: true,
    slug,
    title: data.title || '',
    author: data.author || '',
    description: data.description || '',
    pubDate: data.pubDate || '',
    imgUrl: bannerFile ? buildDriveImageUrl(bannerFile.id) : (data.imgUrl || ''),
    imgAlt: data.imgAlt || data.title || '',
    tags,
    content: parsed.content,
    images,
    warnings,
    prevPost,
    nextPost,
    relatedPosts
  };
}

/**
 * Post anterior/siguiente (por fecha de publicación) y posts relacionados
 * (mismo tag, hasta RELATED_POSTS_LIMIT). Reusa el índice ya cacheado
 * (getIndex(), en indexCache.js) — no vuelve a tocar Drive, así que esto
 * prácticamente no le suma costo a getPost() cuando la caché está tibia.
 */
function getPostNeighbors_(slug, tags) {
  const indexPosts = getIndex().posts || []; // ordenado por pubDate descendente (más nuevo primero)
  const i = indexPosts.findIndex(p => p.slug === slug);

  // "next" = publicado después (más nuevo, queda antes en el array); "prev" = publicado antes.
  const next = i > 0 ? indexPosts[i - 1] : null;
  const prev = i !== -1 && i < indexPosts.length - 1 ? indexPosts[i + 1] : null;

  const relatedPosts = tags.length === 0 ? [] : indexPosts
    .filter(p => p.slug !== slug && p.tags.some(t => tags.indexOf(t) !== -1))
    .slice(0, RELATED_POSTS_LIMIT)
    .map(p => ({ slug: p.slug, title: p.title, imgUrl: p.imgUrl }));

  return {
    prevPost: prev ? { slug: prev.slug, title: prev.title } : null,
    nextPost: next ? { slug: next.slug, title: next.title } : null,
    relatedPosts
  };
}

/** Lista TODOS los archivos de una carpeta (index.md + imágenes) en UNA sola consulta. */
function listAllFilesInFolder_(folderId) {
  const token = ScriptApp.getOAuthToken();
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1000`;

  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    Logger.log(`Fallo listando archivos de carpeta ${folderId}: HTTP ${response.getResponseCode()} — ${response.getContentText()}`);
    return [];
  }

  return JSON.parse(response.getContentText()).files || [];
}

/** Lee el contenido de un solo archivo por su fileId. Un solo archivo: no hace falta fetchAll acá. */
function fetchFileContent_(fileId) {
  const token = ScriptApp.getOAuthToken();
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    Logger.log(`Fallo leyendo archivo (fileId=${fileId}): HTTP ${response.getResponseCode()} — ${response.getContentText()}`);
    return null;
  }

  return response.getContentText('UTF-8');
}
