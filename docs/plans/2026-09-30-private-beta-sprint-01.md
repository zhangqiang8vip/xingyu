# XINGYU Private Beta Sprint 01 — Single-Tenant Beta Enablement

> Date: 2026-09-30
> Owner: Product / CEO
> Repository: zhangqiang8vip/xingyu
> Status: BLOCKED — do not start implementation until Scale Hardening Sprint 01 is fully integrated and the umbrella issue records a frozen baseline SHA as READY.

## 1. Product goal

This sprint has exactly one goal:

> Safely give 5–8 real beta users their own isolated XINGYU instance and let each user reach the first real value path: bring real knowledge in, connect an Agent, let the Agent create or update knowledge, and see a trustworthy result.

The beta architecture is deliberately **single-tenant per instance**:

- one beta user / owner;
- one Worker deployment or isolated route/config;
- one D1 database;
- one R2 bucket;
- one admin credential set;
- one MCP/OAuth surface;
- no shared tenant data plane.

This sprint is **not** a multi-account SaaS conversion.

## 2. Non-goals

Do not build:

- multi-tenant shared D1;
- organizations / teams / invitations;
- multi-user collaboration;
- enterprise RBAC / SSO;
- comments / newsletter / billing;
- generic workflow engine;
- complex Proposal state machine;
- agent marketplace;
- mobile app;
- broad Notion / Obsidian / WordPress migration platform;
- new analytics dashboard;
- production deployment or production data mutation as part of implementation work.

Existing production resources must not be mutated by sprint scripts or tests.

## 3. Why single-tenant beta first

The current codebase already contains users / identities / memberships and post attribution fields, but runtime ownership still resolves writes to a single site owner. Spaces, categories, site settings, content pages, attachments and MCP activity are not tenant-scoped. Therefore opening one shared instance to unrelated beta users would create a false sense of isolation.

The beta should validate product demand before paying the full architectural cost of multi-tenancy.

## 4. Team model

Use 6 GPT-5.6 Sol Extra High agents:

- **A1 — Beta Provisioning Core**
- **A2 — Instance Identity & Resource Safety**
- **A3 — Real Knowledge Import**
- **A4 — Activation & Beta Signals**
- **A5 — Independent QA / Safety Contracts**
- **A6 — Integrator / Product Gate**

A1–A5 must work from the same frozen baseline SHA and create their own branches. A6 integrates only after A1–A5 report completion.

## 5. Baseline gate

Before any implementation agent starts:

1. Confirm Scale Hardening Sprint 01 is fully integrated.
2. Confirm upstream/main is green.
3. Record the exact commit SHA in the umbrella issue.
4. Change umbrella status from BLOCKED to READY.
5. Every agent must branch from that exact SHA, never from a stale fork/main.

If the umbrella issue is not READY, implementation agents stop without changing code.

## 6. Branches

Suggested branch names:

- A1: `agent/beta-provisioning`
- A2: `agent/beta-instance-safety`
- A3: `agent/beta-knowledge-import`
- A4: `agent/beta-activation`
- A5: `agent/beta-safety-contracts`
- A6: `integration/private-beta-sprint-01`

Agents may work in a writable fork if upstream branch creation is unavailable, but every report must record repo, branch and commit SHA.

## 7. Work packages

### A1 — Beta Provisioning Core

Build a reproducible operator workflow that can prepare a new isolated beta instance without hand-editing production config.

Required properties:

- dry-run by default;
- explicit instance slug / identifier;
- deterministic resource names;
- no production resource names accepted;
- generated config is reviewable before apply;
- reruns are safe or fail clearly;
- secrets are never printed or committed;
- no production deployment during agent work;
- an operator runbook explains create / verify / destroy-or-disable procedure.

### A2 — Instance Identity & Resource Safety

Create a minimal instance identity contract so a beta deployment can detect resource/config mixups.

Required properties:

- each instance has an explicit immutable-ish instance identifier;
- DB identity validation is instance-aware, not merely `APP_ENV=beta`;
- resource binding mistakes fail closed;
- production and beta identifiers are clearly separated;
- tests cover wrong-instance D1/config binding;
- do not introduce shared-tenant query logic.

Prefer extending existing bootstrap/environment identity mechanisms over creating a parallel framework.

### A3 — Real Knowledge Import

Implement the smallest import path that allows a beta user to bring real knowledge into their private XINGYU environment quickly.

Scope target:

- Markdown/text input;
- 10–100 items in a realistic beta batch;
- defaults to private knowledge / space, never public;
- preserves title/content predictably;
- handles duplicates and invalid files safely;
- errors are actionable;
- import does not publish;
- no broad third-party migration platform.

The exact UX may be admin upload, batch endpoint, or operator-assisted import, but it must be usable by a non-developer beta participant with minimal instruction.

### A4 — Activation & Beta Signals

Make the first-value path legible without exposing MCP/OAuth internals.

Required activation path:

1. real knowledge exists;
2. an Agent connection exists;
3. the Agent performs a real create/update on private knowledge;
4. the user can see what happened;
5. the system can determine that activation occurred.

Use existing audit/activity data where possible. Do not create a heavy analytics platform.

The UI should speak in user language such as “Agent connected”, “knowledge imported”, “Agent updated this item”, not implementation terms such as scopes, subjects or receipt IDs unless the user opens technical details.

### A5 — Independent QA / Safety Contracts

Write independent tests and acceptance checks for the sprint contract, with emphasis on failure modes.

Must test, as applicable:

- production resource names are rejected by beta provisioning;
- wrong instance identity fails closed;
- imported content stays private;
- import cannot silently overwrite unrelated content;
- agent writes remain subject to existing draft/publish boundaries;
- destructive/public actions are not accidentally weakened;
- secrets do not appear in generated files/logs;
- repeated provisioning/import behavior is predictable;
- existing public blog behavior is not unintentionally changed.

A5 should not redesign features. Its job is to make unsafe integration difficult.

### A6 — Integrator / Product Gate

A6 runs only after A1–A5 completion reports exist.

Responsibilities:

1. read every issue report and branch/PR diff;
2. reject work that violates sprint non-goals even if technically impressive;
3. integrate in the safest dependency order;
4. resolve conflicts with minimal semantic changes;
5. run full lint/typecheck/build/test/CI;
6. run the beta acceptance scenario end-to-end in a non-production environment;
7. request targeted fixes from the owning agent when needed;
8. produce one integration branch and final integration report;
9. update this plan or the umbrella issue with actual outcome and remaining risks.

A6 must not hide failing tests, weaken guards, or “fix” failures by skipping assertions.

## 8. Agent completion report contract

Every A1–A5 agent must post a report to its GitHub issue containing:

- branch name;
- final commit SHA;
- PR URL if one exists;
- files/modules materially changed;
- what was implemented;
- what was deliberately not implemented;
- tests run and exact result;
- manual verification performed;
- security/data-isolation considerations;
- migration/schema impact;
- known risks / follow-ups;
- whether any production resource/data/secret was touched (expected: no);
- explicit statement: `READY FOR INTEGRATION` or `NOT READY`.

If not ready, explain exactly why.

## 9. Review / fix loop

When A6 finds a defect:

1. A6 comments on the owning task issue with a minimal reproduction and required outcome.
2. The original owning agent fixes it on its own branch.
3. The agent reruns relevant tests and posts a delta report.
4. A6 re-reviews that branch.
5. A6 does not silently absorb substantial feature fixes into the integration branch.

This preserves accountability and keeps the integration branch from becoming a second development branch.

## 10. Product acceptance gates

The sprint is successful only if all are true:

- a beta instance can be prepared reproducibly without touching production;
- two independently configured beta instances cannot accidentally share D1/R2 identity without a failing guard;
- a beta user can receive/import real private knowledge;
- imported content is not publicly visible by default;
- an Agent can connect and perform a legitimate private knowledge write using existing safety semantics;
- the user can understand that the Agent changed something;
- activation can be measured without vanity metrics;
- full CI passes after integration;
- no multi-tenant illusion is introduced;
- no production mutation is required for acceptance testing.

## 11. CEO / Product final review

After A6 finishes, the CEO/Product reviewer performs a final review of:

- product scope adherence;
- whether the activation path is actually simpler for a beta user;
- whether engineering work accidentally expanded into premature SaaS/multi-tenant architecture;
- whether code boundaries remain understandable;
- whether the beta can be operated safely for 5–8 users;
- whether unresolved risks are acceptable before inviting real users.

The final decision is one of:

- **GO — invite private beta users**
- **GO WITH CONDITIONS — invite only after listed blockers are fixed**
- **NO-GO — product/safety/architecture gate failed**

## 12. What comes after this sprint

If real beta usage demonstrates retention, multi-account / multi-tenant architecture may become the next product blocker. Until then, single-tenant isolated instances are an intentional validation strategy, not technical debt to “fix” preemptively.
