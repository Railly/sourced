# Production architecture

Sourced does not need a database to prove the hackathon workflow. The current demo intentionally processes synthetic or de-identified sources without creating a patient record.

The production posture is private by default:

1. `Discard now` is the default after a review.
2. `Save encrypted for 30 days` is an explicit clinician action.
3. Raw PDFs, original filenames, pasted notes, prompts, model responses, and PHI in logs are never persisted by default.
4. Public evidence and verification metadata remain independently auditable.

## Neon decision

Neon is a strong fit for durable workflow state, idempotency, evidence snapshots, verification events, access audit, and optional encrypted review history. Adding it as a rushed dependency would not strengthen the current judge demo, so the hackathon build remains stateless.

A production slice should use `@neondatabase/serverless` over HTTP with a pooled application connection for short serverless operations. Long clinical runs must not hold a database transaction open. They create a run, append stage events in short transactions, and atomically commit the result. Direct connections are reserved for migrations and administrative work.

Official references:

- [Neon serverless driver](https://neon.com/docs/serverless/serverless-driver)
- [Connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Security overview](https://neon.com/docs/security/security-overview)
- [HIPAA requirements](https://neon.com/docs/security/hipaa)
- [Backups and restore](https://neon.com/docs/manage/backups)
- [Schema-only branches](https://neon.com/docs/get-started-with-neon/workflow-primer)

## Data boundary

Persist without clinical prose:

- tenant, actor, role, run status, pipeline version, model identifier, timestamps, idempotency key, lease, retry count, and expiration
- append-only stage events and reason codes
- public evidence identifiers, versions, source URLs, exact fields, quoted public text, hashes, and retrieval timestamps
- verification outcomes, claim digests, evidence-set digests, and reviewer version
- content-free audit and deletion receipts

Persist only after explicit save:

- an opaque case identifier
- an application-encrypted clinical packet
- an application-encrypted verified report
- payload hashes, key versions, retention basis, and expiration

Never persist by default:

- raw uploads, audio, original filenames, pasted source text, prompts, responses, names, MRNs, dates of birth, addresses, signed URLs, or credentials
- PHI in schema names, branch names, support tickets, query text, error logs, analytics, or observability

Clinical values must always be bound parameters. They must never be interpolated into SQL or database identifiers.

## Proposed tables

- `tenant`, `principal`, `tenant_membership`
- `clinical_case`, `case_snapshot`
- `review_run`, `run_event`, `review_result`
- `evidence_snapshot`, `run_evidence`, `verification_event`
- `audit_event`, `deletion_receipt`

Clinical payloads are encrypted with application-level envelope encryption. Encryption keys live outside Neon. Runtime roles do not own tables and do not have `BYPASSRLS`. Every tenant table enables and forces row-level security. Migration credentials exist only in CI.

## PHI gate

Neon support alone does not make Sourced HIPAA-ready. Before any PHI enters the system:

- use a dedicated Neon Scale project, accept a BAA, and enable HIPAA on that project
- do not use Neon Auth or the Neon Data API in the PHI project
- verify the full vendor chain separately, including Vercel, authentication, Anthropic, object storage, email, and observability
- complete threat modeling, retention and deletion controls, restore drills, incident response, access reviews, secret rotation, clinical validation, and an independent security review

Until that gate is complete, production remains de-identified-only.

## Retention

- Default review: discard clinical source and packet after delivery.
- Explicit saved review: encrypted packet and report expire after 30 days by default.
- Raw upload: do not retain after extraction. A future approved object-store workflow should use a 24-hour maximum TTL.
- PHI-free run events: 90 days.
- PHI-free tamper-evident access audit: 1 year initially, subject to organization policy.
- Pilot restore window: 7 days, subject to RPO and RTO requirements.

Deletion removes active clinical rows and encryption keys immediately. The deletion receipt contains hashes and timestamps only. User-facing purge timing must account for the configured restore window.

## Branching

Production is protected. Preview and test branches are schema-only and seeded with synthetic fixtures plus published public cases. A PHI production branch is never cloned into a preview environment. Every preview branch has a TTL and is deleted when its pull request closes.

Use separate projects:

- `sourced-clinical`: HIPAA-enabled only after the full compliance gate, encrypted tenant data, protected production
- `sourced-reference`: public evidence releases and non-PHI reference metadata, read-only application role

DDInter is suitable for this noncommercial hackathon under its current license. Commercial production requires replacement data or explicit licensing before it moves into the reference service.

## Delivery stages

1. Hackathon: stateless, synthetic or de-identified, public evidence corpus, no HIPAA claim.
2. Persistence demo: non-PHI Neon project with synthetic data, durable runs, idempotency, evidence ledger, verification events, and explicit save.
3. Controlled pilot: full vendor agreements, HIPAA-enabled Neon, server-side auth, forced RLS, encryption, retention, deletion, audit, protected production, and synthetic previews.
4. Production hardening: independent security and clinical review, restore and incident drills, monitoring with zero PHI in logs.
