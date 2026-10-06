---
name: agent-workflow
description: How the coordinator runs TaskManager work — gitflow branches, delegating to designer/developer and ECC test/review agents, briefing them cheaply, verifying and merging. Use when starting a task or plan stage, creating a branch, spawning a subagent, or merging/releasing.
---

# Agent workflow (coordinator)

The main session is the **coordinator**: it splits the task, creates the branch, briefs subagents, checks their result and commits. Subagents only edit files and report.

## Pipeline

**designer → developer → tests (ECC) → review (ECC) → coordinator (checks, commit, merge)**

1. **designer** (`.claude/agents/designer.md`) writes only in `design/`: mockup `design/screens/<screen>.html` + spec `design/screens/<screen>.md`.
2. **developer** (`.claude/agents/developer.md`) implements from those two files and `design/tokens.css`; a missing endpoint is added via the `add-endpoint` skill.
3. Tests and review — ECC plugin agents:

| Role | ECC | When |
|---|---|---|
| Go tests | agent `ecc:tdd-guide` + skill `ecc:golang-testing` | `internal/`, `cmd/` changed |
| web tests | skill `ecc:react-testing` (Vitest) | `web/` changed |
| Go review | agent `ecc:go-reviewer` | diff touches `internal/`, `cmd/` |
| web review | agents `ecc:react-reviewer` + `ecc:typescript-reviewer` | diff touches `web/` |
| big feature review | `/ecc:review-pr` or `/ecc:orch-review` | optional, before merge |
| pre-merge checks | skill `ecc:verification-loop`; build broken → `/ecc:go-build`, `/ecc:react-build` | always |
| project hook rules | `/ecc:hookify` → `.claude/hookify.*.local.md` | new rule |

Rules for ECC agents (put them in the brief):
- Testers write only tests (`*_test.go`, `web/src/**/*.test.ts(x)`). A bug found by a test is reported, not fixed in production code. Time-dependent logic is tested with `now` passed as a parameter.
- Reviewers read `git diff develop...HEAD` and check it against language idioms **and** `CLAUDE.md` code rules + the `api-reference` contract (layers, camelCase requests / PascalCase responses, `respondError`, empty lists `[]`, Russian comments). Findings split into **blocking** and **advice**; no merge while anything blocks.

## Briefing subagents (token budget)

- Spawn every subagent with `model: "sonnet"` (designer/developer have it in frontmatter; pass it explicitly for ECC and Explore agents).
- Brief in concise English and point to files (spec, skill, codemap, plan stage) instead of restating them. State the done-criterion and what to report.
- Skip optional extra agents when the design is already settled (no separate Plan agent for a decided change).
- One session per plan stage: the plan file is the handoff; mark the stage `[x]` when done and suggest `/clear`.
- Once `docs/codemaps/` exists, point agents at it instead of letting them Glob/Grep; refresh it on any merge that changes structure.

## Gitflow

| Branch | From | Merges into | For |
|---|---|---|---|
| `main` | — | — | releases only, each tagged `vX.Y.Z` |
| `develop` | `main` | `release/*` | integration, always builds |
| `feature/<name>` | `develop` | `develop` | features, screens, mockups (`feature/design-<screens>`) |
| `bugfix/<name>` | `develop` | `develop` | bug found in `develop` |
| `release/X.Y.Z` | `develop` | `main` + `develop` | release prep: fixes and version only |
| `hotfix/X.Y.Z` | `main` | `main` + `develop` | urgent release fix |

- One task — one branch, camelCase name by meaning: `feature/taskScreen`, `bugfix/dayPriority`. No direct commits to `develop`/`main`.
- The coordinator creates the branch before spawning the agent. Subagents never create/switch branches, commit, merge or push.
- Parallel agents run in isolated worktrees (`.claude/worktrees/<name>`), each on its own branch (running the app from a worktree: `ops` skill).
- `design/` is committed on its own `feature/design-*` branch, never together with code.
- Merge into `develop` with `git merge --no-ff` after checks (`go build ./... && go vet ./... && go test ./...`, `cd web && npm test && npm run build`); delete the branch afterwards.
- `push`, releases (`release/*` → `main`) and `hotfix/*` only after the user confirms.
