# Sourced E2E and Soak Target

## Success target

Sourced is connected only when a real browser can start from the empty state, select or upload a published PDF, receive a source-derived editable packet, resolve every required clarification, confirm the packet, observe each pipeline stage, and finish with a verified report whose rendered findings all resolve to cited evidence.

The eight-hour soak starts only after every full-qualified case passes one complete live browser run and every intake-qualified case passes a live extraction run.

## Published case corpus

The authoritative corpus is `data/case-reports/manifest.json`.

Every included case must satisfy all of these conditions:

1. It is a published patient case, not a synthetic fixture.
2. Its PMCID resolves to a PMC article.
3. The PMC Open Access service reports an explicit `CC BY` or `CC BY-NC-SA` license.
4. The PDF is generated from a mechanically extracted case section with the source, PMCID, PMID, and license embedded.
5. The excerpt has a SHA-256 digest and no clinical facts are added during dataset construction.
6. The web gallery exposes the exact same PDFs.
7. `qualification_mode` is `full` for cases that must complete a live review during the soak and `intake` for exploratory cases that must complete source extraction. Missing `qualification_mode` defaults to `full`.
8. `expected_active_medications`, `forbidden_active_medications`, `expected_surviving_pairs`, and `forbidden_pairs` are explicit machine-checkable oracle fields.

## Browser gates for every case

1. `https://source.localhost/` loads with the expected title and no framework overlay.
2. No visible `Eve.dev`, `json-render`, or third-party implementation branding appears.
3. The published case gallery lists the exact licensed corpus declared in the manifest.
4. The selected PDF returns HTTP 200 and begins with `%PDF-`.
5. Loading the PDF sends a real `/api/intake` request and reaches the source-derived packet.
6. The extracted medication inputs contain every `expected_active_medications` token and no `forbidden_active_medications` token, or the run fails.
7. If the source contains multiple patient cases, Sourced must scope to one labeled case and ask for confirmation. Silent cross-patient merging fails.
8. Every clarification without a configured answer uses the explicit `Keep unknown` action. The unresolved response remains in the audit history but is not injected into clinical context as a patient fact.
9. `Confirm packet` becomes enabled only after clarifications are resolved.
10. The review emits visible ingest, retrieve, synthesize, and verify progress before completion.
11. Every `expected_surviving_pairs` pair appears together in one canonical report finding, and no `forbidden_pairs` pair appears in any finding.
12. Every finding exposes valid canonical drug JSON, declares at least one citation, renders the same number of citations it declares, and the rendered finding count equals the canonical report count.
13. The final report contains the reviewer publication state, a questions section when questions exist, and zero unresolved evidence references.
14. Smoke, intake, and full modes audit console errors, unhandled rejections, HTTP 5xx responses, expected API requests, stalled loading states, and document-level overflow.

## Edge cases

- Combination medication names must preserve their explicit components.
- Brand and ingredient duplicates must not become two independent drugs.
- A multi-patient article must not be flattened into one patient without a scope clarification.
- Unknown interaction pairs may yield no finding; inventing a finding fails.
- A case with no resolvable evidence must fail closed rather than publish unsupported copy.
- Empty, non-PDF, oversized, and malformed uploads must return a visible bounded error.
- Voice transcription may populate the composer but must never submit automatically.
- Mobile view uses Review and Clinical canvas panes without document-level overflow.
- Restarting the development server with stale workflow state must not replay incompatible runs into the active soak.

## Partial progress does not count

None of these are accepted as completion:

- Passing TypeScript, unit tests, or a production build without browser evidence.
- Testing only the synthetic demo.
- Testing one published PDF and extrapolating to the rest.
- Rendering a cached report without a live intake and live review request.
- Seeing the final report without proving intermediate streamed stages.
- Accepting medication extraction that misses a declared expected token.
- Calling a freely readable article redistributable without PMC Open Access license evidence.
- Repeating one easy case for eight hours instead of rotating the corpus.
- A soak shorter than eight elapsed hours.
- A process that stayed alive while its checks stopped executing.
- A green summary that omits failed iterations, retries, HTTP errors, or console errors.

## Soak schedule

- Minimum elapsed duration: 8 hours measured from persisted UTC timestamps.
- Every 10 minutes: page identity, empty state, gallery count, PDF availability, console and page errors, document overflow.
- Every 30 minutes: rotate to the next published PDF and run live intake extraction.
- Every 60 minutes: continue the current case through clarifications and a complete verified review.
- Every cycle appends a JSONL event. Existing evidence is never rewritten or deleted.
- Every soak has one `soakId` and one SHA-256 code fingerprint. Browser evidence from another soak or another fingerprint never counts.
- Any code or manifest change invalidates the active soak. Start the final soak only after freezing the candidate.
- Smoke, intake, and full children have hard deadlines. A timeout is a failed check and cannot stall the scheduler indefinitely.
- Heartbeats run independently while a child check is active and record whether a check is in flight.
- Checks scheduled exactly at the eight-hour boundary are included and must finish before the final status is calculated.
- Full-review completeness applies only to cases whose `qualification_mode` is `full`. Intake cases still rotate through smoke and intake checks.
- Final status passes only when elapsed time is at least eight hours, every full-qualified case has a successful full run inside the same soak and fingerprint, and no check failed.
