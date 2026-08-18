/**
 * Benchmark: compara el enfoque VIEJO (lectura secuencial con DriveApp)
 * contra el NUEVO (getIndex con UrlFetchApp.fetchAll en paralelo).
 * Correr `runLatencyComparison` directamente desde el editor de Apps Script.
 */
function runLatencyComparison() {
  const oldMs = benchmarkOldSequentialRead();
  const newMs = benchmarkNewFetchAllRead();

  const improvementMs = oldMs - newMs;
  const improvementPct = oldMs > 0 ? (improvementMs / oldMs) * 100 : 0;

  Logger.log('--- Comparación de latencia ---');
  Logger.log(`Enfoque VIEJO (DriveApp secuencial): ${oldMs} ms`);
  Logger.log(`Enfoque NUEVO (fetchAll paralelo):    ${newMs} ms`);
  Logger.log(`Mejora: ${improvementMs} ms (${improvementPct.toFixed(1)}%)`);
}

/** Busca un archivo por nombre exacto dentro de una carpeta: 1 llamada a Drive por búsqueda. */
function findFileByName(folder, exactName) {
  const files = folder.getFilesByName(exactName);
  return files.hasNext() ? files.next() : null;
}

/** Busca portada.png / portada.jpg / portada.jpeg dentro de la carpeta: hasta 3 llamadas a Drive. */
function findBannerFile(folder) {
  const candidates = ['portada.png', 'portada.jpg', 'portada.jpeg'];
  for (const name of candidates) {
    const f = findFileByName(folder, name);
    if (f) return f;
  }
  return null;
}

/**
 * Mide el enfoque viejo: carpeta por carpeta, findFileByName/findBannerFile
 * (varias llamadas a Drive por carpeta) + getBlob().getDataAsString() secuencial.
 * Este es el punto de partida real que estamos comparando contra getIndex().
 */
function benchmarkOldSequentialRead() {
  const start = new Date().getTime();

  const rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const subfolders = rootFolder.getFolders();

  while (subfolders.hasNext()) {
    const folder = subfolders.next();
    const articleFile = findFileByName(folder, 'index.md');
    if (!articleFile) continue;

    findBannerFile(folder); // mismo costo de metadata que paga getIndex()

    // Línea lenta: descarga de contenido secuencial, una por una.
    const text = articleFile.getBlob().getDataAsString('UTF-8');
    parseFrontmatter(text); // incluimos el parseo para comparar manzanas con manzanas
  }

  return new Date().getTime() - start;
}

/** Mide el enfoque nuevo: getIndex() completo, que usa fetchAll internamente. */
function benchmarkNewFetchAllRead() {
  const start = new Date().getTime();
  buildIndexFresh_(); // sin pasar por caché: mide la reconstrucción en sí, como antes
  return new Date().getTime() - start;
}

/**
 * Compara la reconstrucción completa (lo que paga el trigger cada 10 min)
 * contra lo que paga un visitante real cuando la caché ya está tibia.
 * Correr después de haber ejecutado setupIndexRefreshTrigger() al menos una vez
 * (o refreshIndexCache() directamente), para que haya algo cacheado que medir.
 */
function runCacheLatencyTest() {
  const freshStart = new Date().getTime();
  refreshIndexCache(); // fuerza reconstrucción + guarda en caché
  const freshMs = new Date().getTime() - freshStart;

  const cachedStart = new Date().getTime();
  getIndex(); // ahora sí debería estar sirviendo desde la caché
  const cachedMs = new Date().getTime() - cachedStart;

  Logger.log('--- Comparación de caché ---');
  Logger.log(`Reconstrucción completa (refreshIndexCache, lo que hace el trigger): ${freshMs} ms`);
  Logger.log(`Con caché tibia (getIndex, lo que paga un visitante real):           ${cachedMs} ms`);
}

/**
 * Slug de un post real, para poder correr el test de imágenes directo desde
 * el desplegable del editor — las funciones con parámetros no se pueden
 * ejecutar ahí sin un wrapper sin argumentos (se llaman con slug=undefined).
 */
const TEST_SLUG = 'PON_AQUI_EL_SLUG_DE_UN_POST_REAL';

/** Wrapper sin parámetros: elige ESTA función en el desplegable y ejecuta. */
function runImagesLatencyTest() {
  testGetImagesLatency(TEST_SLUG);
}

/** Wrapper sin parámetros: elige ESTA función en el desplegable y ejecuta. */
function runPostLatencyTest() {
  testGetPostLatency(TEST_SLUG);
}

/**
 * Mide getImages() para un post real. A diferencia del índice, acá no hay
 * lectura de contenido ni fetchAll — es solo metadata de una carpeta, así que
 * debería ser rápido de por sí. Sirve para confirmar eso en la práctica y
 * detectar si alguna carpeta con muchas imágenes se sale de lo esperado.
 */
function testGetImagesLatency(slug) {
  const start = new Date().getTime();
  const result = getImages(slug);
  const elapsed = new Date().getTime() - start;

  if (!result.success) {
    Logger.log(`getImages("${slug}") falló: ${result.error}`);
    return elapsed;
  }

  const count = Object.keys(result.images).length;
  Logger.log(`getImages("${slug}"): ${elapsed} ms — ${count} imágenes encontradas`);
  Logger.log(JSON.stringify(result.images, null, 2)); // URLs reales, para copiar y probar en el navegador
  return elapsed;
}

/**
 * Mide getPost() para un post real: 2 llamadas a Drive (listar carpeta + leer
 * index.md), sin fetchAll — un solo post no necesita paralelismo. Sirve para
 * confirmar que sigue siendo rápido y para inspeccionar la forma completa de
 * la respuesta (frontmatter + contenido + portada + imágenes) de una.
 */
function testGetPostLatency(slug) {
  const start = new Date().getTime();
  const result = getPost(slug);
  const elapsed = new Date().getTime() - start;

  if (!result.success) {
    Logger.log(`getPost("${slug}") falló: ${result.error}`);
    return elapsed;
  }

  const imageCount = Object.keys(result.images).length;
  const contentLength = result.content.length;
  Logger.log(`getPost("${slug}"): ${elapsed} ms — título "${result.title}", ${contentLength} caracteres de contenido, ${imageCount} imágenes de cuerpo, portada: ${result.imgUrl ? 'sí' : 'no'}`);
  Logger.log(JSON.stringify(result, null, 2)); // respuesta completa, para inspeccionar la forma exacta
  return elapsed;
}
