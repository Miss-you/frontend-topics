# Shared daily UI and frontend topics implementation plan

**Goal:** Maintain one versioned source of the searchable selector and date navigation, safely vendor it into two independent readers, and publish a growing public frontend topic library.

**Architecture:** Dependency-free DOM components receive elements, labels and callbacks. Reader adapters own endpoints, URL/history, summaries and evidence. A read-only-by-default sync tool updates only opted-in vendor directories after validating locks, paths and every target. Public topics use synthetic examples; private project rules link to the reusable contracts and keep business constraints local.

**Tech stack:** ES modules, Node built-in tests, Playwright, CSS variables, version/hash vendor manifests, Markdown, GitHub.

## Agreed scope and boundaries

The user approved the lightweight component/version/sync plan and explicitly approved a new public `frontend-topics` repository. Its local path is a separate sibling checkout; consumers never read another checkout at runtime. The public repository contains only generic code, synthetic fixtures, topic explanations and tests. Source archives, credentials, production records, account lists and private runbooks stay outside it.

Preflight: no matching open/recent PRs in either consumer; the only recent merge is unrelated archive work. The public repository did not exist. Existing unrelated dirty files in the first consumer remain untouched and unstaged. Current frontend acceptance is the behavioral baseline.

## Task sequence

1. Write failing shared matching/session/sync tests. Implement portable picker, date-navigation session and DOM behavior with cleanup; styles use component data attributes and theme variables.
2. Implement a preview/check/write sync tool with schema/version/hash locks, explicit destination allowlist, local-drift/unknown-file/symlink rejection and validation of all targets before writes. Prove upgrades, conflict refusal and rollback in temporary fixtures.
3. Replace duplicate consumer implementations with narrow adapters and versioned vendor files. Preserve each reader's labels, source security, API prefix and history behavior. Keep old matching module paths as tiny compatibility re-exports if needed.
4. Add interaction contracts, topic/FAQ index, contributor/template workflow and an initial evidence-backed retrospective. Review each consumer's AGENTS/CLAUDE situation and add only minimal hard rules and links to contextual recommendations.
5. Run shared unit/component E2E, sync drift checks, both full consumer check/build/E2E gates, screenshot/touch/public resource checks. Independently review code, sync safety and knowledge/actionable open items; fix findings.
6. Reconcile the final retrospective against actual evidence, scan staged files and outgoing commits, commit/push only scoped work and publish the new public repository. Confirm remote SHAs. Do not treat future browser or automation coverage as already verified.

## Completion evidence

Two consuming adapters import identical vendor bytes and no longer own the shared state machine or interaction CSS. Sync check fails on drift and a real two-target preview/write/check succeeds without modifying business files. Canonical components have executable contracts and example fixtures. Both readers retain their old source/page/history tests and new interaction regressions. Public content has a license, clean-install commands, reusable topic template, grounded FAQs, differentiated rule levels and precise remaining boundaries. Existing user data and unrelated edits remain intact.
