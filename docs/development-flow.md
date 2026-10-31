# Development flow

The default flow for gitarena is Issue → implementation → PR → review → revision as needed → merge into `main`. Perform post-merge verification only when the Issue requires it. AI agents and human contributors follow the same guidance.

## Collaboration language

Use **English** for newly authored templates, development/review/merge documentation, AI instructions, Issue and PR titles and bodies, review comments, and commit messages. This collaboration-language convention does not require translating historical content or changing product localization.

## 1. Start with an Issue

Use the [Issue template](../.github/ISSUE_TEMPLATE/issue.md) to capture the problem, expected outcome, relevant context, reproduction steps where applicable, and concrete completion criteria. No assignee or owner field is required.

Default to criteria an AI agent can execute and verify. Require human confirmation, physical-device testing, subjective evaluation, or external approval only when necessary for the actual Issue. Explain why each such check is necessary and what result is expected.

Separate these categories:

- **Pre-merge acceptance criteria:** mandatory requirements achievable and verifiable before merge, including applicable implementation and validation requirements.
- **Optional validation:** useful checks that are not conditions for completion or approval.
- **Required post-merge verification:** genuinely necessary checks possible only after merge. State "None" when no such checks are needed; do not add them routinely.

For example, publication triggered by merge can only be verified after merge. Keep that check pending separately; it must not be a pre-merge approval condition and does not replace applicable pre-merge checks.

## 2. Implement the smallest complete change

Read the source Issue and inspect the current repository before editing. Use the Issue to assess scope and choose the smallest coherent design that fully addresses it. Clarify genuinely blocking ambiguity before dependent work; proceed with clear, independent work where possible.

Check both directions: leave no required work missing, and add no unjustified scope or complexity. Avoid unnecessary abstractions, speculative extensibility, unrelated refactoring, frameworks/subsystems, or extra policies/configuration without a demonstrated need tied to the Issue. Added complexity is not automatically beneficial. Preserve justified existing conventions; simplicity does not excuse omitted requirements or necessary validation.

Choose checks appropriate to the changed files and actual repository tooling. Application checks are documented in [README.md](../README.md): `npm test`, `npm run test:ui`, `npm run test:docker`, and `npm run check`. Docker tests require a running daemon and the pre-pulled runtime image; browser tests require Playwright Chromium. Report any skipped suite and its reason. Do not add dependencies, CI, or tooling setup merely to document a process.

Apply the [test and CI performance principles](testing-ci-principles.md) when choosing test layers, combinations, and execution structure, preserving required regression confidence.

For templates and documentation, inspect Markdown structure, template syntax, links, whitespace, and consistency. Git's `git diff --check` checks whitespace in the diff. No unrelated runtime suite, hardware/device check, or deployed-site verification is required for a documentation-only change unless the actual Issue establishes a need.

## 3. Open a PR for the Issue

Use the [PR template](../.github/pull_request_template.md). Explain the problem, resulting behavior, focused changes, related Issues, and validation actually performed. Report failures, skipped checks, and unperformed checks accurately, with reasons.

Claim to close an Issue only when the PR fully addresses it. Clearly identify an intentionally partial implementation and leave its source Issue open. Record required post-merge verification separately as pending until performed; pending post-merge checks alone do not make an otherwise complete implementation partial.

## 4. Review and revise

Apply the [review guidelines](review-guidelines.md). The central question is: **Does the PR completely solve the source Issue, without unnecessary scope or complexity?**

Request fixes for agent-fixable findings and review the updated PR again. If genuinely necessary human input is missing, record the specific question and expected answer, then use the workflow's wait path. Distinguish waiting for human input from requesting implementation fixes; do not repeatedly request code changes to resolve a missing human decision.

## 5. Merge and report follow-up

Approve and merge into `main` through the authorized workflow when the implementation is complete, mandatory pre-merge checks are sufficient and pass, and no blocking review findings remain.

Perform any recorded required post-merge verification after merge. Report actual results, failures, and needed follow-up; keep unperformed checks pending. Pre-merge validation does not prove deployment or publication succeeded. Checks possible only after merge do not block pre-merge approval.
