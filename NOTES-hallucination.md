# Hallucination self-check

Date: 2026-07-09

Environment: `ANTHROPIC_API_KEY` was not present, so `synthesize` used `claude -p --model claude-opus-4-8`.

Command used:

```sh
bun --eval 'import { ingest } from "./src/ingest/index.ts"; import { retrieve } from "./src/retrieve/index.ts"; import { synthesize } from "./src/synthesize/index.ts"; import { verify } from "./src/verify/index.ts"; const raw = await Bun.file("data/fixtures/discharge-hf-afib.json").json(); const patient = await ingest(raw); const retrieval = await retrieve(patient, "data/sources/ddinter_B.csv", "2026-07-09T05:00:00.000Z"); const summaries = []; for (let i = 1; i <= 3; i++) { const report = verify(await synthesize(patient, retrieval.evidence, `2026-07-09T05:00:0${i}.000Z`), retrieval.evidence); summaries.push({ run: i, top: report.findings[0]?.headline ?? null, topSeverity: report.findings[0]?.severity ?? null, topMechanismHasCyp2c9: /CYP2C9/i.test(report.findings[0]?.mechanism ?? ""), topMonitoringHasInr: /INR|prothrombin/i.test(report.findings[0]?.monitoring ?? ""), findings: report.findings.length, removed: report.unverified_removed }); } console.log(JSON.stringify(summaries, null, 2));'
```

Observed verifier results:

```json
[
  {
    "run": 1,
    "top": "Amiodarone potentiates warfarin anticoagulation and can cause serious or fatal bleeding",
    "topSeverity": "major",
    "topMechanismHasCyp2c9": true,
    "topMonitoringHasInr": true,
    "findings": 4,
    "removed": []
  },
  {
    "run": 2,
    "top": "Amiodarone potentiates warfarin anticoagulation and can result in serious or fatal bleeding",
    "topSeverity": "major",
    "topMechanismHasCyp2c9": true,
    "topMonitoringHasInr": true,
    "findings": 2,
    "removed": []
  },
  {
    "run": 3,
    "top": "Amiodarone potentiates warfarin anticoagulation and can cause serious or fatal bleeding",
    "topSeverity": "major",
    "topMechanismHasCyp2c9": true,
    "topMonitoringHasInr": true,
    "findings": 3,
    "removed": []
  }
]
```

No real case occurred where Opus introduced a finding with an invalid or missing `evidence_id`, so there is no captured removed finding to include. I did not seed a fake untraceable claim.
