# Product Requirements Document (PRD): Shifd Marketing
**Document ID:** `PRD-SHIFD-MKT-2025.4`  
**Classification:** Enterprise Internal B2B SaaS / GovTech SaaS  
**Author:** Product & Architecture Team (for Reza, Founder @ Shifd Labs)  
**Status:** Approved & Verified (`RSA-SHA256 SIGNED`)  
**Design System Anchor:** `Precision Executive` (`Inter` + `JetBrains Mono`, Royal Blue `#1d4ed8`)

---

## 1. Executive Summary & Vision
**Shifd Marketing** is an internal, mission-critical B2B generative marketing engine engineered specifically for **Shifd Labs**—a defense/GovTech-compliant sovereign software laboratory. 

Unlike consumer-grade social media schedulers or generic AI copywriting tools that produce generic, buzzword-heavy content, Shifd Marketing acts as a **Deterministic Content Pipeline**. It grounds every content angle directly into verified company IP, a live 9-box Business Model Canvas (BMC), real municipal/defense RFP statutes, and cryptographic audit trails before anything can be dispatched or queued for publishing.

### 1.1 Core Value Proposition
- **Verifiable Digital Chain-of-Custody:** Zero unvetted marketing copy or hallucinatory claims reach high-stakes government or enterprise procurement decision-makers.
- **80% Faster Turnaround:** Cuts executive thought-leadership drafting latency from 45 days (traditional agency/memo cycle) to under 48 hours.
- **Mathematical Auditability:** Every slide, paragraph, and hook is cross-referenced with NIST SP 800-53 compliance rules and certified with RSA-SHA256 founder signatures.

---

## 2. Target Personas & Stakeholders

| Persona | Role | Primary Goals | Key Pain Points Solved |
| :--- | :--- | :--- | :--- |
| **Reza (Primary User)** | Founder & CEO, Shifd Labs | Maintain regular authoritative B2B presence (2x/week), review verified drafts, sign off on dispatches without manual writing friction. | Lack of time, fear of brand dilution, risk of unvetted AI buzzwords damaging GovTech credibility. |
| **Municipal Bureau Chiefs & Procurement Officers (Audience)** | Public Sector Buyers | Identify trustworthy, air-gapped sovereign digital signature & workflow solutions. | Skeptical of marketing fluff; demand statutory compliance, transparent ROI, and zero-trust security architecture. |
| **Enterprise Compliance & Legal Leads (Audience)** | Regulated Private Sector Buyers | Ensure digital workflow products meet strict audit trails and SLA requirements. | Intolerant of compliance gaps; need mathematical guarantees of provenance. |

---

## 3. Product Architecture: The 4-Tier Deterministic Pipeline (M1–M4)

The platform runs on a sequential execution pipeline anchored by Claude 3.5 Sonnet and a `pgvector` knowledge graph:

```
[ Tier M1: Context Engine Grounding ]
        │ (Ingests 480k municipal statutes, verified BMC metrics, product datasheets)
        ▼
[ Tier M2: Angle & Hook Generator ]
        │ (Cross-matches angles with C-suite buyer personas; eliminates consumer clickbait)
        ▼
[ Tier M3: Multi-Format Composer ]
        │ (Generates high-density LinkedIn briefs, 5-slide technical Instagram carousels, whitepapers)
        ▼
[ Tier M4: Sovereign Compliance Auditor & Gate ]
        │ (Purges blacklisted buzzwords, validates NIST compliance, enforces founder RSA sign-off)
        ▼
[ Dispatch Channels: LinkedIn API, Meta Graph, WhatsApp Buyer Radar ]
```

---

## 4. Functional Specification & Feature Modules

### Module 1: Platform Overview & Cockpit (`Overview`)
- **Executive Health Metrics:** MTD Token usage, verified ARR pipeline density ($4.2M booked), publishing cadence adherence (2x/week pace), and live RAG grounding match percentage (>98%).
- **Queue Status:** Pending Founder Sign-Offs, Ready to Stage items, and Live Distribution telemetry.
- **Quick Action Bar:** 1-click prompt synthesis simulation, manual metric sync, and new brief initiation.

### Module 2: Content Studio
- **Content Ideas (`Content Ideas`):** Signal-driven brainstorming matrix categorized by pillars (*Thought Leadership, Product Architecture, GovTech Case Studies*).
- **Composer & Brief Creator (`Create Content - Brief`):** 4-step guided creation flow binding target persona, bound product entity (`Shifd Approval v2.4` / `Shifd Dossier`), and output formats.
- **Content Library (`Content Library`):** Central repository of approved, draft, and staged marketing assets with filtering by channel, status, and compliance tier.
- **Creative Assets Engine (`Creative Assets`):** High-DPI slide deck generator, technical diagram compiler, and vector graphic library.
- **Content Detail & Deep Audit (`Content Detail & Audit`):**
  - Interactive 5-slide carousel preview (Slide 1 Hook to Slide 5 CTA).
  - Dual-pane copy buffer for LinkedIn & Instagram captions with automated character counts.
  - Telemetry drawer tracking model latency (ms), token burn ($), and immutable audit logs.

### Module 3: Planning & Insights
- **Content Calendar (`Content Calendar`):** Bi-weekly cadence scheduler enforcing steady 2x/week distribution rhythm across Tuesday/Thursday peak enterprise engagement windows.
- **Marketing Performance (`Marketing Performance`):**
  - Impression tracking, qualified inbound engagement, and follower growth analytics.
  - Inbound buyer signal counter (WhatsApp RFPs and pilot procurement requests).

### Module 4: Context Engine
- **Company Context (`Company Context`):** Immutable source of truth for company vision, brand voice rules, and strict negative constraints.
- **Interactive Business Model Canvas (`Business Model Canvas`):** 9-box interactive matrix (`KP-01` through `RS-09`) directly wired into LLM system prompts for dynamic prompt grounding.
- **Products Catalog (`Products`):** Specifications, security whitepapers, and verifiable feature matrices for Shifd products.
- **Brand Kit & Architecture (`Brand Kit & Architecture`):** Formal token design system, WCAG AAA accessibility matrix, approved terminology dictionary, and UI primitive specimens.

### Module 5: System & Security Infrastructure
- **Integrations & Data Feeds (`Integrations`):**
  - OAuth handshakes for LinkedIn and Instagram Meta Graph API v19.0.
  - **Mandatory Guardrail:** Zero unmoderated auto-posting; all API dispatches require cryptographic founder key verification.
  - Inbound WhatsApp Business API webhook listener for capturing inbound enterprise buyer signals.
  - HubSpot CRM / GovCloud Lead Export connector.
- **AI Models & Prompt Guardrails (`AI & System`):**
  - Primary engine configuration (Claude 3.5 Sonnet, Temperature 0.20 for low variance).
  - Fallback engine (Claude 3 Haiku for rapid hook ideation).
  - **Anti-Fluff & Buzzword Sanitizer:** Automatic purge of banned consumer terms (*"revolutionize"*, *"game-changer"*, *"unleash"*, *"magical AI"*).
  - Token consumption budget tracker ($50.00 MTD cap).

---

## 5. Non-Functional Requirements (NFRs)

### 5.1 Security & Compliance
- **Cryptographic Signatures:** Every dispatch packet must be signed using RSA-SHA256 (`Reza (Founder)`).
- **Data Protection:** Zero training on customer prompts; FedRAMP-aligned encryption at rest and in transit via AWS KMS HSM isolation.
- **Auditability:** Immutable append-only audit trail for every generated variant and founder approval.

### 5.2 Performance & Reliability
- **Inference Latency:** M1–M4 pipeline turnaround < 1,500ms for short briefs, < 4,000ms for 5-slide carousel visual compilation.
- **System Availability:** 99.4% uptime SLA on API webhook listeners and database vector searches.
- **Accessibility:** 100% WCAG 2.1 AAA contrast compliance across all UI text tokens.

---

## 6. Success Metrics & KPIs

| Metric | Baseline | Target (Q3 2025) | Measurement Method |
| :--- | :--- | :--- | :--- |
| **Publishing Cadence Consistency** | Irregular (1x/month) | Strict 2x / week (8x/mo) | Content Calendar Automated Tracker |
| **Founder Draft Turnaround Time** | 4.5 hours / post | < 12 minutes / post | Time from M1 Generation to RSA Signature |
| **RAG Grounding Accuracy** | 82.0% | > 98.0% | Sovereign Compliance AST Analyzer |
| **Buzzword Contamination Rate** | 14.2% (Raw LLM) | 0.0% (Zero Tolerance) | GovTech Fluff Sanitizer Pass Rate |
| **Qualified Inbound Buyer Signals** | 3 / quarter | 15+ / quarter | WhatsApp & HubSpot Inbound Webhooks |

---

## 7. Roadmap & Future Horizons
1. **Phase 1 (Completed):** Core 14-screen desktop application, interactive BMC integration, token system, and cryptographic verification protocol.
2. **Phase 2 (Current):** Mobile quick-dispatch drawer for founder sign-off on the go.
3. **Phase 3 (Next):** Direct FedRAMP marketplace syndication and multi-agency RFP semantic parser.
