# Packet workflow UX audit

Audited on 2026-07-11 against the reported PDF intake, clarification, packet editing, confirmation, and verified review flow.

## Flow health

1. Intake: healthy. The primary action is `Extract packet`. The disabled action explains whether the privacy confirmation or a source is missing.
2. Extraction: healthy. The editable draft is withheld until extraction completes. The canvas exposes an indeterminate, source-specific status with `role=status`, `aria-live=polite`, and `aria-busy=true`.
3. Clarification: healthy. `Save answer` requires new text. A locked attachment cannot enable it. `Keep unknown` is the explicit non-answer path, stays visible in the audit history, and does not inject an unresolved answer into clinical context. `Ask again` remains secondary.
4. Packet editing: healthy. `Review or edit packet` changes the mobile pane, scrolls to the relevant section, focuses the ambiguity target, and displays an editing explanation. Editing structured fields does not silently resolve the question.
5. Empty clinical context: healthy. Missing diagnoses, allergies, medications, and labs have honest empty states. Missing allergies are not represented as no known allergies.
6. Lab units: healthy. The unit field is a native combobox with common conventional and SI suggestions. The extracted unit is preserved, arbitrary units remain editable, and values are never converted automatically.
7. Confirmation: healthy. The only confirmation action appears at the bottom of the reviewed packet and reads `Confirm packet and run review`. The resolved state exposes `Go to confirmation`, which changes panes, scrolls to the CTA, and focuses it. Invalid medications or labs produce a visible blocker.
8. Verified review: healthy. The completed canvas exposes cited findings and does not reuse a stale clarification as completion copy.
9. Mobile flow: healthy. Intake actions remain in normal flow below the privacy control, panes switch explicitly, ambiguity editing focuses the correct field, and the document has no horizontal or page-level vertical overflow.
10. Clarification transition: healthy. A fixed-height `Analyzing source ambiguity` state occupies the question region while the assistant prepares the source-grounded prompt. The final `Action required` content reveals in place without a height change.
11. Shared medication ambiguity: healthy. One pair-level callout represents one clarification, names the two affected entries, and exposes one explicit `Review clarification` action. Both rows remain lightly highlighted without presenting two independent warning controls.
12. English and Spanish: healthy. English is the clean-session default. The language selector persists the clinician's choice. Static UI, errors, progress, accessibility labels, intake questions, synthesis, deterministic report copy, and verifier audit copy follow the locale. Medication names, doses, units, identifiers, filenames, and exact source passages remain unchanged.
13. Mobile density: healthy. The split-workspace header retains the Sourced identity while collapsing secondary button text. Medication names use a full-width row above status controls so dose text remains readable at 390 px.

## Evidence

- `01-intake.png`: initial disabled action and privacy requirement.
- `02-extracting.png`: extraction status without editable empty fields.
- `03-clarification.png`: answer-specific composer and honest empty allergies.
- `04-edit-packet.png`: editing focus and guidance.
- `05-confirm-action.png`: single confirmation action at the packet boundary.
- `06-verified-review.png`: completed source-bound review.
- `07-mobile-intake.png`: non-overlapping mobile intake actions.
- `08-mobile-clarification.png`: mobile question and answer state.
- `09-mobile-edit.png`: focused mobile packet editing state.
- `10-clarification-loading.png`: persistent clarification analysis state.
- `11-clarification-ready.png`: in-place action-required reveal.
- `14-i18n-english-intake.png`: clean-session English default.
- `15-i18n-spanish-intake.png`: persisted Spanish intake.
- `16-spanish-shared-clarification.png`: one shared pair clarification on desktop.
- `17-spanish-confirmation-location.png`: resolved-state direction to the packet boundary.
- `28-spanish-mobile-final.png`: final Spanish clarification state on mobile.
- `29-spanish-mobile-shared-ambiguity-final.png`: mobile pair-level callout.
- `31-spanish-mobile-medication-rows-final.png`: readable mobile medication names and statuses.
- `validation/e2e/2026-07-11T18-24-45.665Z-sertraline-dextromethorphan-serotonin-syndrome-full-es.png`: complete Spanish PDF-to-verified-review E2E with six cited findings.

## Accessibility and responsive limits

- Keyboard focus, visible focus treatment, native field labels, `aria-current`, status announcements, disabled explanations, reduced-motion behavior, and document overflow were checked in Chromium automation.
- The document maintained zero page-level overflow at 390x844, 1280x577, and 1440x1000. Each workspace pane owns its internal scroll. The Spanish clarification loader and ready state both measured exactly 250 px at 390x844.
- Browser automation confirmed the grouped clarification CTA and final confirmation CTA receive keyboard focus after navigation.
- A physical screen reader, forced-colors mode, and browser-specific datalist announcements were not tested. The lab unit control remains a native editable combobox so unknown source units are not lost.
- Clinical unit suggestions are assistive only. They do not normalize, convert, or validate a clinical value.
