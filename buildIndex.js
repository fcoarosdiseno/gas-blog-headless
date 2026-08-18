/**
 * Construye el índice del blog DESDE CERO, escaneando Drive:
 * 1) Descubre index.md + banner de cada subcarpeta con una consulta por carpeta,
 *    todas EN PARALELO vía fetchAll (nunca secuencial — eso resultó ser el cuello
 *    de botella real, no la lectura de contenido).
 * 2) Lee el contenido de TODOS los index.md en paralelo (fetchAll).
 * 3) Parsea frontmatter, arma y ordena el array de posts.
 *
 * Esto es "el trabajo pesado" (~1.3s con 20 posts). `getIndex()` (en indexCache.js)
 * es el punto de entrada real que usa `doGet.js`: sirve desde caché cuando puede
 * y solo llama a esta función cuando hace falta reconstruir. No la llames directo
 * salvo para benchmarking (ver `benchmarks.js`) — para servir el índice, usa `getIndex()`.
 */
function buildIndexFresh_() {
  // Fase 1: metadata — listar carpetas + ubicar index.md/banner, en paralelo vía fetchAll.
  // El primer benchmark real mostró que buscar archivo por archivo, carpeta por carpeta
  // de forma SECUENCIAL, era el verdadero cuello de botella (7.7s con 20 posts) — mucho
  // peor que la lectura de contenido en sí (977ms). Se mide aparte para ver el desglose.
  const metaStart = new Date().getTime();
  const postMeta = discoverPostMeta_();
  Logger.log(`Fase 1 (metadata: N consultas en paralelo): ${new Date().getTime() - metaStart} ms — ${postMeta.length} posts encontrados`);

  if (postMeta.length === 0) {
    return { success: true, total: 0, posts: [] };
  }

  // Fase 2: batch único de lecturas de contenido en paralelo.
  const fetchStart = new Date().getTime();
  const articleContents = fetchArticleContentsInParallel(postMeta);
  Logger.log(`Fase 2 (fetchAll paralelo de contenidos): ${new Date().getTime() - fetchStart} ms`);

  // Paso 4: parseo de frontmatter + armado del post final.
  const posts = [];
  for (const meta of postMeta) {
    const rawText = articleContents[meta.articleFileId];
    if (rawText === null) continue; // el fetch falló para este post: se omite, no rompe el índice

    const parsed = parseFrontmatter(rawText);
    const data = parsed.data;

    if (data.draft === true) continue; // filtramos drafts

    const warnings = validateFrontmatter_(data); // frontmatter.js — nunca bloquea, solo avisa
    if (warnings.length > 0) {
      Logger.log(`⚠️ Frontmatter incompleto en "${meta.slug}": ${warnings.join('; ')}`);
    }

    posts.push({
      slug: meta.slug,
      title: data.title || '',
      author: data.author || '',
      description: data.description || '',
      pubDate: data.pubDate || '',
      imgUrl: meta.bannerFileId ? buildDriveImageUrl(meta.bannerFileId) : (data.imgUrl || ''),
      imgAlt: data.imgAlt || data.title || '',
      tags: data.tags || [],
      draft: !!data.draft,
      endpoint: { action: 'post', slug: meta.slug },
      warnings
    });
  }

  // Orden descendente por fecha de publicación (formato YYYY-MM-DD ordena bien como texto).
  posts.sort((a, b) => (a.pubDate < b.pubDate ? 1 : (a.pubDate > b.pubDate ? -1 : 0)));

  return { success: true, total: posts.length, posts };
}

const BANNER_NAMES_ = ['portada.png', 'portada.jpg', 'portada.jpeg'];

/**
 * Descubre el fileId de index.md y del banner de cada subcarpeta del root.
 * Dispara una consulta liviana por carpeta, pero TODAS en paralelo vía fetchAll
 * (no secuencial como findFileByName/findBannerFile, que fue el cuello de botella
 * real medido en la práctica: ~4 llamadas × N carpetas, una tras otra).
 */
function discoverPostMeta_() {
  const subfolders = listSubfolderIds_(ROOT_FOLDER_ID);
  Logger.log(`Subcarpetas encontradas bajo ROOT_FOLDER_ID: ${subfolders.length}`);
  if (subfolders.length === 0) return [];

  const filesByFolder = listFilesInFolders_(subfolders.map(f => f.id));

  const postMeta = [];
  subfolders.forEach(folder => {
    const filesHere = filesByFolder[folder.id] || [];
    const articleFile = filesHere.find(f => f.name === 'index.md');
    if (!articleFile) {
      Logger.log(`Carpeta "${folder.name}" sin index.md: se ignora (¿sigue subiéndose?).`);
      return;
    }
    const bannerFile = filesHere.find(f => BANNER_NAMES_.indexOf(f.name) !== -1);

    postMeta.push({
      slug: folder.name,
      articleFileId: articleFile.id,
      bannerFileId: bannerFile ? bannerFile.id : null
    });
  });

  return postMeta;
}

/** Lista las subcarpetas directas del root en UNA sola consulta a la API de Drive. */
function listSubfolderIds_(rootId) {
  const token = ScriptApp.getOAuthToken();
  const q = encodeURIComponent(`'${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1000`;

  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    Logger.log(`Fallo listando subcarpetas: HTTP ${response.getResponseCode()} — ${response.getContentText()}`);
    return [];
  }

  return JSON.parse(response.getContentText()).files || [];
}

/**
 * Lista los archivos de CADA carpeta con una consulta liviana por carpeta (q simple,
 * un solo padre), pero todas EN PARALELO vía fetchAll — no una consulta combinada con
 * "OR" de muchos padres, que en la práctica devolvió 0 resultados de forma silenciosa
 * (parser de consultas de Drive poco confiable con muchas cláusulas "in parents" a la vez).
 * Devuelve un mapa { folderId: [{id, name}, ...] }.
 */
function listFilesInFolders_(folderIds) {
  const token = ScriptApp.getOAuthToken();

  const requests = folderIds.map(id => {
    const q = encodeURIComponent(`'${id}' in parents and trashed=false`);
    return {
      url: `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1000`,
      method: 'get',
      headers: { Authorization: `Bearer ${token}` },
      muteHttpExceptions: true
    };
  });

  // Única llamada: N consultas (una por carpeta) despachadas en paralelo.
  const responses = UrlFetchApp.fetchAll(requests);

  const filesByFolder = {};
  responses.forEach((response, i) => {
    const folderId = folderIds[i];
    if (response.getResponseCode() !== 200) {
      Logger.log(`Fallo listando archivos de carpeta ${folderId}: HTTP ${response.getResponseCode()} — ${response.getContentText()}`);
      filesByFolder[folderId] = [];
      return;
    }
    filesByFolder[folderId] = JSON.parse(response.getContentText()).files || [];
  });

  return filesByFolder;
}

/** Construye una URL de "hotlink" público para una imagen de Drive a partir de su fileId. */
function buildDriveImageUrl(fileId) {
  // No usar drive.google.com/uc?export=view: desde mediados de 2026 su
  // redirección final (drive.usercontent.google.com) trae la cabecera
  // Cross-Origin-Resource-Policy: same-site, que Chrome bloquea vía CORB al
  // cargarla como <img> desde cualquier otro sitio. El endpoint de
  // miniaturas redirige en cambio a lh3.googleusercontent.com, que sí
  // responde con Access-Control-Allow-Origin: * y no bloquea el embed
  // cross-origin. Detalle completo en image-trouble.md (repo privado).
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`;
}

/**
 * Lee el contenido de todos los index.md EN PARALELO usando UrlFetchApp.fetchAll,
 * contra la API REST oficial de Drive (googleapis.com/drive/v3/files/{id}?alt=media),
 * autenticado con el token OAuth del propio script (ScriptApp.getOAuthToken()).
 *
 * Requiere UNA activación previa, de una sola vez y gratuita (sin tarjeta ni facturación):
 * habilitar "Google Drive API" — ver instrucciones en README.md / comentario al inicio
 * del proyecto. Probamos antes el enlace público (uc?export=download) para evitar este
 * paso, pero resultó ~5x MÁS LENTO en la práctica (esa ruta está pensada para navegadores,
 * no para llamadas programáticas) — por eso volvimos a la API oficial.
 *
 * Devuelve un mapa { fileId: contenidoTexto | null (si falló) }.
 *
 * Nota de límites: fetchAll soporta ~200 URLs por llamada de forma confiable.
 * Con cientos de posts, evaluar trocear en chunks o migrar al plan B (manifiesto + trigger).
 */
function fetchArticleContentsInParallel(postMeta) {
  const token = ScriptApp.getOAuthToken();

  const requests = postMeta.map(meta => ({
    url: `https://www.googleapis.com/drive/v3/files/${meta.articleFileId}?alt=media`,
    method: 'get',
    headers: { Authorization: `Bearer ${token}` },
    muteHttpExceptions: true // clave: un fallo individual no debe tumbar todo el batch
  }));

  // Única llamada: Apps Script despacha las N requests en paralelo.
  const responses = UrlFetchApp.fetchAll(requests);

  const result = {};
  responses.forEach((response, i) => {
    const fileId = postMeta[i].articleFileId;
    const code = response.getResponseCode();

    if (code === 200) {
      result[fileId] = response.getContentText('UTF-8');
    } else {
      result[fileId] = null;
      // Log completo del error real (antes lo tragábamos con muteHttpExceptions).
      // Si dice "Drive API has not been used in project... or it is disabled",
      // falta el paso de activación — ver README.md.
      Logger.log(`Fallo leyendo index.md (fileId=${fileId}): HTTP ${code}. Respuesta: ${response.getContentText()}`);
    }
  });
  return result;
}
