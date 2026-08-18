# GAS Blog — Google Drive as a CMS

[Versión en español](./README.md)

A Google Apps Script (GAS) backend for a blog that uses **Google Drive as a CMS**: you can create a new post for your blog just by dropping a folder with the text and images into Google Drive. Any frontend (Astro, Next.js, whatever) consumes the index and the posts through an Apps Script Web App.

Built so anyone can copy it and adapt it to their own blog. This is the **raw version**, with no frontend included — meant for people who already have their own site and just need the backend. Looking for something with an Astro frontend already wired up? That's a separate project (see the section at the end).

## Works with any framework

This backend doesn't depend on Astro anywhere, and frontmatter itself isn't an Astro convention either — Jekyll, Hugo, Eleventy, Next.js, Nuxt Content, Docusaurus, and pretty much every static site generator or headless CMS use it: it's just a `key: value` block at the top of a text file. What `doGet.js` exposes is a generic JSON API over HTTP (`?action=index`, `?action=post`, `?action=images`, `?action=rss`, `?action=sitemap`) — anything that can do a `fetch()` can consume it.

So if you use Next.js, Nuxt, SvelteKit, Remix, or plain HTML+JS with no framework at all: you're invited to try it there. The only thing that changes per framework is the rendering layer (turning `content` into HTML and swapping in images from the map the API returns) — the Drive folder structure, the frontmatter, and the full JSON contract stay exactly the same, without touching a single line of this backend.

## Expected structure in Drive

```
📁 Root folder (ROOT_FOLDER_ID)
 ├── 📁 my-first-post/
 │    ├── index.md        ← content + frontmatter
 │    ├── cover.png        ← cover image (or .jpg / .jpeg)
 │    ├── image-01.png
 │    └── image-02.png
 ├── 📁 another-post/
 │    ├── index.md
 │    ├── cover.jpg
 │    └── ...
 └── ...
```

Each `index.md` starts with `---`-delimited frontmatter:

```markdown
---
title: My first post
author: Jane Doe
description: A short description for the index.
pubDate: 2026-08-10
imgAlt: Cover image description
tags: [astro, apps-script, drive]
draft: false
---

The post content goes here, in markdown...
```

Fields supported by the parser (`frontmatter.js`): strings (quoted or unquoted), booleans (`true`/`false`), and inline arrays (`[a, b, c]`). Not a full YAML parser — it covers exactly the flat subset this workflow needs.

There's one more optional field, not included in the example above: `imgUrl`, an external URL used as the cover **only if the folder has no `portada.*` file at all**. In the recommended flow (uploading a real file, see step 3 below) you never need to write it — if a cover file exists, it always wins and `imgUrl` is ignored. It's a fallback for when you don't want to upload a file, not a way to "point to" your cover.

## How to set up a post's folder

The content lives in Drive, but **you're better off building the whole folder on your computer first, and only uploading it once it's ready** — Drive doesn't have any reliable markdown editor in its marketplace, so writing `index.md` directly there (Google Docs, the plain-text viewer, etc.) is awkward and won't warn you about a broken frontmatter. None of the conventions below depend on being in Drive; they work the same in whatever editor you already use (VS Code, Obsidian, Typora, anything).

1. **On your computer, create a folder** named after what will be the post's slug — used as-is in URLs (`?action=post&slug=my-first-post`), so lowercase, no spaces or accents, hyphen-separated works best.
2. **Create `index.md`** inside it, with the frontmatter (see above) followed by the markdown content.
3. **Add a cover image**: one of `portada.png` / `portada.jpg` / `portada.jpeg` — used for SEO and as the post's card image in the index (the filename has to be exactly one of those three, matching the Spanish word "portada" — the code checks for those literal names). Recommended size: **1200×800 px**. If it's missing, the post still works, just without a cover (unless you set `imgUrl` in the frontmatter, see the note above).
4. **Add whatever body images you use**, named however you like (`image-1.png`, `dog-photo.jpg`, etc.) — 0, 1, or several.
5. **Reference them in the markdown by filename only, no path**, as a normal markdown image:
   ```markdown
   Some content here.

   ![A sleeping cat](image-1.png)

   More content, and another image:

   ![Finished recipe](final-photo.jpg)
   ```
   No `./image-1.png`, no URLs — Drive isn't a static file server with navigable paths, so the plain filename is all you ever need to write. The backend translates that filename into a real URL when the frontend requests the post (see "Content images" below) — the author never needs to know how that resolution works.
6. **Once everything is ready and checked, drag the whole folder into Drive's root folder** (`ROOT_FOLDER_ID`). There's no separate "publish" step: as soon as Drive finishes uploading it, the post shows up on its own in the index (can take up to ~10 minutes because of caching, see below). If you want to upload it but not publish it yet, `draft: true` in the frontmatter keeps it hidden until you flip it to `false`.

```
📁 my-first-post/
 ├── index.md              ← title, frontmatter, and markdown body
 ├── portada.png           ← cover image (SEO / index card)
 ├── image-1.png           ← referenced in the body as ![alt](image-1.png)
 └── final-photo.jpg       ← referenced in the body as ![alt](final-photo.jpg)
```

## Project files

| File | Responsibility |
|---|---|
| `config.js` | Central configuration: `ROOT_FOLDER_ID`, `PAGINATION_CONFIG`, `FILTER_CONFIG`, `SITE_CONFIG`, `RELATED_POSTS_LIMIT`. The only file you should need to touch when adapting the project. |
| `doGet.js` | The Web App's entry point. Routes `?action=index`, `?action=post&slug=...`, `?action=images&slug=...`, `?action=rss`, and `?action=sitemap`. |
| `buildIndex.js` | `buildIndexFresh_()`: rebuilds the index by scanning Drive (discovers files + reads content, both in parallel). |
| `indexCache.js` | `getIndex()`: the index's real entry point — serves from cache and rebuilds in the background via a trigger. |
| `filterAndPaginate.js` | Filters by tag and paginates the already-built index, in memory — never touches Drive again. |
| `getPost.js` | Returns a single post's full content (frontmatter, body, cover, images, prev/next, related posts) for `/blog/[slug]`. |
| `getImages.js` | Resolves a post's content images (referenced from its `index.md`) into usable URLs. |
| `frontmatter.js` | Dependency-free frontmatter parser, plus `validateFrontmatter_()` (flags missing or malformed fields without blocking anything). |
| `feeds.js` | RSS feed (`?action=rss`) and sitemap (`?action=sitemap`), built in memory from the already-cached index. |
| `benchmarks.js` | Latency measurements (`runLatencyComparison()`, `runCacheLatencyTest()`, `testGetPostLatency()`, `testGetImagesLatency()`) comparing each strategy. |

## Response shape (`?action=index`)

```json
{
  "success": true,
  "total": 2,
  "posts": [
    {
      "slug": "my-first-post",
      "title": "My first post",
      "author": "Jane Doe",
      "description": "A short description for the index.",
      "pubDate": "2026-08-10",
      "imgUrl": "https://drive.google.com/thumbnail?id=...&sz=w2000",
      "imgAlt": "Cover image description",
      "tags": ["astro", "apps-script", "drive"],
      "draft": false,
      "endpoint": { "action": "post", "slug": "my-first-post" },
      "warnings": []
    }
  ]
}
```

Posts with `draft: true` in the frontmatter are filtered out automatically and never show up in the response.

`warnings` flags incomplete or malformed frontmatter (a missing field, `pubDate` not in `YYYY-MM-DD`, `tags` not an array, etc.) — it never blocks the post, only informs. Empty (`[]`) when everything's fine. The same warnings are logged server-side (`View > Execution log`), so you don't need to inspect the JSON response to notice a frontmatter typo.

## Index pagination and filtering

Both are optional, toggled/tuned in `config.js` (`PAGINATION_CONFIG`, `FILTER_CONFIG`). They're applied in memory over whatever `getIndex()` already returned (cached or freshly built) — they never touch Drive again, so they add no latency of their own.

```
GET ?action=index                        → no params: same as always
GET ?action=index&tag=astro               → filter by tag
GET ?action=index&page=2                  → paginate (if PAGINATION_CONFIG.ENABLED === true)
GET ?action=index&page=2&perPage=5&tag=x  → combinable
```

With `PAGINATION_CONFIG.ENABLED = false` (this repo's default), `page`/`perPage` are ignored and the response stays as-is (`{success, total, posts}`). With `ENABLED = true`, the response gains fields:

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

Requesting an out-of-range page doesn't break anything: it returns the last valid page. Requesting a `?perPage=` above the configured `MAX_PER_PAGE` gets clamped to the max (and logged).

## Index cache

`?action=index` doesn't rebuild the index on every visit: `getIndex()` (in `indexCache.js`) serves from a cache (`CacheService`) kept warm by a trigger that runs every 10 minutes and calls `refreshIndexCache()`. This means two things:

- **A new post can take up to ~10 minutes to show up in the index** — it's still "drag the folder into Drive and forget about it," just no longer instant. If you need it to show up right away, run `refreshIndexCache()` manually from the editor.
- If the cache is empty (first use, the trigger failed, or `CacheService` purged it), `getIndex()` rebuilds live that one time and self-heals — it never depends on the trigger having run to work.

**Setup (once, after configuring `ROOT_FOLDER_ID`)**: run `setupIndexRefreshTrigger` from the editor. Installs the 10-minute trigger and does an immediate first refresh. It's idempotent — running it again doesn't duplicate triggers. To disable caching, `removeIndexRefreshTrigger`.

Cost: ~144 trigger executions/day, ~1.3s each with 20 posts ≈ 3 minutes/day of trigger time — well under any free-tier limit.

## Full post content (`?action=post&slug=...`)

To render `/blog/[slug]` in Astro you don't need a separate call to `?action=images`: `getPost()` already returns the whole folder at once — frontmatter, markdown body, and the image map (same shape as `?action=images`) in a single response. Just 2 Drive calls (list the folder + read `index.md`), no `fetchAll`: a single post doesn't need parallel reads.

```
GET ?action=post&slug=my-first-post
```

```json
{
  "success": true,
  "slug": "my-first-post",
  "title": "My first post",
  "author": "Jane Doe",
  "description": "A short description for the index.",
  "pubDate": "2026-08-10",
  "imgUrl": "https://drive.google.com/thumbnail?id=...&sz=w2000",
  "imgAlt": "Cover image description",
  "tags": ["astro", "apps-script", "drive"],
  "content": "The post content goes here, in markdown...",
  "images": {
    "image-1.png": "https://drive.google.com/thumbnail?id=...&sz=w2000"
  },
  "warnings": [],
  "prevPost": { "slug": "previous-post", "title": "Previous post title" },
  "nextPost": null,
  "relatedPosts": [
    { "slug": "another-post", "title": "Another post", "imgUrl": "https://drive.google.com/thumbnail?id=...&sz=w2000" }
  ]
}
```

`prevPost`/`nextPost` are the previous/next post by publish date (`null` if there isn't one), and `relatedPosts` are up to `RELATED_POSTS_LIMIT` posts sharing at least one tag (empty array if the post has no tags or there are no matches). All three come from the already-cached index — they add no extra Drive call to `getPost()`.

If the post has `draft: true`, `getPost()` returns `{ success: false, error: ... }` instead of the content — the frontend shouldn't be able to reach a draft even by guessing the direct URL.

## RSS feed and sitemap

Both are built in memory from the same cached index `?action=index` uses (no extra Drive cost), and need `SITE_CONFIG` set in `config.js` — this backend has no way of knowing what domain your frontend lives on, so you have to tell it (`URL`, `TITLE`, `DESCRIPTION`). Unconfigured, the links come out as the literal placeholder.

```
GET ?action=rss       → XML, Content-Type application/rss+xml
GET ?action=sitemap   → XML, Content-Type application/xml
```

Each post links to `{SITE_CONFIG.URL}/blog/{slug}` — if your frontend uses a different route structure, adjust `buildPostUrl_()` in `feeds.js`.

## Client-side search

There's no search endpoint in this backend, on purpose: with the full index already in memory on the frontend (what `?action=index` returns), filtering that array in JavaScript is enough — no round trip to the server, no latency, no new code here. For example, filter by `title`/`description`/`tags` with `.filter()` over the array you already have. If the blog grows enough that this stops being enough, that's when a server-side approach is worth evaluating — not before.

## Content images (`?action=images&slug=...`)

How images get referenced when writing a post is explained in "How to set up a post's folder" above. This section covers the backend side: each post can have a variable number of images referenced from inside its `index.md` (e.g. `![image 1](image-1.png)`), and since Drive isn't a static file server, those references don't resolve on their own — filenames need to be translated into usable URLs.

**Don't use Drive's "Share" link** (`drive.google.com/file/d/{id}/view?usp=sharing`) anywhere — that's Drive's HTML viewer page, it never works inside an `<img>`. This endpoint already resolves to the correct format for you.

```
GET ?action=images&slug=my-first-post
```

```json
{
  "success": true,
  "slug": "my-first-post",
  "images": {
    "image-1.png": "https://drive.google.com/thumbnail?id=...&sz=w2000",
    "image-2.png": "https://drive.google.com/thumbnail?id=...&sz=w2000",
    "portada.png": "https://drive.google.com/thumbnail?id=...&sz=w2000"
  }
}
```

The consumer (Astro, or any other frontend) uses this map to swap each markdown `src` for the real URL when rendering the post — for example, by overriding the image renderer of whatever markdown library you use. The post's author never needs to know any of this: they just keep writing `![alt](filename.png)` as-is, no paths or URLs.

## CORS: calling this backend from the browser

This backend exposes everything over `GET` with parameters in the URL (`?action=...`), never `POST` or custom headers — that matters for CORS: the browser only fires a preflight (`OPTIONS`) when a request stops being "simple," and a `GET` with no custom headers always is. In practice, this means any frontend (Astro, React, whatever) can call the Web App's `/exec` URL directly from any origin, with zero CORS configuration in `doGet.js` or Apps Script. Tested end-to-end against a real frontend running on a different origin (`localhost`) — no errors.

If you ever add an endpoint that takes `POST` (comments, for example), this stops applying: a real preflight comes into play, and `doOptions()` on Apps Script Web Apps isn't reliable — that would need separate investigation, don't assume it behaves the same as `GET`.

## Installation

Two ways to get the code up there: manual copy-paste in the online editor, or with `clasp` (the official Apps Script CLI) if you'd rather have this in a real repo and deploy with one command.

1. **Create the project**: on [script.google.com](https://script.google.com), create a new project and paste in the 10 `.js` files as-is (they're `.js` in this repo just so the editor syntax-highlights them — Apps Script doesn't care about the extension when you name a file there), plus `appsscript.json` (⚙️ Project Settings → "Show appsscript.json manifest file").

   **Alternative with `clasp`** (recommended if you're going to keep iterating on this): skips the copy-paste and the risk of a file silently going stale in the online editor.
   ```bash
   npm install                          # installs clasp as a devDependency
   npm run login                        # once, opens the browser to authenticate
   npm run create                       # creates a new Apps Script project and links it here
   # (if you already have an Apps Script project and want to connect to it instead of creating one:
   #  npx clasp clone <SCRIPT_ID> — find it under ⚙️ Project Settings, in the editor)
   npm run push                         # uploads this code to the project
   ```
   `appsscript.json` (included in this repo) already has the Drive API enabled as an advanced service (`enabledAdvancedServices`) and the Web App config (`webapp.access`/`executeAs`), so `clasp push` leaves everything ready with no extra manual steps in the editor. From then on, any change is `npm run push` instead of copy-pasting file by file.

   **Before your first `push`**: enable the Apps Script API for your account at [script.google.com/home/usersettings](https://script.google.com/home/usersettings) (an account-level switch, not project-level — without this, `clasp push` fails with "User has not enabled the Apps Script API"). One-time step, can take a couple minutes to propagate.

2. **Enable the Google Drive API** (once, free, no card required):
   - In the editor → left panel **Services** → **+** ("Add a service")
   - Pick **Google Drive API** → **Add**
   - This enables both the `Drive.*` object and the REST calls this project uses (`UrlFetchApp` against `googleapis.com/drive/v3/...`). Never asks for billing — in fact, the Cloud project Apps Script creates by default doesn't even have a billing screen to reach.

3. **Set the root folder**: in `config.js`, replace:
   ```js
   const ROOT_FOLDER_ID = 'PUT_YOUR_FOLDER_ID_HERE';
   ```
   with your root Drive folder's real ID (the string in the folder's URL). While you're there, `config.js` is also where pagination and filtering get toggled (see below), and where `SITE_CONFIG` goes (your blog's URL/title/description) if you're going to use the RSS feed or sitemap.

4. **Authorize**: run any function once from the editor (e.g. `runLatencyComparison`) and accept the permissions — they're requested on their own (Drive + external requests + triggers), nothing else to configure.

5. **Run the benchmark**: pick `runLatencyComparison` from the function dropdown → Run → check View > Execution log (Ctrl+Enter).

6. **Install the cache trigger**: pick `setupIndexRefreshTrigger` from the dropdown → Run (once). See "Index cache" above.

7. **Deploy as a Web App**: Deploy → New deployment → Web app → execute as "Me", access as needed. Test `<url>?action=index`.

## Authentication (or the lack of it)

This backend has no authentication layer at all: the Web App is deployed with `ANYONE_ANONYMOUS` access (see `appsscript.json`), so anyone with the `/exec` URL can call any `?action=` with no login, no API key. That's a design decision, not an oversight — it makes sense for content that's already meant to be public (a blog).

What this does protect against:
- Posts with `draft: true` are blocked server-side, even when requested by direct slug — they never rely on "not being listed" to stay hidden (see `getPost.js`).
- The `slug` parameter is validated against a fixed pattern (`^[a-z0-9-]+$`, the same format already recommended when setting up a post's folder) before it's used in any Drive query. Without this, a manipulated slug (with quotes, say) could try to escape the search outside the blog's root folder — the script runs with the Drive permissions of whoever deployed it (`executeAs: USER_DEPLOYING`), so validating input here genuinely matters, it's not just tidiness.
- The script's OAuth token only has the scopes it explicitly requested (Drive, `UrlFetchApp`, triggers) — never Gmail or anything outside that. Even in the worst-case abuse of a query, this could never touch your email or your Google account: that depends on your account's own authentication, a completely separate system.

What this does NOT protect against, and what that means if you adapt this project:
- No rate limiting — Apps Script's free-tier quotas act as a ceiling (see "Free-tier limits" below), but that's not real protection against abuse.
- No way to restrict content to logged-in users. If your use case needs that, you'll need to add it separately (for example, comparing a header token against a value stored in `PropertiesService`) — it's not included here.

## Free-tier limits

There's no way for this project to generate a charge on your account, even under heavy traffic:

| Limit | Value |
|---|---|
| Google Drive API — quota units/day | 400,000,000 (free) |
| `UrlFetchApp` — calls/day (personal account) | 20,000 |
| `UrlFetchApp` — calls/day (Workspace) | 100,000 |
| Response size per call | 50 MB |

Sources: [Drive API limits](https://developers.google.com/workspace/drive/api/guides/limits), [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas).

## Performance

Measured with 20 posts:

| Approach | Time |
|---|---|
| Sequential (`DriveApp`, file by file) — `runLatencyComparison()` | ~11,500 ms |
| Parallel (this project, two-phase `fetchAll`) — `runLatencyComparison()` | ~1,300 ms |
| **Improvement vs. sequential** | **~88%** |
| Full index rebuild — `runCacheLatencyTest()` | ~2,360 ms |
| Index served from warm cache — `runCacheLatencyTest()` | ~55 ms |
| **Improvement vs. rebuilding on every visit** | **~98%** |

Both numbers stack in practice: the 10-minute trigger pays the rebuild cost in the background, so almost no real visitor ever pays the ~1,300 ms — most get the ~55 ms cached response.

## Where this approach stops being enough

- **`fetchAll` reliably supports up to ~200 URLs per call.** With hundreds of posts, `buildIndexFresh_()` would need to chunk the reads, which reintroduces some sequentiality between chunks — but since that rebuild already runs in the background (trigger) and not in a real visitor's path, the impact is much smaller than before caching existed.
- **`CacheService` has a 100 KB limit per cached value.** With very large blogs (hundreds of posts with long descriptions) the serialized index could exceed that — `setIndexCache_()` already handles that case without breaking the site (logs and keeps serving live), but at that point it's worth paginating the index (see roadmap) instead of caching one giant blob.
- **`imgUrl` uses Drive's public thumbnail endpoint** (`drive.google.com/thumbnail?id=...&sz=w2000`), which requires files to have "Anyone with the link" permission and isn't an officially supported endpoint — fine for a personal blog, not ideal for high traffic. Curious why the "classic" `uc?export=view` hotlink isn't used instead (Chrome blocks it via CORB as of mid-2026)? The comment on `buildDriveImageUrl()` in `buildIndex.js` explains it.

## Other versions

This is the raw version, no frontend, meant to plug into any site of your own. A version with an Astro frontend already integrated is planned as a separate project.

## License

[MIT](./LICENSE) — use it, modify it, adapt it to your project freely.

## Changelog

Every version's changes are in [`CHANGELOG.md`](./CHANGELOG.md).
