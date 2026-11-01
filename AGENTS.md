# Frontend Topics contributor rules

This is a public, reusable frontend knowledge and component repository. Use synthetic examples only. Do not include private project paths, domains, account lists, archived content, credentials or production data. Do not import from consumer repositories at runtime.

Keep components as dependency-free ES modules. Components accept DOM references, labels and callbacks; consumers own APIs, page content, URL/history policy, persistence and deployment. Public functions need concise JSDoc. Share styles through explicit component data attributes and CSS variables; avoid global element/ID selectors.

The sync tool may update only explicitly opted-in, versioned vendor files after validating the entire plan. Default operation is read-only preview. Check detects drift. Writes reject unmanaged/local modifications, unsafe paths and symlinks. Never modify a consumer adapter, package file, database or configuration as an implicit sync side effect.

Before release run native unit/sync tests and Playwright component contracts, then run affected consumer acceptance separately. Do not claim cross-browser or future recurring behavior from Chromium evidence. Commit and publish only from the main agent. Keep generated/vendor updates traceable to a source version and checksums.

Knowledge entries distinguish observed evidence, hard contracts, contextual recommendations and unresolved questions. Prefer one canonical topic with linked FAQs/tests over duplicated rules. End completed frontend tasks with an evidence-backed retrospective and actionable open items; no fabricated follow-up work.
