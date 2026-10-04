# Scanner notes and public feature guide

## Public feature directory

`/features` is available without sign-in and is linked from the landing page header, hero, and final call-to-action. It lists **34 member-facing features**—the audited student-facing tools plus Scan & notes and the directory itself. The directory supports search, category and availability filters, and expandable explanations covering purpose, steps, access, and current limitations. Keep `src/data/featureCatalog.ts` synchronized with product changes; do not describe partial or unconfigured features as fully working.

## Scan & notes

`/scanner` is an authenticated workspace feature. A signed-out visitor who opens it is routed to sign-in. OCR runs locally in the browser with Tesseract.js/WebAssembly; the language choices are English (`eng`), Kiswahili (`swa`), or both. On first use the browser may download and cache its OCR worker and language data. The scanner accepts image files, not PDFs; users can use the existing Library/Reader workflow for PDFs.

| Limit | Value |
|---|---:|
| Page images per note | 10 |
| Maximum size per image | 12 MiB |
| Combined image size | 60 MiB |

The recognized text can be edited before saving. The app stores note text in the owner-protected `public.notes` table and original images in the private `media` bucket under the signed-in user's storage path. Each image record uses the media-asset schema and scanner metadata. Migration `005-private-scanner-notes.sql` establishes the notes-table contract and owner-only access for a clean deployment; the active LLB13 project already had a compatible notes table. Migration `006-private-media-search-path.sql` pins the trigger-function search paths. The scanner uses the existing media bucket and requires the app's normal database configuration.

Share uses the device's native share sheet when available, or copies **note text** to the clipboard. It does not create a public link; original scan images remain private. Print / Save as PDF opens the browser print dialog with the note text and available page previews. Deleting a scan note requires confirmation and removes its private page images and note record. OCR can misread names, legal citations, section numbers, handwriting, or low-quality photographs, so users should compare the text with the original page and authoritative sources.

## Verification

```sh
npm run check
npm run build
```

The scanner adds the `tesseract.js` package. The scanner and public guide routes are lazy-loaded so the dashboard's initial JavaScript stays below the existing 500 kB warning threshold.
