#!/usr/bin/env python3
"""Extract the Kenya Law Penal Code and its complete supplementary index.

Usage: python3 scripts/build-penal-code-data.py /path/to/Penal-Code-Cap-63-2023.pdf /path/to/Penal-Code-Rev-2014.pdf
Requires poppler's pdftotext/pdftoppm commands and Tesseract OCR.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src/data/penal-code-2023.json"
SOURCE_URL = "https://kenyalaw.org/akn/ke/act/1930/10/eng@2023-12-11"
PDF_URL = f"{SOURCE_URL}/source"
INDEX_SOURCE_URL = "https://www.probation.go.ke/sites/default/files/downloads/Penal%20Code%20CAP%2063.pdf"

LIGATURES = str.maketrans({
    "ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st",
})
SECTION_HEADING = re.compile(r"^\s*(\d+[A-Za-z]?)\.\s+(.+?)\s*$")
PART_HEADING = re.compile(r"^Part\s+([IVXLCDM]+)\s*[–—-]\s*(.+)$", re.I)
DIVISION_HEADING = re.compile(r"^Division\s+([IVXLCDM]+)\s*[–—-]\s*(.+)$", re.I)
CHAPTER_HEADING = re.compile(r"^Chapter\s+([IVXLCDM]+)\s*$", re.I)
PAGE_HEADER = re.compile(r"^Penal Code\s*\(Cap\.\s*63\)\s*(?:Kenya)?$", re.I)


def extract_pdf(pdf_path: Path) -> str:
    result = subprocess.run(
        ["pdftotext", "-layout", str(pdf_path), "-"],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.translate(LIGATURES)


def extract_supplementary_index(pdf_path: Path) -> str:
    """OCR the full index in the official 2014 scan; it is not part of the Act."""
    for command in ("pdftoppm", "tesseract"):
        if shutil.which(command) is None:
            raise RuntimeError(f"Required command not found: {command}")
    with tempfile.TemporaryDirectory(prefix="penal-code-index-") as temporary_directory:
        prefix = Path(temporary_directory) / "page"
        subprocess.run(
            ["pdftoppm", "-f", "118", "-l", "153", "-r", "240", "-gray", "-png", str(pdf_path), str(prefix)],
            check=True,
            capture_output=True,
        )
        pages = sorted(
            Path(temporary_directory).glob("page-*.png"),
            key=lambda path: int(re.search(r"-(\d+)\.png$", path.name).group(1)),
        )
        if len(pages) != 36:
            raise ValueError(f"Expected 36 scanned index pages, found {len(pages)}")
        extracted: list[str] = []
        for page in pages:
            result = subprocess.run(
                ["tesseract", str(page), "stdout", "-l", "eng", "--psm", "6"],
                check=True,
                capture_output=True,
                text=True,
            )
            extracted.append(result.stdout)
        return "\n\n".join(extracted)


def clean_text(raw: str) -> str:
    lines: list[str] = []
    for raw_line in raw.replace("\f", "\n").splitlines():
        line = raw_line.strip()
        if not line:
            lines.append("")
            continue
        if PAGE_HEADER.fullmatch(line) or line.casefold() == "kenya" or re.fullmatch(r"\d{1,3}", line):
            continue
        lines.append(line)
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def parse_document(text: str, supplementary_index: str | None = None) -> dict:
    # The body heading is repeated in the contents pages; use the final exact heading
    # before the index, then split at the first index heading after it.
    body_marker = "\n 1. Short title\n"
    body_start = text.rfind(body_marker)
    if body_start < 0:
        raise ValueError("Could not locate section 1 in the extracted Penal Code PDF.")
    body_start += 1
    index_marker = "INDEX – TO THE PENAL CODE"
    index_start = text.find(index_marker, body_start)
    if index_start < 0:
        index_marker = "INDEX - TO THE PENAL CODE"
        index_start = text.find(index_marker, body_start)
    if index_start < 0:
        raise ValueError("Could not locate the Penal Code index in the extracted PDF.")

    body_lines = text[body_start:index_start].splitlines()
    intro_text = clean_text(text[:body_start])
    index_text = clean_text(supplementary_index if supplementary_index is not None else text[index_start:])

    part = "Part I — General Provisions"
    division = ""
    chapter = "Chapter I — Preliminary"
    pending_chapter: str | None = None
    sections: list[dict] = []
    current: dict | None = None
    current_lines: list[str] = []
    seen: set[str] = set()

    def finish_section() -> None:
        nonlocal current, current_lines
        if current is None:
            return
        current["text"] = clean_text("\n".join(current_lines))
        sections.append(current)
        current = None
        current_lines = []

    for raw_line in body_lines:
        line = raw_line.strip()
        if not line:
            if current is not None:
                current_lines.append("")
            continue
        if PAGE_HEADER.fullmatch(line) or line.casefold() == "kenya" or re.fullmatch(r"\d{1,3}", line):
            continue

        part_match = PART_HEADING.match(line)
        if part_match:
            part = f"Part {part_match.group(1).upper()} — {part_match.group(2).strip()}"
            division = ""
            continue
        division_match = DIVISION_HEADING.match(line)
        if division_match:
            division = f"Division {division_match.group(1).upper()} — {division_match.group(2).strip()}"
            continue
        chapter_match = CHAPTER_HEADING.match(line)
        if chapter_match:
            pending_chapter = chapter_match.group(1).upper()
            chapter = f"Chapter {pending_chapter}"
            continue
        if pending_chapter:
            chapter = f"Chapter {pending_chapter} — {line}"
            pending_chapter = None
            continue

        heading = SECTION_HEADING.match(line)
        if heading:
            number, title = heading.group(1), heading.group(2).strip()
            # One PDF line is the continuation of an amendment footnote for section 25,
            # not a second provision. Preserve it as source text in the current section.
            if number in seen and title.casefold().startswith("of ") and current is not None:
                current_lines.append(line)
                continue
            if number in seen:
                raise ValueError(f"Repeated section heading {number}: {title}")
            finish_section()
            seen.add(number)
            current = {
                "id": f"section-{number}",
                "number": number,
                "title": title,
                "part": part,
                "division": division,
                "chapter": chapter,
                "text": "",
            }
            continue

        if current is not None:
            current_lines.append(line)

    finish_section()

    # Guard against an incomplete extraction before writing application data.
    required_numbers = {str(number) for number in range(1, 399)}
    present_numbers = {item["number"] for item in sections}
    missing = sorted(required_numbers - present_numbers, key=int)
    if missing:
        raise ValueError(f"PDF extraction is missing numbered provisions: {', '.join(missing)}")
    if len(sections) < 398:
        raise ValueError(f"Expected at least 398 provisions, found {len(sections)}")
    if not index_text:
        raise ValueError("The PDF's index could not be extracted.")
    if supplementary_index is not None:
        for term in ("ABDUCTION", "BROTHELS", "DANGEROUS", "WARRANTS"):
            if term not in index_text.upper():
                raise ValueError(f"The scanned convenience index is missing expected text: {term}")

    return {
        "title": "Penal Code",
        "citation": "Penal Code (Cap. 63)",
        "edition": "Legislation as at 11 December 2023",
        "assented": "26 May 1930",
        "commenced": "1 August 1930",
        "source": "Kenya Law and Laws.Africa, revised and published by the National Council for Law Reporting",
        "sourceUrl": SOURCE_URL,
        "pdfUrl": PDF_URL,
        "indexEdition": "Convenience index from the official 2014 revision. The index is not part of the Act.",
        "indexSourceUrl": INDEX_SOURCE_URL,
        "license": "There is no copyright on the legislative content. The source PDF identifies its own copy as CC BY-NC-SA 4.0.",
        "frontMatter": intro_text,
        "sections": sections,
        "indexText": index_text,
        "sectionCount": len(sections),
        "pageCount": 117,
    }


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python3 scripts/build-penal-code-data.py /path/to/Penal-Code-Cap-63-2023.pdf /path/to/Penal-Code-Rev-2014.pdf")
    pdf_path = Path(sys.argv[1]).expanduser().resolve()
    index_pdf_path = Path(sys.argv[2]).expanduser().resolve()
    for source_path in (pdf_path, index_pdf_path):
        if not source_path.is_file():
            raise SystemExit(f"PDF not found: {source_path}")
    document = parse_document(extract_pdf(pdf_path), extract_supplementary_index(index_pdf_path))
    OUTPUT.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(f"Wrote {OUTPUT} with {document['sectionCount']} provisions and complete front matter/index.")


if __name__ == "__main__":
    main()
