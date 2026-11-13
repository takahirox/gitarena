# Review and merge guidelines

Follow the [development flow](development-flow.md), including its English collaboration-language convention. These instructions apply to AI agents as well as human reviewers.

## Start with the source Issue

Read the source Issue, its acceptance criteria, the PR description, and the diff. Ask: **Does the PR completely solve the source Issue, without unnecessary scope or complexity?**

## Check both directions

- **No missing work:** verify that every implementation requirement and applicable mandatory pre-merge acceptance criterion the PR claims to resolve is implemented and appropriately validated. Do not approve an incomplete solution as closing the Issue. An intentionally partial PR must say so, state its remaining scope, and leave the Issue open without an automatic closing reference. Pending post-merge-only verification does not make a complete implementation partial.
- **No unnecessary work:** reject unnecessary abstractions, speculative extensibility, unrelated refactoring, frameworks/subsystems, or extra policies/configuration without a demonstrated need tied to the Issue.

Prefer the smallest coherent design that fully satisfies the Issue. Added complexity is not automatically beneficial. Preserve justified existing conventions, and do not use simplicity to excuse omitted requirements or necessary validation.

Check correctness, consistency with the existing repository, and documentation affected by the change.

Review applicable interface changes against the [UI/UX principles](../README.md#uiux).

## Check validation and timing

Verify that the validation evidence is sufficient for the changed files and actual tooling. Check the reported results, including failures, skipped checks, and unperformed checks with their reasons. Do not accept an unperformed check as passing.

Apply the [test and CI performance principles](testing-ci-principles.md): **Does this change provide sufficient confidence with the lightest appropriate validation, without redundant execution?** For added or expanded tests, assess additional defect coverage, overlap with existing checks, and execution/maintenance cost together.

For application changes, use the relevant [documented checks](../README.md#validation), including real Docker launch/cleanup tests for lifecycle changes and browser tests for interaction/capture changes. For templates and documentation, inspect Markdown and template syntax, links, whitespace, and consistency; use available tooling such as `git diff --check`. Do not add tooling or require unrelated runtime suites, hardware/device checks, or deployed-site verification merely for documentation changes.

Require mandatory pre-merge acceptance to be achievable and verifiable before merge. Check that optional validation remains optional. Human confirmation, physical-device testing, subjective evaluation, or external approval should be required only when necessary for the actual Issue, with a reason and expected result.

Record genuinely necessary checks possible only after merge separately as required post-merge verification, pending until performed. Such checks must not be pre-merge approval conditions. For example, pre-merge evidence does not prove a merge-triggered deployment or publication succeeded. This timing distinction does not waive implementation requirements, mandatory pre-merge tests, required protections, or genuinely necessary pre-merge human acceptance.

## Choose the review outcome

- **Request changes:** for agent-fixable findings, identify the affected requirement or file, the problem, and the expected correction. Review the updated PR and relevant validation again after revision.
- **Wait for human input:** when a genuinely necessary human decision or confirmation is missing, record the specific question, why it blocks progress, and the expected answer or evidence. Enter the workflow's wait path and resume when the answer arrives. Keep this state distinct from agent-fixable findings; do not repeatedly request code fixes for missing human input.
- **Approve and merge:** when the implementation fully addresses the Issue it claims to resolve, scope and complexity are justified, mandatory pre-merge checks are sufficient and pass, and no blocking findings remain, approve and merge through the authorized workflow into `main`.

When these conditions are met, preserve the normal `Closes #N` reference. Do not request removing it, keeping the source Issue open, or withholding approval solely because post-merge-only verification is pending. ProjectWeave publication adds the closing reference; repeatedly rejecting it for this reason creates a Review → Fix → Publish → Review loop.

After successful merge, close the original Issue, then perform required post-merge verification under the [follow-up guidance](development-flow.md#5-merge-and-report-follow-up). Record accurate evidence and pending or environment-blocked checks in the merged PR, closed Issue, or linked validation report. Closure does not claim those checks passed. For actual defects, check for an equivalent Issue before creating a new linked Issue with the required reproduction details; do not reopen the original solely for follow-up. An unavailable test environment alone is not evidence of a defect. Apply the current lifecycle over older keep-open instructions while preserving historical results and evidence.
