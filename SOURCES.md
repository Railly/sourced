# Sources & provenance

Sourced never asks the model for a clinical fact. Every interaction, adverse-effect, severity, and monitoring claim in a report is retrieved from one of the structured sources below and rendered with its citation. This document records what each source is authoritative for, and its honest limitations.

## openFDA Drug Label API (Structured Product Labeling)

- **URL:** https://api.fda.gov/drug/label.json
- **Authoritative for:** drug-interaction mechanisms, boxed warnings, contraindications — the FDA-approved label text. This is the primary source and the anti-hallucination backbone.
- **How we cite it:** each claim quotes a specific label field (`drug_interactions`, `boxed_warning`) verbatim and links the SPL `set_id` on DailyMed, so a reviewer reads the exact source text.
- **Limitations:** labels describe the drug in general; they do not encode patient-specific severity. Applying a general statement to a specific drug pair requires the pair to be named in the label (our reviewer enforces this — a general "CYP2C9 inhibitors" statement does not license a claim about a specific drug unless that drug is listed).

## DDInter (v1 bulk release)

- **URL:** https://ddinter.scbdd.com/
- **Authoritative for:** drug-pair interaction **severity** (Major / Moderate / Minor / Unknown) — what the FDA label does not give in structured form.
- **License:** CC BY-NC 4.0 (non-commercial; cited here). Used as a local snapshot (`data/sources/`).
- **Limitations:** the bulk CSV carries the severity level only, not mechanism or management text — we take mechanism from the FDA label, not DDInter. "Unknown" pairs are not asserted as safe; they are simply not flagged.

## openFDA FAERS (Adverse Event Reporting System)

- **URL:** https://api.fda.gov/drug/event.json
- **Authoritative for:** real-world **signal** — how often an adverse event is co-reported with a drug.
- **Limitations, stated explicitly in output:** FAERS is spontaneous-report data. A co-report count is a signal, **not causation** and not an incidence rate. We label it as such in every finding that uses it and never derive a severity or a monitoring instruction from it.

## RxNorm / RxNav

- **URL:** https://lhncbc.nlm.nih.gov/RxNav/
- **Role:** normalization only — maps messy free-text drug names (Spanish generics, brand names, typos) to a canonical RxCUI so downstream lookups join cleanly.
- **Limitations:** we use it strictly for name resolution. RxNav's own drug-drug-interaction API was discontinued in January 2024 and is **not** used. Names that do not resolve fail loudly (`rxcui: null`) and are surfaced, never guessed.

## What the model does and does not do

- **Does:** rank findings by severity for this patient, deduplicate, and write the patient-contextualized reasoning (`why_this_patient`) and clinician questions — over evidence it was handed.
- **Does not:** supply any interaction, adverse-effect, severity, dose, or monitoring fact. A second reviewer pass rejects any assertion that the cited source text does not support.

## Not a diagnosis tool

Output is a review packet for a licensed clinician or pharmacist. It does not diagnose or prescribe. The demo patient is synthetic (no PHI), reviewed by a licensed pharmacist for plausibility.
