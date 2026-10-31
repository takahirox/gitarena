# Review and merge guidelines

Follow the [development flow](development-flow.md), including its English collaboration-language convention. These instructions apply to AI agents as well as human reviewers.

## Start with the source Issue

Read the source Issue, its acceptance criteria, the PR description, and the diff. Ask: **Does the PR completely solve the source Issue, without unnecessary scope or complexity?**

## Check both directions

- **No missing work:** verify that every requirement and acceptance criterion the PR claims to resolve is implemented and appropriately validated. Do not approve an incomplete solution as closing the Issue. An intentionally partial PR must say so and leave the Issue open.
- **No unnecessary work:** reject unnecessary abstractions, speculative extensibility, unrelated refactoring, frameworks/subsystems, or extra policies/configuration without a demonstrated need tied to the Issue.

Prefer the smallest coherent design that fully satisfies the Issue. Added complexity is not automatically beneficial. Preserve justified existing conventions, and do not use simplicity to excuse omitted requirements or necessary validation.

Check correctness, consistency with the existing repository, and documentation affected by the change.

Review applicable interface changes against the [UI/UX principles](../README.md#uiux).

## Check validation and timing

Verify that the validation evidence is sufficient for the changed files and actual tooling. Check the reported results, including failures, skipped checks, and unperformed checks with their reasons. Do not accept an unperformed check as passing.

Apply the [test and CI performance principles](testing-ci-principles.md): **Does this change provide sufficient confidence with the lightest appropriate validation, without redundant execution?** For added or expanded tests, assess additional defect coverage, overlap with existing checks, and execution/maintenance cost together.

For application changes, use the relevant [documented checks](../README.md#validation), including real Docker launch/cleanup tests for lifecycle changes and browser tests for interaction/capture changes. For templates and documentation, inspect Markdown and template syntax, links, whitespace, and consistency; use available tooling such as `git diff --check`. Do not add tooling or require unrelated runtime suites, hardware/device checks, or deployed-site verification merely for documentation changes.

Require mandatory pre-merge acceptance to be achievable and verifiable before merge. Check that optional validation remains optional. Human confirmation, physical-device testing, subjective evaluation, or external approval should be required only when necessary for the actual Issue, with a reason and expected result.

Record genuinely necessary checks possible only after merge separately as required post-merge verification, pending until performed. Such checks must not be pre-merge approval conditions. For example, pre-merge evidence does not prove a merge-triggered deployment or publication succeeded. This timing distinction does not waive implementation requirements or applicable pre-merge validation.

## Choose the review outcome

- **Request changes:** for agent-fixable findings, identify the affected requirement or file, the problem, and the expected correction. Review the updated PR and relevant validation again after revision.
- **Wait for human input:** when a genuinely necessary human decision or confirmation is missing, record the specific question, why it blocks progress, and the expected answer or evidence. Enter the workflow's wait path and resume when the answer arrives. Keep this state distinct from agent-fixable findings; do not repeatedly request code fixes for missing human input.
- **Approve and merge:** when the implementation fully addresses the Issue it claims to resolve, scope and complexity are justified, mandatory pre-merge checks are sufficient and pass, and no blocking findings remain, approve and merge through the authorized workflow into `main`.

Pending checks possible only after merge do not prevent approval when these conditions are met. After merge, perform any required post-merge verification and report actual results and follow-up honestly. Keep it pending until performed; do not claim deployment or publication succeeded based on pre-merge checks.
