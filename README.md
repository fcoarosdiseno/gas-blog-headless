# GAS Blog — Google Drive como CMS

[English version](./README.en.md)

Backend en Google Apps Script (GAS) para un blog que usa **Google Drive como CMS**: puedes crear un post nuevo para tu blog simplemente arrojando una carpeta con el texto y las imágenes a Google Drive. Cualquier frontend (Astro, Next.js, lo que sea) consume el índice y los posts vía un Web App de Apps Script.

Diseñado para que cualquiera pueda copiarlo y adaptarlo a su propio blog. Esta es la **versión cruda**, sin frontend incluido — pensada para quien ya tiene su propio sitio y solo necesita el backend. Si buscas algo con un frontend en Astro ya integrado, esa es otra versión (ver sección al final).

## Funciona con cualquier framework

Este backend no depende de Astro en ningún punto, y tampoco el frontmatter es una convención suya — la usan Jekyll, Hugo, Eleventy, Next.js, Nuxt Content, Docusaurus y prácticamente cualquier generador de sitios o CMS headless: es solo un bloque `clave: valor` al principio de un archivo de texto. Lo que expone `doGet.js` es una API JSON genérica sobre HTTP (`?action=index`, `?action=post`, `?action=images`, `?action=rss`, `?action=sitemap`) — cualquier cosa que sepa hacer un `fetch()` la puede consumir.

Así que si usas Next.js, Nuxt, SvelteKit, Remix, o HTML+JS sin framework: te invito a probarlo ahí. Lo único que cambia por framework es la capa de renderizado (convertir el `content` en HTML y sustituir las imágenes con el mapa que devuelve la API) — la estructura de carpetas en Drive, el frontmatter y el contrato JSON completo se mantienen exactamente iguales, sin tocar una sola línea de este backend.

## Estructura esperada en Drive

```
📁 Carpeta raíz (ROOT_FOLDER_ID)
 ├── 📁 mi-primer-post/
 │    ├── index.md         ← contenido + frontmatter
 │    ├── portada.png      ← imagen de portada (o .jpg / .jpeg)
 │    ├── imagen-01.png    ← todas las imágenes que incluya tu artículo (o .jpg / .jpeg)
 │    └── imagen-02.png
 ├── 📁 otro-post/
 │    ├── index.md
 │    ├── portada.jpg
 │    └── ...
 └── ...
```

Cada `index.md` empieza con un frontmatter delimitado por `---`:

```markdown
---
title: Mi primer post
author: Nombre Apellido
description: Una descripción corta para el índice.
pubDate: 2026-08-10
imgAlt: Descripción de la portada
tags: [astro, apps-script, drive]
draft: false
---

Acá va el contenido del post en markdown...
```

Campos soportados por el parser (`frontmatter.js`): strings (con o sin comillas), booleans (`true`/`false`) y arrays inline (`[a, b, c]`). No es un parser YAML completo — cubre justo lo que necesita este flujo.

Hay un campo opcional más, no incluido en el ejemplo de arriba: `imgUrl`, una URL externa que se usa como portada **solo si la carpeta no tiene ningún archivo `portada.*`**. En el flujo recomendado (subir un archivo real, ver el paso 3 más abajo) nunca hace falta escribirlo — si existe un archivo de portada, ese manda siempre y `imgUrl` se ignora. Es un fallback para cuando no quieres subir un archivo, no una forma de "apuntar" a tu portada.

## Cómo armar la carpeta de un post

Todo el contenido vive en Drive, pero **conviene armar la carpeta completa en tu computadora primero, y recién subirla ya lista** — Drive no tiene ningún editor de markdown confiable en su marketplace, así que escribir el `index.md` directo ahí (Documentos de Google, el visor de texto plano, etc.) es incómodo y no te avisa de nada si te equivocas en el frontmatter. Ninguna de las convenciones de abajo depende de estar en Drive; funcionan igual en tu editor de siempre (VS Code, Obsidian, Typora, lo que uses).

1. **En tu computadora, crea una carpeta** con el nombre que va a ser el slug del post — se usa tal cual en las URLs (`?action=post&slug=mi-primer-post`), así que conviene minúsculas, sin espacios ni tildes, separado por guiones.
2. **Crea `index.md`** adentro, con el frontmatter (ver arriba) seguido del contenido en markdown.
3. **Agrega `portada.png`** (o `.jpg`/`.jpeg`) — la imagen de portada, usada para SEO y como imagen del post en el índice. Tiene que llamarse exactamente así (uno de esos tres nombres); tamaño recomendado **1200×800 px**. Si falta, el post igual funciona pero sin portada (salvo que hayas puesto `imgUrl` en el frontmatter, ver nota más arriba).
4. **Agrega las imágenes que uses dentro del cuerpo del markdown**, con el nombre que quieras (`imagen-1.png`, `foto-perro.jpg`, etc.) — pueden ser 0, 1 o varias.
5. **Referéncialas en el markdown por su nombre de archivo, sin ruta**, como una imagen markdown normal:
   ```markdown
   Acá va un poco de contenido.

   ![Un gato durmiendo](imagen-1.png)

   Más contenido, y otra imagen:

   ![Receta terminada](foto-final.jpg)
   ```
   Nada de `./imagen-1.png` ni URLs — Drive no es un servidor de archivos con rutas navegables, así que el nombre tal cual es lo único que hace falta escribir. El backend se encarga de traducir ese nombre a una URL real cuando el frontend pide el post (ver "Imágenes de contenido" más abajo) — el autor nunca necesita saber cómo se resuelve eso.
6. **Con todo listo y revisado, arrastra la carpeta completa a la carpeta raíz de Drive** (`ROOT_FOLDER_ID`). No hay ningún paso de "publicar" aparte: en cuanto Drive termina de subirla, el post aparece solo en el índice (puede tardar hasta ~10 minutos por la caché, ver más abajo). Si quieres subirla igual pero todavía no publicarla, `draft: true` en el frontmatter la mantiene oculta hasta que la cambies a `false`.

```
📁 mi-primer-post/
 ├── index.md              ← título, frontmatter y cuerpo en markdown
 ├── portada.png           ← imagen de portada (SEO / tarjeta del índice)
 ├── imagen-1.png          ← referenciada en el cuerpo como ![alt](imagen-1.png)
 └── foto-final.jpg        ← referenciada en el cuerpo como ![alt](foto-final.jpg)
```

## Archivos del proyecto

| Archivo | Responsabilidad |
|---|---|
| `config.js` | Configuración central: `ROOT_FOLDER_ID`, `PAGINATION_CONFIG`, `FILTER_CONFIG`. El único archivo pensado para tocar al adaptar el proyecto. |
| `doGet.js` | Punto de entrada del Web App. Enruta `?action=index`, `?action=post&slug=...`, `?action=images&slug=...`, `?action=rss` y `?action=sitemap`. |
| `buildIndex.js` | `buildIndexFresh_()`: reconstruye el índice escaneando Drive (descubre archivos + lee contenido, ambos en paralelo). |
| `indexCache.js` | `getIndex()`: punto de entrada real del índice, sirve desde caché y reconstruye en segundo plano vía trigger. |
| `filterAndPaginate.js` | Filtra por tag y pagina el índice ya construido, en memoria — no vuelve a tocar Drive. |
| `getPost.js` | Devuelve el contenido completo de UN post (frontmatter, cuerpo, portada e imágenes), para `/blog/[slug]`. |
| `getImages.js` | Resuelve las imágenes de contenido de un post (referenciadas desde su `index.md`) a URLs utilizables. |
| `frontmatter.js` | Parser de frontmatter sin dependencias externas, más `validateFrontmatter_()` (avisa de campos faltantes o mal formados, sin bloquear nada). |
| `feeds.js` | Feed RSS (`?action=rss`) y sitemap (`?action=sitemap`), armados en memoria a partir del índice ya cacheado. |
| `benchmarks.js` | Mediciones de latencia (`runLatencyComparison()`, `runCacheLatencyTest()`, `testGetPostLatency()`, `testGetImagesLatency()`) que comparan cada estrategia. |

## Forma de la respuesta (`?action=index`)

```json
{
  "success": true,
  "total": 2,
  "posts": [
    {
      "slug": "mi-primer-post",
      "title": "Mi primer post",
      "author": "Nombre Apellido",
      "description": "Una descripción corta para el índice.",
      "pubDate": "2026-08-10",
      "imgUrl": "https://drive.google.com/thumbnail?id=...&sz=w2000",
      "imgAlt": "Descripción de la portada",
      "tags": ["astro", "apps-script", "drive"],
      "draft": false,
      "endpoint": { "action": "post", "slug": "mi-primer-post" },
      "warnings": []
    }
  ]
}
```

Los posts con `draft: true` en el frontmatter se filtran automáticamente y no aparecen en la respuesta.

`warnings` avisa de frontmatter incompleto o mal formado (falta un campo, `pubDate` no es `YYYY-MM-DD`, `tags` no es un array, etc.) — nunca bloquea el post, solo informa. Vacío (`[]`) cuando todo está bien. Las mismas advertencias quedan logueadas server-side (`Ver > Registros de ejecución`), así que no hace falta mirar la respuesta JSON para notar un typo en el frontmatter.

## Paginación y filtrado del índice

Ambos son opcionales y se activan/ajustan en `config.js` (`PAGINATION_CONFIG`, `FILTER_CONFIG`). Se aplican en memoria sobre el índice que ya devolvió `getIndex()` (cacheado o recién construido) — nunca vuelven a tocar Drive, así que no tienen costo de latencia propio.

```
GET ?action=index                        → sin params: igual que siempre
GET ?action=index&tag=astro               → filtra por tag
GET ?action=index&page=2                  → pagina (si PAGINATION_CONFIG.ENABLED === true)
GET ?action=index&page=2&perPage=5&tag=x  → combinables
```

Con `PAGINATION_CONFIG.ENABLED = false` (default de este repo), `page`/`perPage` se ignoran y la respuesta es la de siempre (`{success, total, posts}`). Con `ENABLED = true`, la respuesta suma campos:

```json
{
  "success": true,
  "total": 34,
  "page": 2,
  "perPage": 20,
  "totalPages": 2,
  "posts": [ /* ... */ ]
}
```

Pedir una página fuera de rango no rompe nada: devuelve la última página válida. Pedir un `?perPage=` mayor al `MAX_PER_PAGE` configurado se recorta al máximo (y queda logueado).

## Caché del índice

`?action=index` no reconstruye el índice en cada visita: `getIndex()` (en `indexCache.js`) sirve desde una caché (`CacheService`) que se mantiene tibia con un trigger que corre cada 10 minutos y llama a `refreshIndexCache()`. Esto significa dos cosas:

- **Un post nuevo puede tardar hasta ~10 minutos en aparecer en el índice** — sigue siendo "arrastro la carpeta a Drive y me olvido", solo que ya no es instantáneo. Si necesitas que aparezca al toque, ejecuta `refreshIndexCache()` a mano desde el editor.
- Si la caché está vacía (primer uso, o el trigger falló, o `CacheService` la purgó), `getIndex()` reconstruye en vivo esa vez y se autorrepara solo — nunca depende de que el trigger haya corrido para funcionar.

**Setup (una sola vez, después de configurar `ROOT_FOLDER_ID`)**: ejecutar `setupIndexRefreshTrigger` desde el editor. Instala el trigger de 10 minutos y hace un primer refresh inmediato. Es idempotente — correrlo de nuevo no duplica triggers. Para desactivar el caching, `removeIndexRefreshTrigger`.

Costo: ~144 ejecuciones/día del trigger, ~1,3s cada una con 20 posts ≈ 3 minutos/día de tiempo de trigger — muy por debajo de cualquier límite gratuito.

## Contenido completo de un post (`?action=post&slug=...`)

Para renderizar `/blog/[slug]` en Astro no hace falta llamar a `?action=images` aparte: `getPost()` ya devuelve la carpeta completa de una — frontmatter, cuerpo en markdown y el mapa de imágenes (igual formato que `?action=images`) en una sola respuesta. Solo 2 llamadas a Drive (listar la carpeta + leer `index.md`), sin `fetchAll`: un solo post no necesita lecturas en paralelo.

```
GET ?action=post&slug=mi-primer-post
```

```json
{
  "success": true,
  "slug": "mi-primer-post",
  "title": "Mi primer post",
  "author": "Nombre Apellido",
  "description": "Una descripción corta para el índice.",
  "pubDate": "2026-08-10",
  "imgUrl": "https://drive.google.com/thumbnail?id=...&sz=w2000",
  "imgAlt": "Descripción de la portada",
  "tags": ["astro", "apps-script", "drive"],
  "content": "Acá va el contenido del post en markdown...",
  "images": {
    "imagen-1.png": "https://drive.google.com/thumbnail?id=...&sz=w2000"
  },
  "warnings": [],
  "prevPost": { "slug": "post-anterior", "title": "Título del post anterior" },
  "nextPost": null,
  "relatedPosts": [
    { "slug": "otro-post", "title": "Otro post", "imgUrl": "https://drive.google.com/thumbnail?id=...&sz=w2000" }
  ]
}
```

`prevPost`/`nextPost` son el post anterior/siguiente por fecha de publicación (`null` si no hay), y `relatedPosts` son hasta `RELATED_POSTS_LIMIT` posts que comparten al menos un tag (array vacío si el post no tiene tags o no hay coincidencias). Los tres salen del índice ya cacheado — no le suman una consulta extra a Drive a `getPost()`.

Si el post tiene `draft: true`, `getPost()` devuelve `{ success: false, error: ... }` en vez del contenido — el frontend no debería poder acceder a un borrador ni conociendo la URL directa.

## Feed RSS y sitemap

Ambos se arman en memoria a partir del mismo índice cacheado que `?action=index` (sin costo extra de Drive) y necesitan `SITE_CONFIG` configurado en `config.js` — este backend no tiene forma de saber en qué dominio vive tu frontend, así que hay que decírselo (`URL`, `TITLE`, `DESCRIPTION`). Sin configurar, los links salen con el placeholder literal.

```
GET ?action=rss       → XML, Content-Type application/rss+xml
GET ?action=sitemap   → XML, Content-Type application/xml
```

Cada post enlaza a `{SITE_CONFIG.URL}/blog/{slug}` — si tu frontend usa otra estructura de rutas, hay que ajustar `buildPostUrl_()` en `feeds.js`.

## Búsqueda del lado del cliente

No hay endpoint de búsqueda en este backend, y a propósito: con el índice completo ya en memoria del lado del frontend (lo que devuelve `?action=index`), alcanza con filtrar ese array en JavaScript — sin ida y vuelta al servidor, sin latencia, sin código nuevo acá. Por ejemplo, filtrando por `title`/`description`/`tags` con `.filter()` sobre el array que ya llegó. Si el blog crece mucho y esto deja de alcanzar, ahí sí tendría sentido evaluar algo del lado del servidor — no antes.

## Imágenes de contenido (`?action=images&slug=...`)

Cómo se referencian las imágenes al escribir un post está explicado en "Cómo armar la carpeta de un post" más arriba. Esta sección es el lado backend: cada post puede tener una cantidad variable de imágenes referenciadas desde dentro de su `index.md` (ej: `![imagen 1](imagen-1.png)`), y como Drive no es un servidor de archivos estático, esas referencias no se resuelven solas — hay que traducir nombre de archivo → URL utilizable.

**No escribas el link de "Compartir" de Drive** (`drive.google.com/file/d/{id}/view?usp=sharing`) en ningún lado — esa es la página visor HTML de Drive, nunca funciona dentro de un `<img>`. Este endpoint ya resuelve al formato correcto por ti.

```
GET ?action=images&slug=mi-primer-post
```

```json
{
  "success": true,
  "slug": "mi-primer-post",
  "images": {
    "imagen-1.png": "https://drive.google.com/thumbnail?id=...&sz=w2000",
    "imagen-2.png": "https://drive.google.com/thumbnail?id=...&sz=w2000",
    "portada.png": "https://drive.google.com/thumbnail?id=...&sz=w2000"
  }
}
```

El consumidor (Astro, u otro frontend) usa este mapa para sustituir cada `src` del markdown por la URL real al renderizar el post — por ejemplo, sobreescribiendo el renderer de imágenes de la librería de markdown que uses. El autor del post nunca necesita saber esto: sigue escribiendo `![alt](nombre-de-archivo.png)` tal cual, sin rutas ni URLs.

## CORS: llamar a este backend desde el navegador

Este backend expone todo por `GET` con parámetros en la URL (`?action=...`), nunca `POST` ni headers custom — eso importa para CORS: el navegador solo dispara un preflight (`OPTIONS`) cuando el request deja de ser "simple", y un `GET` sin headers custom siempre lo es. En la práctica, esto significa que cualquier frontend (Astro, React, lo que sea) puede llamar directo a la URL `/exec` del Web App desde cualquier origen, sin configurar nada de CORS en `doGet.js` ni en Apps Script. Probado end-to-end contra un frontend real corriendo en un origin distinto (`localhost`) — sin errores.

Si en algún momento agregas un endpoint que reciba `POST` (por ejemplo, comentarios), esto deja de aplicar: ahí sí entra un preflight real, y `doOptions()` en los Web Apps de Apps Script no es confiable — habría que investigarlo aparte, no asumas que se comporta igual que `GET`.

## Instalación

Dos formas de subir el código: copy-paste manual en el editor online, o con `clasp` (la CLI oficial de Apps Script) si prefieres tener esto en un repo real y desplegar con un comando.

1. **Crear el proyecto**: en [script.google.com](https://script.google.com), crear un proyecto nuevo y pegar el contenido de los 10 archivos `.js` tal cual (están como `.js` solo para que el editor los resalte bien — Apps Script no pide extensión al nombrar un archivo ahí, así que da igual), más `appsscript.json` (⚙️ Configuración del proyecto → "Mostrar archivo de manifiesto appsscript.json").

   **Alternativa con `clasp`** (recomendada si vas a seguir iterando sobre esto): evita el copy-paste y el riesgo de que un archivo quede desactualizado en el editor online sin que te des cuenta.
   ```bash
   npm install                          # instala clasp como devDependency
   npm run login                        # una sola vez, abre el navegador para autenticarte
   npm run create                       # crea un proyecto nuevo de Apps Script y lo conecta acá
   # (si ya tienes un proyecto de Apps Script y quieres conectarlo en vez de crear uno nuevo:
   #  npx clasp clone <SCRIPT_ID> — lo encuentras en ⚙️ Configuración del proyecto, en el editor)
   npm run push                         # sube este código al proyecto
   ```
   `appsscript.json` (incluido en este repo) ya trae la Drive API habilitada como servicio avanzado (`enabledAdvancedServices`) y la config del Web App (`webapp.access`/`executeAs`), así que `clasp push` deja todo listo sin pasos manuales extra en el editor. De ahí en adelante, cualquier cambio es `npm run push` en vez de copiar y pegar archivo por archivo.

   **Antes del primer `push`**: activa la Apps Script API de tu cuenta en [script.google.com/home/usersettings](https://script.google.com/home/usersettings) (un switch a nivel de cuenta, no de proyecto — sin esto, `clasp push` falla con "User has not enabled the Apps Script API"). Es un paso único, y puede tardar un par de minutos en propagarse.

2. **Habilitar la Google Drive API** (una sola vez, gratis, sin tarjeta):
   - En el editor → panel izquierdo **Servicios** → **+** ("Agregar un servicio")
   - Elegir **Google Drive API** → **Añadir**
   - Esto habilita tanto el objeto `Drive.*` como las llamadas REST que usa este proyecto (`UrlFetchApp` contra `googleapis.com/drive/v3/...`). Nunca pide facturación — de hecho, el proyecto de Cloud que Apps Script crea por defecto ni siquiera tiene una pantalla de facturación a la que llegar.

3. **Configurar la carpeta raíz**: en `config.js`, reemplazar:
   ```js
   const ROOT_FOLDER_ID = 'PON_AQUI_TU_FOLDER_ID';
   ```
   por el ID real de tu carpeta raíz en Drive (el string en la URL de la carpeta). De paso, `config.js` es donde se activa/ajusta la paginación y el filtrado (ver más abajo), y donde va `SITE_CONFIG` (URL/título/descripción de tu blog) si vas a usar el feed RSS o el sitemap.

4. **Autorizar**: ejecutar cualquier función una vez desde el editor (por ejemplo `runLatencyComparison`) y aceptar los permisos — se piden solos (Drive + solicitudes externas + triggers), no hace falta tocar nada más.

5. **Probar el benchmark**: elegir `runLatencyComparison` en el desplegable de funciones → Ejecutar → ver Ver > Registros de ejecución (Ctrl+Enter).

6. **Instalar el trigger de caché**: elegir `setupIndexRefreshTrigger` en el desplegable → Ejecutar (una sola vez). Ver la sección "Caché del índice" más abajo.

7. **Desplegar como Web App**: Implementar → Nueva implementación → Aplicación web → ejecutar como "Yo", acceso según necesidad. Probar `<url>?action=index`.

## Autenticación (o la falta de ella)

Este backend no tiene ninguna capa de autenticación: el Web App se despliega con acceso `ANYONE_ANONYMOUS` (ver `appsscript.json`), así que cualquiera con la URL `/exec` puede llamar a cualquier `?action=` sin login ni API key. Es una decisión de diseño, no un descuido — tiene sentido para contenido que ya es público por naturaleza (un blog).

Lo que sí protege:
- Los posts con `draft: true` se bloquean server-side, incluso pidiendo el slug directo — nunca dependen de "no estar listados" para quedar ocultos (ver `getPost.js`).
- El parámetro `slug` se valida contra un patrón fijo (`^[a-z0-9-]+$`, el mismo formato ya recomendado al armar la carpeta de un post) antes de usarse en cualquier consulta a Drive. Sin esto, un slug manipulado (con comillas, por ejemplo) podría intentar escapar la búsqueda fuera de la carpeta raíz del blog — el script corre con los permisos de Drive de quien lo desplegó (`executeAs: USER_DEPLOYING`), así que validar la entrada acá importa de verdad, no es solo prolijidad.
- El token OAuth del script solo tiene los scopes que pidió explícitamente (Drive, `UrlFetchApp`, triggers) — nunca Gmail ni nada fuera de eso. Ni en el peor escenario de abuso de una consulta esto podría tocar tu correo o tu cuenta de Google: eso depende de la autenticación de tu cuenta, un sistema completamente aparte.

Lo que NO protege, y qué significa para quien adapte este proyecto:
- No hay rate limiting — las cuotas gratuitas de Apps Script actúan como techo (ver "Límites gratuitos" abajo), pero no es protección real contra abuso.
- No hay forma de restringir contenido a usuarios logueados. Si tu caso de uso lo necesita, hay que agregarlo aparte (por ejemplo, comparando un token en el header contra un valor guardado en `PropertiesService`) — no viene incluido acá.

## Límites gratuitos

No hay forma de que este proyecto genere un cobro a tu cuenta, incluso con mucho tráfico:

| Límite | Valor |
|---|---|
| Google Drive API — unidades de cuota/día | 400.000.000 (gratis) |
| `UrlFetchApp` — llamadas/día (cuenta personal) | 20.000 |
| `UrlFetchApp` — llamadas/día (Workspace) | 100.000 |
| Tamaño de respuesta por llamada | 50 MB |

Fuentes: [Drive API limits](https://developers.google.com/workspace/drive/api/guides/limits), [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas).

## Rendimiento

Medido con 20 posts:

| Enfoque | Tiempo |
|---|---|
| Secuencial (`DriveApp`, archivo por archivo) — `runLatencyComparison()` | ~11.500 ms |
| Paralelo (este proyecto, `fetchAll` en dos fases) — `runLatencyComparison()` | ~1.300 ms |
| **Mejora vs. secuencial** | **~88%** |
| Reconstrucción completa del índice — `runCacheLatencyTest()` | ~2.360 ms |
| Índice servido desde caché tibia — `runCacheLatencyTest()` | ~55 ms |
| **Mejora vs. reconstruir en cada visita** | **~98%** |

Estos dos números se combinan en la práctica: el trigger de 10 minutos paga el costo de reconstrucción en segundo plano, así que casi ningún visitante real llega a pagar los ~1.300 ms — la mayoría recibe la respuesta cacheada de ~55 ms.

## Cuándo este enfoque deja de alcanzar

- **`fetchAll` soporta de forma confiable hasta ~200 URLs por llamada.** Con cientos de posts, `buildIndexFresh_()` necesitaría trocear las lecturas en chunks, lo que reintroduce algo de secuencialidad entre chunks — pero como esa reconstrucción ya corre en background (trigger) y no en el camino de un visitante real, el impacto es mucho menor que antes de tener caché.
- **`CacheService` tiene un límite de 100 KB por valor cacheado.** Con blogs muy grandes (cientos de posts con descripciones largas) el índice serializado podría superarlo — `setIndexCache_()` ya maneja ese caso sin romper el sitio (loguea y sigue sirviendo en vivo), pero en ese punto conviene paginar el índice (ver roadmap) en vez de cachear un único blob gigante.
- **`imgUrl` usa el endpoint de miniaturas público de Drive** (`drive.google.com/thumbnail?id=...&sz=w2000`), que requiere que los archivos tengan permiso "Cualquiera con el enlace" y no es un endpoint oficialmente soportado — válido para un blog personal, no ideal para tráfico alto. Si te da curiosidad por qué no se usa el hotlink "clásico" `uc?export=view` (Chrome lo bloquea vía CORB desde mediados de 2026), el comentario de `buildDriveImageUrl()` en `buildIndex.js` lo explica.

## Otras versiones

Esta es la versión cruda, sin frontend, para conectar a cualquier sitio propio. Una versión con un frontend en Astro ya integrado está planeada como proyecto aparte.

## Licencia

[MIT](./LICENSE) — úsalo, modifícalo, adáptalo a tu proyecto libremente.

## Changelog

Los cambios de cada versión están en [`CHANGELOG.md`](./CHANGELOG.md).
