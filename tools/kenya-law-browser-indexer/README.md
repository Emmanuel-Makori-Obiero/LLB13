# Free Kenya Law browser indexer

This is the no-cost fallback when a Tausi API token is unavailable. It uses a normal local Chromium session to search public Kenya Law pages, records **metadata and official judgment URLs**, and writes a local JSON cache.

## Install

From the LLB13 repository:

```bash
cd tools/kenya-law-browser-indexer
npm install
npx playwright install chromium
```

## Search

```bash
node index.mjs --query Gachagua
node index.mjs --query contract --query negligence
```

The cache is written to `data/kenya-law-index.json` by default. You can choose another destination:

```bash
node index.mjs --query "Katiba Institute" --output ../../public/kenya-law-index.json
```

Use `--headed` if you want to watch the browser:

```bash
node index.mjs --headed --query Gachagua
```

## Boundaries

- It uses only public pages and official `kenyalaw.org` judgment links.
- It waits between searches and stops on CAPTCHA, login, robot checks, or access-denied pages.
- It does not bypass protections, rotate IPs, evade rate limits, or download the entire database.
- Before bulk indexing or redistributing full judgment text, obtain written permission from Kenya Law. The default cache stores metadata and official links only.

The cache can be placed in the website's public assets for a static deployment, or uploaded by a future authenticated sync job. Full live multi-user search still requires either a Tausi token or a permitted shared index service; a local browser cache is the free route and depends on the computer being online when it refreshes.
