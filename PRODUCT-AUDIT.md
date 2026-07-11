# Product design audit

Audit date: 2026-07-11

Viewport: 588 × 863 mobile, with desktop E2E screenshots used for the complete report surface.

## Journey health

1. **Start a review: strong.** One dominant question, one composer, a visible privacy gate, and two clearly labeled demo entrances. The de-identification gate now has stronger contrast and a larger target.
2. **Find a real case: strong.** The gallery exposes 12 real PMC OA cases, license, source, safety focus, and full-text link. Search filters by drug, domain, title, or PMC ID. Focus moves into the dialog, stays trapped, and returns to the trigger.
3. **Extract the source: strong.** Mobile switches to the clinical canvas during extraction instead of leaving the review pane blank.
4. **Resolve ambiguity: strong.** One relationship ambiguity now appears as one pair-level callout instead of two warning icons. `Review clarification` moves directly to the single question. `Keep unknown` is one click, remains audit-visible, and does not become a contradictory clinical fact. Structured changes happen in the packet.
5. **Confirm the packet: strong.** Medication chronology is visible and editable as active in episode, historical, held, stopped, one-time, or uncertain. Exact source spans sit beside each row. Medication and lab rows can be added or removed. `Go to confirmation` scrolls to and focuses the one final CTA. Source attachments lock after intake so the UI never suggests that a replacement file will be processed.
6. **Watch verification: strong.** The stage rail and streamed ingest, retrieve, synthesize, verify states make the moat legible without implementation branding.
7. **Review the result: strong.** The report states episode exposures screened, timeline exclusions, and mapping quality before claims. Every finding exposes its exact pair, severity, source passage, source field, version, retrieval time, and outbound source. Rejected claims remain visible as reviewer evidence.
8. **Recover from failure: improved.** Stream failures remain on the verification canvas as an alert and expose a retry action instead of silently returning to confirmation.

## Screenshots

- [Final empty state](validation/product-audit-2026-07-11/07-empty-state-final.png)
- [12-case licensed gallery](validation/product-audit-2026-07-11/08-gallery-12-cases.png)
- [Medication chronology packet](validation/product-audit-2026-07-11/09-medication-timeline.png)
- [Ready to confirm](validation/product-audit-2026-07-11/10-ready-confirm-final.png)
- [Live verification pipeline](validation/product-audit-2026-07-11/11-pipeline-running.png)

## Material changes from the audit

- Automatic mobile pane changes match the current task.
- Gallery search, safety focus, keyboard focus trap, Escape close, and focus restoration.
- Neutral source-extracted indicators instead of false normalization-success checks.
- Editable medication chronology with verbatim source spans.
- Add/remove controls for medications and labs.
- Larger, higher-contrast privacy gate.
- Locked source attachment after intake.
- Generic clarification actions and a safe unknown path.
- Full finding rendering instead of silently limiting the report to six.
- Visible medication scope and normalization coverage.
- Per-finding DOM oracles for exact pair and citation verification.
- English-default, persistent Spanish UI and prompt localization without translating source data.
- Pair-level ambiguity presentation with one explicit navigation action.
- Mobile header compression and full-width medication-name rows.

## Remaining validation, not hidden

- The final build still requires the five exact qualifying pairs to pass on the same frozen fingerprint.
- The final eight-hour soak must complete on that fingerprint with zero failures.
- Independent pharmacist validation remains a human gate and is not claimed complete.
- A production PHI deployment requires the full privacy architecture in `PRODUCTION.md`.

## Design verdict

The interface is no longer a decorative dashboard. It supports the complete source-to-packet-to-verification-to-evidence workflow. Its strongest visual idea is restraint: warm paper surfaces, clinical typography, compact provenance, and muted status color make evidence feel primary. The strongest product idea is now visible in the UI: Sourced separates what was present in the document, what was active in the reviewed episode, what was excluded, what normalized, what survived verification, and what the reviewer rejected.
