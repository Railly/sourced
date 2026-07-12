# Sourced

Medication safety review, backed by cited sources, never by model recall.

[![CI](https://github.com/Railly/sourced/actions/workflows/ci.yml/badge.svg)](https://github.com/Railly/sourced/actions/workflows/ci.yml)

## What it is

Sourced is a medication-safety review tool for clinicians and pharmacists. Give it a de-identified patient context (clinical note, meds, allergies, diagnoses, labs) and it returns a ranked, source-backed review of medication risks. It does not diagnose or prescribe.

## The one idea

We never ask the model for a clinical fact. Every interaction, severity, and mechanism in a Sourced report is derived from cited sources and re-checked. Anything that cannot be traced back to a source is refused, not guessed.

A second, adversarial verifier agent runs after synthesis and strips out any claim it cannot trace to a source object.

When Sourced hits the edge of what it can resolve from cited sources (a drug pair the database documents without a graded severity, or a flagged concern it cannot trace) it does not just drop it. It generates a precise research brief and routes it to Claude Science, Anthropic's AI workbench for scientists, opening a real research session backed by 60+ scientific databases. Sourced finds the boundary of its own knowledge. Claude Science crosses it.

Refuse to assert is defensive. Refuse, then route to research, is generative.

## Data layer

- **DDInter 2.0** — 222,383 interaction rows, 160,235 unique pairs, 1,939 drugs. Drug-drug interaction severity.
- **openFDA drug labels** — FDA-authoritative mechanism text and boxed warnings.
- **openFDA FAERS** — real-world adverse-event co-report signal.
- **RxNorm / RxNav** — drug name normalization, including Spanish to English.
- **12 real de-identified case reports** — sourced from PMC Open Access (Creative Commons).

## How it works

Four stages, each with a distinct role:

1. **Ingest** — normalize medications to RxCUI. Unresolved drug names fail loud. Sourced never hallucinates a drug identity.
2. **Deterministic retrieval** — pull DDInter severity, openFDA labels, and FAERS signal for every pair. Each result is a cited evidence object. Zero LLM involvement.
3. **Mechanism enrichment** — a model reads the retrieved FDA labels and names the real pharmacology behind each interaction (CYP450 inhibitor/substrate raising exposure, additive QT/torsades risk, additive anticholinergic burden), quoting the label directly.
4. **Synthesize and verify** — Opus 4.8 ranks and contextualizes findings to this specific patient. A separate adversarial verifier agent then reviews the output and removes any claim it cannot trace back to a source.

## Claude Science integration

Deterministic retrieval and cited mechanism enrichment cover most of a review. They do not cover everything: some drug pairs are documented without a graded severity, and some verifier-flagged concerns cannot be traced to an existing source.

Instead of silently dropping these, Sourced uses Opus to generate a precise, scoped research brief and routes it to Claude Science via its local API. This opens a live research session where a Claude Science agent investigates the gap across 60+ scientific databases. The clinician sees exactly what Sourced could resolve on its own, and exactly what got escalated for deeper research, and why.

## Run it

```bash
bun install && bun test
cd web && bun install && bun dev
```

The showcase (one golden case plus all 12 published cases) runs fully offline, with no API key required. The live "paste your own note" path and the Claude Science routing need an AI gateway key and a local Claude Science daemon respectively.

## What's real vs. synthetic

All patient contexts used in the showcase are synthetic or drawn from published, de-identified, open-access case reports. DDInter, openFDA, and RxNorm are real, current public datasets. Sourced is a research and workflow tool, not a certified clinical decision support device, and is not intended for direct clinical use without appropriate validation and oversight.

## License

MIT. DDInter is redistributed under CC BY-NC 4.0; see `SOURCES.md` and `THIRD_PARTY_NOTICES.md`.
