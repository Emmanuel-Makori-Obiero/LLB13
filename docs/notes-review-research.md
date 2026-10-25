# Notes-review research basis

Checked 25 October 2026 against official product documentation and Kenya Law.

## Product fit

- **Gemini Notebook (NotebookLM)** is the strongest free fit for questions grounded in a student's uploaded notes: its free Standard plan includes 100 notebooks and 50 sources per notebook. It analyzes the supplied source collection; it is not a substitute for primary Kenyan legal sources or a complete current law service. Official limits: https://support.google.com/gemininotebook/answer/16213268?hl=en
- **Perplexity** is useful for cited open-web discovery; its official documentation says answers link numbered citations and free users receive a limited number of Pro Searches per day. Search citations still need to be opened and checked against the actual official judgment or statute. Official description: https://www.perplexity.ai/help-center/en/articles/10352895-how-does-perplexity-work
- **Kenya Law** is the primary source selected for verification in this application. The National Council for Law Reporting describes it as the official source of Law Reports and consolidated Kenyan laws and exposes case law, legislation, and Gazette materials: https://kenyalaw.org/

## Accuracy limit

Do not advertise the review as 100% accurate. Stanford Law School's 2025 empirical evaluation reported that the tested commercial legal research tools hallucinated more than 17% of the time, even though they performed better than general-purpose GPT-4: https://law.stanford.edu/publications/hallucination-free-assessing-the-reliability-of-leading-ai-legal-research-tools/

## Implementation decision

Use AI to identify legal questions and candidate authorities, query/open official Kenya Law records, then have the AI produce corrected notes with explicit source links and an authority-check status. A citation is only called verified if the official record was opened and readable. Never turn a search-result title alone into proof of a holding, never invent replacement authorities, and show unresolved matters as requiring student or lecturer review. Preserve the uploaded/original notes separately from the corrected editable version. Sharing the corrected notes to the common Library is an explicit student action.
