/**
 * Devuelve las URLs de todas las imágenes de un post, mapeadas por nombre
 * de archivo tal como aparecen referenciadas en el markdown (ej: "imagen-1.png").
 * Incluye la portada si está en la misma carpeta — Astro decide si la usa o no.
 *
 * A diferencia de buildIndex.js, acá nunca hace falta leer contenido de archivo,
 * solo metadata (nombre + fileId) — el navegador pide las imágenes directo a
 * Drive con la URL resuelta, Apps Script nunca actúa de proxy de bytes.
 */
function getImages(slug) {
  const folder = findPostFolderBySlug_(slug);
  if (!folder) {
    return { success: false, error: `No se encontró la carpeta del post "${slug}"` };
  }

  const files = listImagesInFolder_(folder.id);

  const images = {};
  files.forEach(file => {
    images[file.name] = buildDriveImageUrl(file.id); // reutiliza el helper de buildIndex.js
  });

  return { success: true, slug, images };
}

/** Busca la carpeta del post por su nombre (slug) dentro del root — 1 sola consulta. */
function findPostFolderBySlug_(slug) {
  const token = ScriptApp.getOAuthToken();
  const q = encodeURIComponent(
    `'${ROOT_FOLDER_ID}' in parents and name='${slug}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`;

  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    Logger.log(`Fallo buscando carpeta del post "${slug}": HTTP ${response.getResponseCode()} — ${response.getContentText()}`);
    return null;
  }

  return (JSON.parse(response.getContentText()).files || [])[0] || null;
}

/** Lista todas las imágenes (mimeType image/*) dentro de una carpeta — 1 sola consulta, excluye index.md solo. */
function listImagesInFolder_(folderId) {
  const token = ScriptApp.getOAuthToken();
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType contains 'image/'`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1000`;

  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    Logger.log(`Fallo listando imágenes de carpeta ${folderId}: HTTP ${response.getResponseCode()} — ${response.getContentText()}`);
    return [];
  }

  return JSON.parse(response.getContentText()).files || [];
}
