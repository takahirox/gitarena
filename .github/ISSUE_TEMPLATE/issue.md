---
name: Issue
about: Report a problem or propose a change
title: ""
labels: ""
---

<!-- Write the title and body in English. See https://github.com/takahirox/gitarena/blob/main/docs/development-flow.md -->

## Problem

Describe the problem and who or what it affects.

## Expected outcome

Describe what should be true when this Issue is resolved.

## Context and reproduction

Add relevant context, examples, logs, or related Issues. Include reproduction steps, the affected revision, and actual versus expected behavior where applicable. For a defect discovered after merge, follow the [linked-Issue guidance](https://github.com/takahirox/gitarena/blob/main/docs/development-flow.md#5-merge-and-report-follow-up).

## Pre-merge acceptance criteria

List concrete, mandatory criteria that can be achieved and verified before merge. Default to checks an AI agent can execute and verify. Require human confirmation, physical-device testing, subjective evaluation, or external approval only when necessary for this Issue; explain why and what result is expected.

- [ ] Replace with a verifiable completion criterion.

Checks possible only after merge must not be conditions for pre-merge approval. See the [Issue authoring guidance](https://github.com/takahirox/gitarena/blob/main/docs/development-flow.md#1-start-with-an-issue).

## Optional validation

List useful but nonmandatory checks separately, or state "None."

## Required post-merge verification

Record genuinely necessary checks possible only after merge, or state "None." Do not add these routinely. Keep them pending until performed; pre-merge validation does not prove publication or deployment succeeded. See the [review guidance](https://github.com/takahirox/gitarena/blob/main/docs/review-guidelines.md#check-validation-and-timing).

These checks follow successful merge and closure of the implemented Issue; closure does not claim they passed. Record evidence and track discovered defects under the [follow-up guidance](https://github.com/takahirox/gitarena/blob/main/docs/development-flow.md#5-merge-and-report-follow-up).
