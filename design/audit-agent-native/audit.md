# Agent-native flow audit

## Audit scope

Current Sourced path from starting a medication review to using the Eve-powered adaptive lens. Evidence was captured from `https://source.localhost/` on July 10, 2026.

## User goal and accessibility target

Turn an unstructured patient packet into a source-backed medication-safety review with the least possible manual structuring, then let the clinician progressively inspect verified artifacts. The path should remain understandable by keyboard and assistive technology while long-running stages stream updates.

## Captured steps

1. `01-prepopulated-report.png`: New review form, poor health. The first state is already populated and exposes the entire schema at once.
2. `02-report-overview.png`: Published report overview, healthy as a final artifact but incorrect as the default product state.
3. `03-adaptive-review-lens.png`: Eve lens, technically functional but unhealthy in hierarchy because it appears after a complete static report and repeats the same findings.

## Strengths

- The visual language is calm, clinical, and internally consistent.
- Verification and source provenance are explicit.
- The final report exposes evidence without relying on model memory.
- Existing controls have semantic labels and clear focusable actions.

## UX risks

- The empty state does not exist. A first-time user sees either synthetic data or a full schema-heavy form.
- The form asks the clinician to manually duplicate work already present in notes, PDFs, or dictation.
- The synthetic case looks like default product data instead of an optional demo.
- Eve is introduced after the workflow rather than owning intake and orchestration.
- The adaptive lens duplicates the static findings instead of becoming the primary progressive workspace.
- Five navigation sections and a long document appear before the user has expressed an information need.
- Pipeline metrics, report metadata, verification, findings, comparison, and questions compete at the same hierarchy level.

## Accessibility risks

- A long form with repeated medication and lab fields creates excessive keyboard traversal.
- Streaming state will need `aria-live` boundaries that announce meaningful stage changes without reading every token.
- Voice capture needs an explicit recording state, duration, cancel action, and editable transcript before submission.
- File parsing and extraction errors need to be associated with the originating attachment and recoverable without restarting.

## Opportunity areas

- Start with one centered clinical prompt and a multimodal composer.
- Accept text, PDF, and voice as equivalent inputs into the same draft packet.
- Let Eve interview only for missing or ambiguous fields.
- Stream a compact structured-packet preview beside or above the composer.
- Require one explicit confirmation before the clinical pipeline starts.
- Reveal verification and findings as json-render components become available.
- Keep evidence, pairwise comparison, handoff, and questions as contextual actions on the current artifact.
- Move the synthetic golden case into a floating demo action that never resembles user data.

## Evidence limits

The screenshots prove hierarchy, default-state, and visible interaction problems. They do not prove screen-reader behavior, PDF parsing reliability, voice transcription accuracy, or streaming announcements. Those require implementation-level tests.

## Recommendation

Replace the current dashboard-first flow with a single agent workspace:

`empty composer → source ingestion → Eve clarification → structured packet confirmation → verified pipeline → progressively streamed GenUI → contextual quick actions`

