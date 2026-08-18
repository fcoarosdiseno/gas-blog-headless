/**
 * Capa de caché para el índice del blog. Complementa (no reemplaza) el fix de
 * latencia de buildIndex.js: ese fix ya bajó la reconstrucción de 11,5s a ~1,3s,
 * pero cada visita seguía pagando ese costo escaneando Drive de cero. Acá se
 * agrega un manifiesto cacheado con CacheService + un trigger periódico que lo
 * mantiene tibio en segundo plano, para que el visitante normal reciba una
 * respuesta casi instantánea en vez de pagar la reconstrucción.
 *
 * Frescura elegida: el trigger reconstruye cada 10 minutos, así que un post
 * nuevo (arrastrado a Drive) tarda como máximo ~10 min en aparecer en el
 * índice — sigue siendo "arrastro la carpeta y me olvido", solo que ya no es
 * instantáneo. Si en algún momento hace falta que sea instantáneo, la
 * alternativa es detectar el cambio en Drive en vez de un trigger a intervalo
 * fijo, pero es bastante más compleja de hacer confiable con Apps Script.
 */

const INDEX_CACHE_KEY_ = 'blog_index_v1';
const INDEX_CACHE_TTL_SECONDS_ = 900; // 15 min: más que el intervalo del trigger (10 min),
                                       // para tolerar que un ciclo del trigger falle sin
                                       // quedarse sin caché de golpe.

/**
 * Punto de entrada real para servir el índice (usado por doGet.js).
 * Sirve desde caché si hay algo guardado y vigente; si no (primera vez,
 * o el trigger todavía no corrió, o CacheService lo purgó), reconstruye en
 * vivo con buildIndexFresh_() y lo deja cacheado para la próxima. Nunca
 * devuelve un error solo porque la caché esté vacía — siempre se autorrepara.
 */
function getIndex() {
  const cached = getIndexCache_();
  if (cached) return cached;

  const result = buildIndexFresh_(); // buildIndex.js
  setIndexCache_(result);
  return result;
}

/** Lee el índice cacheado. Devuelve null si no hay nada guardado o expiró. */
function getIndexCache_() {
  const raw = CacheService.getScriptCache().get(INDEX_CACHE_KEY_);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (err) {
    Logger.log(`Caché de índice corrupta, se ignora y se reconstruye: ${err}`);
    return null;
  }
}

/**
 * Guarda el índice en caché. CacheService tiene un límite de 100 KB por
 * valor — con blogs muy grandes (cientos de posts con descripciones largas)
 * podría superarse. Si eso pasa, no rompemos el sitio: logueamos y seguimos
 * sirviendo en vivo cada vez (getIndex() ya maneja "sin caché" con gracia).
 */
function setIndexCache_(result) {
  try {
    CacheService.getScriptCache().put(INDEX_CACHE_KEY_, JSON.stringify(result), INDEX_CACHE_TTL_SECONDS_);
  } catch (err) {
    Logger.log(`No se pudo cachear el índice (¿superó 100 KB?): ${err}`);
  }
}

/**
 * Reconstruye el índice desde Drive y lo cachea. Es lo que ejecuta el trigger
 * periódico (ver setupIndexRefreshTrigger) para mantener la caché tibia en
 * segundo plano — así el visitante casi nunca paga el costo de escanear Drive.
 * También se puede correr a mano desde el editor para forzar un refresh.
 */
function refreshIndexCache() {
  const start = new Date().getTime();
  const result = buildIndexFresh_();
  setIndexCache_(result);
  Logger.log(`refreshIndexCache: ${new Date().getTime() - start} ms — ${result.total} posts cacheados`);
  return result;
}

/**
 * Instala el trigger que llama a refreshIndexCache() cada 10 minutos.
 * Correr UNA sola vez a mano desde el editor (Ejecutar → setupIndexRefreshTrigger).
 * Es idempotente: borra cualquier trigger anterior de refreshIndexCache antes de
 * crear uno nuevo, así se puede correr de nuevo sin duplicar triggers.
 *
 * Costo de cuota: 144 ejecuciones/día × ~1,3s cada una ≈ 3 minutos/día de
 * tiempo de trigger — muy por debajo de cualquier límite gratuito (el límite
 * de ejecución total de triggers es de varias horas/día incluso en cuentas
 * personales). No requiere facturación ni nada fuera de lo ya autorizado.
 */
function setupIndexRefreshTrigger() {
  removeIndexRefreshTrigger();

  ScriptApp.newTrigger('refreshIndexCache')
    .timeBased()
    .everyMinutes(10)
    .create();

  Logger.log('Trigger de refresco de caché instalado: refreshIndexCache cada 10 minutos.');

  // Primer refresh inmediato para no esperar 10 min a que haya algo cacheado.
  refreshIndexCache();
}

/** Borra cualquier trigger existente de refreshIndexCache. Útil para desinstalar el caching. */
function removeIndexRefreshTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'refreshIndexCache') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}
