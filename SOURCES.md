# Sources & provenance

Sourced never asks the model for a clinical fact. Every interaction, adverse-effect, severity, and monitoring claim in a report is retrieved from one of the structured sources below and rendered with its citation. This document records what each source is authoritative for, and its honest limitations.

## openFDA Drug Label API (Structured Product Labeling)

- **URL:** https://api.fda.gov/drug/label.json
- **Authoritative for:** FDA-approved label text covering drug-interaction mechanisms, boxed warnings, and contraindications. This is the primary source and the anti-hallucination backbone.
- **How we cite it:** each claim quotes a specific label field (`drug_interactions`, `boxed_warning`) verbatim and links the SPL `set_id` on DailyMed, so a reviewer reads the exact source text.
- **Limitations:** labels describe the drug in general; they do not encode patient-specific severity. Applying a general statement to a specific drug pair requires the pair to be named in the label (our reviewer enforces this; a general "CYP2C9 inhibitors" statement does not license a claim about a specific drug unless that drug is listed).

## DDInter (v1 bulk release)

- **Dataset paper:** https://pmc.ncbi.nlm.nih.gov/articles/PMC8728114/
- **Authoritative for:** structured drug-pair interaction **severity** (Major / Moderate / Minor / Unknown), which the FDA label does not provide in a normalized field.
- **License:** CC BY-NC 4.0 (non-commercial; cited here). Used as a local snapshot (`data/sources/`).
- **Limitations:** the bulk CSV carries the severity level only, not mechanism or management text; we take mechanism from the FDA label, not DDInter. "Unknown" pairs are not asserted as safe; they are simply not flagged. The original DDInter host currently presents an expired TLS certificate, so judge-facing citations resolve to the open-access paper while the audit ledger preserves the exact local CSV row identity.

## openFDA FAERS (Adverse Event Reporting System)

- **URL:** https://api.fda.gov/drug/event.json
- **Authoritative for:** a real-world **signal** based on how often an adverse event is co-reported with a drug.
- **Limitations, stated explicitly in output:** FAERS is spontaneous-report data. A co-report count is a signal, **not causation** and not an incidence rate. We label it as such in every finding that uses it and never derive a severity or a monitoring instruction from it.

## RxNorm / RxNav

- **URL:** https://lhncbc.nlm.nih.gov/RxNav/
- **Role:** normalization only. It maps messy free-text drug names (Spanish generics, brand names, typos) to a canonical RxCUI so downstream lookups join cleanly.
- **Limitations:** we use it strictly for name resolution. RxNav's own drug-drug-interaction API was discontinued in January 2024 and is **not** used. Names that do not resolve fail loudly (`rxcui: null`) and are surfaced, never guessed.

## What the model does and does not do

- **Does:** rank findings by severity for this patient, deduplicate, and write patient-contextualized reasoning (`why_this_patient`) and clinician questions using only the evidence it was handed.
- **Does not:** supply any interaction, adverse-effect, severity, dose, or monitoring fact. A second reviewer pass rejects any assertion that the cited source text does not support.

## Not a diagnosis tool

Output is a review packet for a licensed clinician or pharmacist. It does not diagnose or prescribe. The demo patient is synthetic and contains no PHI. Independent pharmacist review is scheduled before submission; the repository records its current status and eventual outcome in [VALIDATION.md](VALIDATION.md).

## Project-framing sources

- **WHO Medication Without Harm policy brief:** harm due to medicines and therapeutic options accounts for nearly half of preventable harm in medical care. https://www.who.int/publications/i/item/9789240062764
- **WHO Medication safety in transitions of care:** medication discrepancies affect almost every patient moving across care settings, including hospital discharge, and WHO calls for sustained action to reduce transition-related medication harm. https://www.who.int/publications-detail-redirect/WHO-UHC-SDS-2019.9
