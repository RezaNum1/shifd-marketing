# Shifd Marketing — Implementation Notes

## Current Development Phase

The current implementation phase is FRONTEND ONLY.

Use local mock data.

Do not implement:
- backend APIs
- Claude API
- OpenAI API
- real authentication
- database persistence
- social media APIs

The frontend should be built so that mock data can later be replaced by API services
without redesigning the UI.

---

## Core Product Workflow

The primary content workflow is:

Context
→ Idea
→ Brief
→ Generate
→ Adapt
→ Creative
→ Review
→ Approve
→ Schedule
→ Manual Publish
→ Measure

Inside the Create Content experience, the user-facing steps are:

1. Brief
2. Generate
3. Adapt
4. Creative
5. Review
6. Schedule

---

## Creative Production

The system does NOT generate final marketing images.

The AI workflow provides:
- marketing content
- platform-specific copy
- visual direction

The final visual creative is produced manually using an external design tool such as Canva.

The user exports PNG/JPG assets and uploads them back into Shifd Marketing.

The Creative step must therefore support:
- PNG/JPG upload
- preview
- multiple-image carousel
- ordering
- removal/replacement
- separate Instagram and LinkedIn assets
- reuse Instagram creative for LinkedIn

During the frontend prototype phase, uploaded files must use browser-local previews only.

---

## AI and Human Review

AI-generated brand consistency assessments are advisory.

AI must never appear to provide final approval.

Final approval is always a human action.

If an alignment warning is overridden, the user must provide a justification.

---

## Social Platforms in Scope

- Instagram
- LinkedIn

WhatsApp Business is used only for supplementary inbound inquiry tracking.

---

## Publishing

Publishing is manual.

The application may:
- schedule content
- display content ready for publication
- allow copying captions
- display creative assets
- record that content has been published

The application must NOT automatically publish content to Instagram or LinkedIn.

---

## Current Product Boundaries

Do not add:

- automatic posting
- AI image generation
- Canva API integration
- social inbox
- automatic message replies
- social listening
- competitor monitoring
- trend forecasting
- CRM
- email outreach automation
- SEO tools
- billing
- subscription plans
- SSO