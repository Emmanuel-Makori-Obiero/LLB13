# Penal Code source and edition

The standalone reader uses the official Kenya Law version of the Penal Code (Cap. 63), with legislation as at 11 December 2023. Kenya Law identifies the Act as assented to on 26 May 1930 and commenced on 1 August 1930. The reader contains all 416 extracted provisions, including lettered provisions and deleted-section entries, along with the 2023 edition front matter and contents. The statute edition is 117 pages and is linked directly from the reader.

The Kenya Law PDF's embedded alphabetical index is incomplete in the distributed 2023 file. To avoid presenting it as complete, the reader's separate convenience index is OCR text from pages 118–153 of the Government of Kenya's official 2014 revision, available [here](https://www.probation.go.ke/sites/default/files/downloads/Penal%20Code%20CAP%2063.pdf). That older index is not part of the Act, may contain OCR errors, and is explicitly labelled separately from the 2023 statute. Refer to the official 2023 text and current Kenya Law record for the wording and status of provisions.

The extraction script is `scripts/build-penal-code-data.py`. To regenerate the checked-in dataset, provide both source PDFs: the Kenya Law 2023 PDF and the government-hosted 2014 PDF. The script uses Poppler and Tesseract to OCR the 36 scanned index pages; a normal app build does not require OCR tools.

Kenya Law states that there is no copyright on legislative content and identifies the 2023 PDF copy as CC BY-NC-SA 4.0. The reader attributes and links to both source records. The original user attachment `PenalCodeCAP63.pdf` was not accessible from the provided local path; its temporary signed URL returned HTTP 403, so the app uses the official Kenya Law 2023 edition rather than claiming a byte-for-byte comparison to the attachment.

Sources: [Kenya Law Penal Code (2023)](https://kenyalaw.org/akn/ke/act/1930/10/eng@2023-12-11) · [Government of Kenya Penal Code PDF (Rev. 2014)](https://www.probation.go.ke/sites/default/files/downloads/Penal%20Code%20CAP%2063.pdf) · [WIPO Lex version metadata](https://www.wipo.int/wipolex/en/legislation/details/23284)
