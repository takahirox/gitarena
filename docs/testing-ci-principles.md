# Test and CI performance principles

**Detect the required failures at the lightest appropriate layer, without redundant execution.** Preserve required correctness, regressions, and meaningful integration coverage when moving or consolidating checks.

## Apply the principles

1. **Prefer the lightest meaningful layer.** Test validation branches, session state transitions, and annotation calculations with focused unit/component checks where possible. Reserve Playwright for comparison, capture, annotation, and feedback interactions that need a browser; use real Docker tests for launch, isolation, and cleanup boundaries. Add assertions that catch concrete defects rather than mirror implementation steps.
2. **Choose combinations deliberately.** Cover distinct paths with representative refs, launch configurations, failure states, and capture sources. Do not automatically cross every ref, image, browser, annotation tool, and lifecycle state. Exercise exhaustive combinations when their interactions require it, retaining required regressions and integration coverage.
3. **Match validation to the change.** Use the checks below for fast feedback and applicable full regression validation before merge. Keep optional checks optional, and record genuinely post-merge-only verification separately under the [development flow](development-flow.md#1-start-with-an-issue). Deployment/publication checks belong to their actual triggers and do not replace pre-merge validation.
4. **Reuse work and avoid duplicate execution.** Reuse dependency/browser downloads, prepared Git fixtures, and other expensive setup where safe, with cache keys tied to relevant versions and inputs. Preserve isolation between sessions, containers, and data directories. If CI is added, avoid equivalent push/PR runs for the same revision; cancel superseded validation safely while preserving necessary deployment ordering. Measure resource use before increasing parallelism; Playwright currently uses one worker.
5. **Review value and cost together.** For added or expanded tests, identify the additional defect detected, existing coverage that may already provide that assurance, and execution/maintenance cost. Watch for repeated fresh browser/server/container setup, large repositories or images, readiness waits, and growing combination matrices. Remove duplication without weakening meaningful assertions.
6. **Maintain an execution-time budget.** No measured normal-CI baseline or target is recorded yet. Establish one from actual runs during test/CI performance work, monitor growth, and investigate work exceeding the target. Track elapsed feedback time, total runner/computation time, and queue time separately. Revisit setup, test structure, and duplication while retaining required coverage. This guidance adds no benchmark, hardware purchase, universal time limit, or merge gate.

## Use the existing checks

Commands and prerequisites are in [README validation](../README.md#validation) and [package.json](../package.json). There is no checked-in CI workflow or build/deployment script. These principles apply to local checks now and to future CI additions.

| Change | Applicable validation |
| --- | --- |
| Documentation/templates only | Inspect Markdown structure, template syntax, links/anchors, and consistency; run `git diff --check`. Unrelated application suites are unnecessary. |
| UI interactions/capture | Run `npm run test:ui` for affected browser behavior; include `npm test` when shared API, persistence, or lifecycle behavior changes. |
| Core/runtime | Run `npm test` for Git, lifecycle, persistence, API/security, and embedding checks; include `npm run test:docker` for real launch/isolation/cleanup changes and browser checks for affected interactions. |
| CI/build tooling, if added or changed | Validate the affected configuration, commands, triggers, reuse, and relevant regression suites. Check duplication and deployment ordering without introducing unrelated validation. |

For application changes, include `npm run check` for the configured server/UI syntax and diff whitespace checks. `npm test` skips real Docker tests by default; it does not replace `npm run test:docker`. Browser tests require Playwright Chromium; Docker tests require a running daemon and the pre-pulled runtime image. Report skipped or unperformed checks and reasons, never as passes.

Use the source Issue and affected behavior to identify mandatory pre-merge checks and any optional validation. Run focused checks early, then the applicable regression suites before merge. Checks possible only after merge remain pending separately; no post-merge verification is required merely to document these principles. Changes to tests, workflows, caches, or worker settings need separately scoped implementation work and their own applicable validation.

## Review question

> Does this change provide sufficient confidence with the lightest appropriate validation, without redundant execution?
