# Shifd Marketing — Design Rules

## Purpose

The Google Stitch exports are the primary visual references for the application,
but they should not be treated as infallible pixel-perfect specifications.

The frontend implementation should preserve the intended visual identity while
resolving inconsistencies and unclear UX across generated Stitch screens.

---

## Design Source Priority

When references conflict, use the following priority:

1. Product behavior defined in docs/PRD.md
2. Product and technical constraints defined in docs/IMPLEMENTATION_NOTES.md
3. Shared design language established by the majority of Stitch screens
4. Individual screen.png reference
5. Individual code.html reference
6. Developer judgment for usability and consistency

The generated HTML is an implementation reference, not production source code.

Do not blindly copy generated HTML.

---

## Allowed Design Improvements

Codex MAY improve the Stitch design without asking when the change is minor and
clearly improves cross-screen consistency.

Examples:

- normalize spacing
- normalize field heights
- normalize button sizes
- normalize typography
- normalize border radius
- normalize card styles
- normalize sidebar dimensions
- normalize status badges
- fix alignment issues
- improve responsive behavior
- correct obviously inconsistent margins
- improve form hierarchy
- improve empty/loading/error states
- improve accessibility
- reuse consistent components instead of reproducing inconsistent generated markup

---

## Changes Requiring User Approval

Do NOT independently change:

- application navigation structure
- primary user workflow
- information architecture
- required form fields
- major page layout concept
- product features
- content lifecycle
- human approval behavior
- supported platforms
- core research/product scope

If such a conflict exists, report it before implementing the change.

---

## Cross-Screen Consistency Rule

When two Stitch screens conflict visually, prefer the pattern that:

1. appears more frequently across the application,
2. has clearer usability,
3. fits the established design system,
4. requires fewer one-off components.

Do not preserve inconsistency simply because it exists in one generated screen.

---

## Design Decision Logging

When Codex intentionally deviates from a Stitch reference to improve consistency,
record the decision in:

docs/DESIGN_DECISIONS.md

Include:

- affected screen
- original inconsistency
- chosen implementation
- reason

Minor pixel adjustments do not need individual documentation.