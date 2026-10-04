# Public study resources and scanner notes

## Public feature directory

`/features` is available without sign-in and is linked from the landing page. It lists **35 student-facing feature areas**, including Scan & notes, the Kenya Law case finder and the directory itself. The directory supports search, category and availability filters, and expandable explanations covering purpose, steps, access and current limitations. Keep `src/data/featureCatalog.ts` synchronized with product changes; do not describe partial or unconfigured features as fully working.

## Kenya Law case finder

`/cases` is public and available without an account. It sends case-name, citation and topic searches to Kenya Law's official judgments search and links to the court-specific collections. The page also links directly to the [official Constitution of Kenya](https://kenyalaw.org/akn/ke/act/2010/constitution). It does not copy or locally index judgments.

The AI guidance treats Article 2 of the Constitution as the hierarchy baseline and does not cite cases or exact provisions from model memory. For case-specific AI analysis, students save the full judgment text or PDF as an AI-readable Library document and select it; a linked Library record alone is metadata, not source text. When case text is absent, research tools suggest neutral search phrases and the assistant directs the student to the official case finder rather than guessing.

Kenya Law's [Tausi API documentation](https://tausi-dev.docs.laws.africa/api.html) describes an authenticated read-only API that requires an API token and a dedicated permission. The documentation marks the full search specification as unfinished. The current implementation therefore uses Kenya Law's public search links and does not scrape the case database or claim to provide live API retrieval. Automated in-app case search requires an authorized production API route and credentials.

## Scan & notes

`/scanner` is an authenticated workspace feature. A signed-out visitor who opens it is routed to sign-in. OCR runs locally in the browser with Tesseract.js/WebAssembly; the language choices are English (`eng`), Kiswahili (`swa`), or both. On first use the browser may download and cache its OCR worker and language data. The scanner accepts image files, not PDFs; users can use the existing Library/Reader workflow for PDFs.

| Limit | Value |
|---|---:|
| Page images per note | 10 |
| Maximum size per image | 12 MiB |
| Combined image size | 60 MiB |

The recognized text can be edited before saving. The app stores note text in the owner-protected `public.notes` table and original images in the private `media` bucket under the signed-in user's storage path. Each image record uses the media-asset schema and scanner metadata. Migration `005-private-scanner-notes.sql` establishes the notes-table contract and owner-only access for a clean deployment; the active LLB13 project already had a compatible notes table. Migration `006-private-media-search-path.sql` pins the trigger-function search paths. The scanner uses the existing media bucket and requires the app's normal database configuration.

Share uses the device's native share sheet when available, or copies **note text** to the clipboard. It does not create a public link; original scan images remain private. Print / Save as PDF opens the browser print dialog with the note text and available page previews. Deleting a scan note requires confirmation and removes its private page images and note record. OCR can misread names, legal citations, section numbers, handwriting or low-quality photographs, so users should compare the text with the original page.

## Verification

```sh
npm run check
npm run build
```

The scanner, public guide and public case finder routes are lazy-loaded so the dashboard's initial JavaScript stays below the existing 500 kB warning threshold.
