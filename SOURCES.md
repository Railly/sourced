# Sources & provenance

Sourced never asks the model for a clinical fact. Every interaction, adverse-effect, severity, and monitoring claim in a report is retrieved from one of the structured sources below and rendered with its citation. This document records what each source is authoritative for, and its honest limitations.

## openFDA Drug Label API (Structured Product Labeling)

- **URL:** https://api.fda.gov/drug/label.json
- **Authoritative for:** FDA-approved label text covering drug-interaction mechanisms, boxed warnings, and contraindications. This is the primary source and the anti-hallucination backbone.
- **How we retrieve it:** each medication query considers up to 20 matching records, ranks exact generic-name matches with interaction content, then selects the most recent effective label rather than trusting the API's first result. Responses are cached locally for seven days by exact query URL and can be forcibly refreshed.
- **How we cite it:** each claim quotes a specific label field (`drug_interactions`, `boxed_warning`) verbatim, records the SPL effective date and version, highlights a short exact supporting passage, and links the SPL `set_id` on DailyMed.
- **Limitations:** labels describe the drug in general; they do not encode patient-specific severity. Applying a general statement to a specific drug pair requires the pair to be named in the label (our reviewer enforces this; a general "CYP2C9 inhibitors" statement does not license a claim about a specific drug unless that drug is listed).

## DDInter (v1 public ATC download bundle)

- **Dataset paper:** https://pmc.ncbi.nlm.nih.gov/articles/PMC8728114/
- **Authoritative for:** structured drug-pair interaction **severity** (Major / Moderate / Minor / Unknown), which the FDA label does not provide in a normalized field.
- **License:** CC BY-NC-SA 4.0 (non-commercial). Used as a local snapshot (`data/sources/ddinter/`). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- **Coverage:** all eight public ATC files are bundled. The current manifest records 222,383 source rows, 160,235 unique unordered drug pairs, and 1,939 normalized drug names. Run `bun run data:health` to re-check every SHA-256 hash and count.
- **Integrity manifest:** `data/sources/ddinter/manifest.json` records the source URL, terms, retrieval date, file sizes, hashes, severity counts, and deduplicated coverage.
- **Limitations:** the bulk CSV carries the severity level only, not mechanism or management text; we take mechanism from the FDA label, not DDInter. "Unknown" pairs are not asserted as safe; they are simply not flagged. The original DDInter host presented an expired TLS certificate when this snapshot was retrieved, so every official file is pinned by SHA-256 and judge-facing citations resolve to the open-access paper while the audit ledger preserves the exact local file and CSV row identity.

## openFDA FAERS (Adverse Event Reporting System)

- **URL:** https://api.fda.gov/drug/event.json
- **Authoritative for:** a real-world **signal** based on how often an adverse event is co-reported with a drug.
- **Limitations, stated explicitly in output:** FAERS is spontaneous-report data. A co-report count is a signal, **not causation** and not an incidence rate. We label it as such in every finding that uses it and never derive a severity or a monitoring instruction from it.

## RxNorm / RxNav

- **URL:** https://lhncbc.nlm.nih.gov/RxNav/
- **Role:** normalization only. It maps messy free-text drug names (Spanish generics, brand names, typos) to a canonical RxCUI so downstream lookups join cleanly.
- **Limitations:** we use it strictly for name resolution. RxNav's own drug-drug-interaction API was discontinued in January 2024 and is **not** used. Names that do not resolve fail loudly (`rxcui: null`) and are surfaced, never guessed.

## PMC Open Access case corpus

- **Role:** real, de-identified source documents for intake, chronology, ambiguity, normalization, and browser E2E validation.
- **Coverage:** 12 PDFs across 10 medication-safety domains. The canonical list is `data/case-reports/manifest.json`.
- **License policy:** only articles whose NCBI OA service returns `CC BY` or `CC BY-NC-SA` are included.
- **Build evidence:** `data/case-reports/licenses/` preserves the exact OA response for every article. `data/case-reports/build.json` pins the license-response hash, extracted-section hash, PDF hash, byte size, and character count. Tests recompute hashes and require the public gallery PDF to be byte-identical.
- **Transformation:** the named case section is extracted mechanically and rendered to a standalone PDF with the article, PMC ID, PMID, source URL, license, and license-evidence URL. No clinical fact is added.
- **Limitations:** these are stress-test documents, not ground truth for every possible generated finding. Five cases have exact qualifying E2E pair expectations. Seven broaden intake coverage for chronology, combination brands, QT polypharmacy, anticholinergic burden, allergy, pregnancy, hidden ingredients, and indirect exposure.

## What the model does and does not do

- **Does:** rank findings by severity for this patient, deduplicate, and write patient-contextualized reasoning (`why_this_patient`) and clinician questions using only the evidence it was handed.
- **Does not:** supply any interaction, adverse-effect, severity, dose, or monitoring fact. A second reviewer pass rejects any assertion that the cited source text does not support.

## Not a diagnosis tool

Output is a review packet for a licensed clinician or pharmacist. It does not diagnose or prescribe. The demo patient is synthetic and contains no PHI. Independent pharmacist review is scheduled before submission; the repository records its current status and eventual outcome in [VALIDATION.md](VALIDATION.md).

## Project-framing sources

- **WHO Medication Without Harm policy brief:** harm due to medicines and therapeutic options accounts for nearly half of preventable harm in medical care. https://www.who.int/publications/i/item/9789240062764
- **WHO Medication safety in transitions of care:** medication discrepancies affect almost every patient moving across care settings, including hospital discharge, and WHO calls for sustained action to reduce transition-related medication harm. https://www.who.int/publications-detail-redirect/WHO-UHC-SDS-2019.9
