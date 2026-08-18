# Changelog

Todos los cambios notables de este proyecto se documentan acá. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/), y el versionado sigue [SemVer](https://semver.org/lang/es/).

## [1.0.0] - 2026-08-17

Primera versión pública.

### Agregado
- **Índice del blog** (`?action=index`): escanea la carpeta raíz de Drive y devuelve título, descripción, portada, tags y fecha de cada post. Descubrimiento de archivos y lectura de contenido en paralelo vía `UrlFetchApp.fetchAll()` — 88,6% más rápido que leer carpeta por carpeta de forma secuencial (11.500 ms → 1.300 ms con 20 posts).
- **Caché del índice** (`indexCache.js`): sirve desde `CacheService` y se mantiene tibia con un trigger cada 10 minutos (`setupIndexRefreshTrigger`), con reconstrucción y autorreparación en vivo si la caché está vacía. 97,7% más rápido que reconstruir en cada visita (2.359 ms → 55 ms).
- **Paginación y filtrado del índice** (`filterAndPaginate.js`): `?page=`/`?perPage=`/`?tag=`, en memoria sobre el índice ya construido — sin costo extra de Drive. Ambos opcionales, se activan en `config.js`.
- **Contenido completo de un post** (`?action=post&slug=...`, `getPost.js`): frontmatter, cuerpo en markdown, portada e imágenes de contenido de un post en una sola respuesta, para renderizar una página individual. Bloquea el acceso a borradores (`draft: true`) aunque se conozca el slug.
- **Resolución de imágenes de contenido** (`?action=images&slug=...`, `getImages.js`): traduce cada nombre de archivo referenciado en el markdown a una URL utilizable.
- **`config.js`**: configuración centralizada (`ROOT_FOLDER_ID`, `PAGINATION_CONFIG`, `FILTER_CONFIG`) — el único archivo pensado para tocar al adaptar el proyecto a otro blog.
- **Parser de frontmatter sin dependencias** (`frontmatter.js`): strings, booleans y arrays inline.
- **Benchmarks** (`benchmarks.js`): mediciones de latencia para comparar cada estrategia (secuencial vs. paralelo, con caché vs. sin caché).
- **Soporte para `clasp`**: `appsscript.json` con la Drive API habilitada y la config del Web App ya lista, para desplegar con `npm run push` en vez de copy-paste manual en el editor online.
- **Validación de frontmatter** (`validateFrontmatter_()` en `frontmatter.js`): revisa campos faltantes o mal formados (`title`, `description`, `author`, `pubDate` con formato `YYYY-MM-DD`, `tags` como array, `draft` como boolean) sin bloquear el post — las advertencias viajan en la respuesta (`warnings`, tanto en `?action=index` como en `?action=post`) y quedan logueadas server-side.
- **Feed RSS y sitemap** (`?action=rss`, `?action=sitemap`, `feeds.js`): armados en memoria desde el índice ya cacheado, usando `SITE_CONFIG` (nuevo en `config.js`) para construir URLs reales de cada post.
- **Post anterior/siguiente y posts relacionados en `getPost()`** (`prevPost`, `nextPost`, `relatedPosts`): salen del índice ya cacheado, sin costo extra de Drive.
- Documentación: `README.md` (estructura de carpetas, cómo armar un post, instalación, límites gratuitos, CORS, autenticación, RSS/sitemap, búsqueda del lado del cliente, por qué funciona con cualquier framework) y `LICENSE` (MIT). También disponible en inglés (`README.en.md`).

### Seguridad
- Validación del parámetro `slug` (`?action=post`/`?action=images`) contra un patrón fijo (`^[a-z0-9-]+$`) antes de usarlo en cualquier consulta a Drive — cierra un vector de inyección en la búsqueda de Drive (`findPostFolderBySlug_`), donde el slug llegaba sin escapar a un query `q`.

### Corregido
- **`buildDriveImageUrl()` (`buildIndex.js`) cambió de `drive.google.com/uc?export=view` a `drive.google.com/thumbnail?id=...&sz=w2000`**: el hotlink "clásico" de Drive redirige a `drive.usercontent.google.com`, que desde mediados de 2026 responde con `Cross-Origin-Resource-Policy: same-site` — Chrome bloquea esa respuesta vía CORB al usarla como `<img src>` desde cualquier sitio que no sea el propio Drive, así que ninguna imagen (portada ni contenido) cargaba en un frontend real, aunque la URL respondiera 200 OK para herramientas como `curl`. El endpoint de miniaturas redirige en cambio a `lh3.googleusercontent.com`, que responde con `Access-Control-Allow-Origin: *` y sí permite el embed cross-origin. Detalle completo (útil para depurar el mismo síntoma en cualquier otro proyecto) en `image-trouble.md` del repo privado.
