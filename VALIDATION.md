# Clinical validation

## Current status

**Pending independent pharmacist review before submission.**

The software pipeline, citations, deterministic checks, and adversarial reviewer have been technically verified. The verifier fails closed: if claim-vs-source review cannot complete, the finding is not rendered. Clinical validation is a separate gate. Until a licensed pharmacist has reviewed the synthetic case, this repository does not claim that the ranking or patient-specific framing has been clinically validated.

## Review scope

The review uses only the synthetic HF/AFib discharge fixture in `data/fixtures/discharge-hf-afib.json`. It contains no PHI.

The pharmacist will assess:

1. Whether the synthetic case is clinically plausible.
2. Whether the ranked findings are factually and clinically framed without overstatement.
3. Whether warfarin plus newly started amiodarone is reasonably ranked first for this case.
4. Whether the monitoring language works as a review prompt and does not read as an autonomous prescription.
5. Whether a clinically important concern is missing or incorrectly prioritized.
6. Whether the source expansion and audit trail are useful during medication reconciliation.

## Acceptance criteria

- No rendered statement is clinically misleading.
- Patient-specific uncertainty is preserved. For example, the report says INR **may** rise after the current reading, not that it certainly will.
- The ranking is accepted by the pharmacist or corrected before submission.
- Any requested correction is implemented and re-verified against its cited source.
- A testimonial is used only if it reflects the pharmacist's spontaneous assessment.

## Evidence to record after the session

| Field | Result |
|---|---|
| Review date | Pending |
| Reviewer credential and practice context | Pending consent |
| Synthetic-case plausibility | Pending |
| Ranking assessment | Pending |
| Claims requiring correction | Pending |
| Missing concern identified | Pending |
| Workflow usefulness | Pending |
| Quote approved for submission | Pending |
| Video/name/credential consent | Pending |

## Limitations

One pharmacist review is formative product validation, not a clinical study, prospective safety evaluation, or evidence of improved patient outcomes. Sourced remains a review aid for licensed professionals and does not diagnose or prescribe.
