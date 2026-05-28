# evidence/ — offline replay assets

This subdirectory exists so the spec can be replayed without depending on the repo-root `.tmp/` scratch dir.

## Why this exists

A+ Reconnaissance Phase 1 was authored under the design contract that scratch scripts live under `.tmp/` and are NOT promoted into the source tree (Req 12.4). That keeps the working tree clean. The trade-off: cloning only `.kiro/specs/repo-system-reconnaissance-2026-05-28/` left a reviewer without the scripts and JSONL needed to replay the audit.

This `evidence/` directory is the lightweight resolution: a copy (not a move) of the scripts and key JSONL outputs that future reviewers need. The canonical scratch dir at the repo root remains `.tmp/`; this is a snapshot for offline replay, frozen at the same HEAD `d181be2f` as the rest of the spec dir.

## Contents

| file | role |
| --- | --- |
| `cap-audit.mjs` | Stage 8 audit script — implements the 6 mechanical checks |
| `reconcile.mjs` | Stage 6 reconciler — produces doc_without_code.jsonl + code_without_doc.jsonl |
| `aggregate-btier.mjs` | Stage 7 aggregator — produces btier-aggregation.jsonl |
| `classify-specs.mjs` | Stage 3 classifier — bucketed all 289 specs |
| `build-inventory.mjs` | Stage 5 module inventory builder |
| `build-domain-docs.mjs` | Stage 5 domain-map authoring helper |
| `dedup-step1.mjs`, `dedup-step2.mjs` | Stage 2 deduplication (criteria 1+2 then 3) |
| `scan.mjs` | Stage 1 scanner |
| `add-bom.mjs` | post-Stage-10 BOM injection so Windows viewers detect UTF-8 |
| `doc_without_code.jsonl` | 93 entries — specs whose mentioned paths don't resolve |
| `code_without_doc.jsonl` | 903 entries — TRUNK/BRANCH modules with empty `referenced_specs` |
| `btier-aggregation.jsonl` | 30 candidates — B/C/D/deferred routing |
| `duplicate_clusters.jsonl` | 1,293 clusters from Stage 2 dedup |
| `spec-task-completion.jsonl` | per-spec `task_completion_pct` from Stage 3.1 |
| `scanner-head.txt` | frozen HEAD record from Stage 1.1 |

## Replay

From the repo root (these scripts use `path.resolve(specDir, '..', '..', '..')` to find the repo root, so they work whether invoked from `.tmp/` or `evidence/`):

```sh
node .kiro/specs/repo-system-reconnaissance-2026-05-28/evidence/cap-audit.mjs \
     --spec-dir .kiro/specs/repo-system-reconnaissance-2026-05-28
```

Expected: `SUMMARY: 6/6 checks PASS` and exit code 0.

## Boundaries

- `evidence/` is a **copy**, not a move. The repo-root `.tmp/` remains the canonical work dir and is rewritten on re-runs.
- No script in this directory should be referenced from `package.json`, `tsconfig.json`, or `vite.config.*` (Cap_Verifier check 6 still applies).
- This directory is part of the spec's git-committed deliverable; `.tmp/` is not.
- Changing a script here without re-running it under the same frozen HEAD invalidates the Phase 1 stamp. If you need to revise, treat it as a new reconnaissance run under a new spec dir.
