# Resource operations

Sourced treats resource exhaustion and orphaned work as test failures, not background noise.

## Concurrency budget

- Run at most one model-heavy clinical review at a time during qualification.
- Run at most one E2E child per soak process.
- Subagents must own independent, bounded work. Close them when the result is delivered.
- Do not run corpus, soak, and manual full-review jobs concurrently.

## Timeouts

| Work | Limit |
|---|---:|
| RxNav request | 10 seconds |
| License request | 15 seconds |
| Browser command | 120 seconds |
| Intake model attempt | 75 seconds |
| Anthropic API call | 120 seconds |
| Claude CLI fallback | 180 seconds |
| Smoke child | 150 seconds |
| Intake child | 240 seconds |
| Full-review child | 600 seconds |
| Dataset command | 180 seconds |

Child processes are terminated on timeout. Browser sessions and temporary upload fixtures close in `finally` blocks. Model subprocess output is bounded to 2 MB.

## Health gate

Run:

```bash
bun run ops:health
```

The gate reports free memory, available disk, task-owned processes, RSS, and active E2E process count. It fails when free memory is below 15% or disk availability is below 5 GiB.

The soak records the same resource snapshot in every heartbeat and stops if the limit is crossed. It also stops if its code fingerprint changes.

## Local workflow state

Use a fresh `WORKFLOW_LOCAL_DATA_DIR` for every final candidate. Reusing a directory can re-enqueue interrupted local runs and consume CPU, memory, and logs.

```bash
cd web
WORKFLOW_LOCAL_DATA_DIR=.workflow-data/e2e-final-candidate portless source bun run dev
```

After an interrupted candidate is no longer needed, stop the server and remove only that candidate's local workflow directory. Browser JSONL events, screenshots, source hashes, and soak state in `validation/` remain the durable evidence.

## Process ownership

Before killing anything, match the full command path to this repository. Never terminate unrelated Bun, Node, browser, Portless, Claude, or Codex processes. A healthy final state has:

- one Portless proxy shared by the machine
- one Sourced Next dev server while the user is reviewing the app
- zero orphaned `agent-browser` or E2E children outside an active check
- zero completed subagents occupying execution slots

## Qualification handoff

1. Run unit tests, typechecks, build, data health, edge E2E, and exact full-case preflight.
2. Run `bun run ops:health`.
3. Freeze code and corpus.
4. Start the fingerprinted eight-hour soak.
5. Do not edit fingerprinted files during the soak.
6. Run the final audit and resource gate before declaring readiness.
