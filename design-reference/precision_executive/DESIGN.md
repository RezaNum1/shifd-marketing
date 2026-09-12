---
name: Precision Executive
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#434655'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#747686'
  outline-variant: '#c4c5d7'
  surface-tint: '#2151da'
  primary: '#0037b0'
  on-primary: '#ffffff'
  primary-container: '#1d4ed8'
  on-primary-container: '#cad3ff'
  inverse-primary: '#b7c4ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#004f35'
  on-tertiary: '#ffffff'
  tertiary-container: '#006948'
  on-tertiary-container: '#76eab6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b7c4ff'
  on-primary-fixed: '#001551'
  on-primary-fixed-variant: '#0039b5'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#85f8c4'
  tertiary-fixed-dim: '#68dba9'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005137'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.03em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  space-2: 0.125rem
  space-4: 0.25rem
  space-8: 0.5rem
  space-12: 0.75rem
  space-16: 1rem
  space-20: 1.25rem
  space-24: 1.5rem
  space-32: 2rem
  space-40: 2.5rem
  space-48: 3rem
  gutter-desktop: 1.5rem
  gutter-tablet: 1rem
  margin-shell: 1.5rem
---

## Brand & Style

This design system establishes an intelligent, tranquil, and highly structured workspace tailored for enterprise-grade marketing orchestration and AI-assisted execution. The target audience comprises senior marketing operations leads, product marketing managers, and executive stakeholders who require high data density without cognitive overload.

The aesthetic fuses **Corporate / Modern** precision with architectural **Minimalism**:
- **Tone & Mood:** Methodical, trustworthy, quiet, and executive.
- **Visual Stance:** Utilitarian clarity over decoration. Zero loud consumer gradients, neon glows, or visual gimmickry.
- **Design Metaphor:** Precision instrument panels and structured editorial broadsheets—surfaces are flat or subtly elevated, separated by hairline borders rather than heavy shadows.

## Colors

The palette is engineered for prolonged analytical focus, relying on high-key neutrals and restrained semantic accents:

- **Canvas & Surface Tier:**
  - `Base Canvas`: `#FAFAFA` (Soft warm-gray foundation preventing eye strain)
  - `Card / Sheet Surface`: `#FFFFFF` (Crisp container background)
  - `Subtle / Inactive Well`: `#F1F5F9` (Data tables, input backgrounds, and segmented controls)
  - `Hairline Structural Border`: `#E2E8F0`

- **Primary Action (Enterprise Blue):**
  - Anchor: `#1D4ED8` (Solid interactive states, key CTAs, and selected tabs)
  - Hover / Pressed: `#1E40AF`
  - Subtle Surface / Tint: `#EFF6FF` (Subtle selection highlights, active badge backgrounds)

- **Typography & Dark Neutrals:**
  - `Text Primary`: `#0F172A` (Deep slate for maximum legibility on high-density displays)
  - `Text Secondary`: `#334155` (Subheadings, table labels, active icons)
  - `Text Muted / Tertiary`: `#64748B` (Supporting metadata, timestamps, disabled indicators)

- **Discrete Status Indicators:**
  - `Success / Approved / Published`: `#059669` (Surface tint: `#ECFDF5`, Border: `#A7F3D0`)
  - `Warning / Review Required`: `#D97706` (Surface tint: `#FFFBEB`, Border: `#FDE68A`)
  - `Informational / Scheduled`: `#0284C7` (Surface tint: `#F0F9FF`, Border: `#BAE6FD`)
  - `Neutral / Draft / Archived`: `#64748B` (Surface tint: `#F8FAFC`, Border: `#E2E8F0`)

## Typography

Typography relies uniformly on **Inter** to ensure maximum structural legibility across compact enterprise tabular views, workflows, and analytic dashboards. 

- **Weight Discipline:** Restrict font weights strictly to `400` (Regular), `500` (Medium), and `600` (Semi-bold). Avoid bold weights (`700+`) to maintain an uncluttered executive appearance.
- **Tabular Figures:** Always apply `font-feature-settings: "tnum" 1` to metrics, tables, currency, and AI confidence ratings to ensure uniform vertical alignment.
- **Microcopy Hierarchy:** `label-sm` is rendered in uppercase with deliberate tracking (`+0.03em`) when serving as section categorizers, table headers, or contextual AI metadata tags.

## Layout & Spacing

The dashboard employs an adaptive **Fluid Grid** framework structured around a rigid 4px/8px mathematical base unit:

- **Application Shell Architecture:**
  - Fixed Collapsible Sidebar: `240px` (Expanded) / `64px` (Collapsed).
  - Main Canvas Area: Fluid `100%` width with a max-bound constraint of `1600px` for high-density widescreen monitors.
  - Secondary Contextual Inspector / AI Assistant Panel: Fixed `360px` docked to the right edge.

- **Breakpoints & Adaptation:**
  - **Desktop (1280px+):** Multi-column workbench (12-column layout, 24px gutters). Sidebars, main grid, and right-hand inspector coexist simultaneously.
  - **Tablet (768px - 1279px):** Inspector drawer switches to an overlay trigger; fluid layout adapts to 8 columns with 16px gutters.
  - **Mobile (< 768px):** Single-column stacked layouts, sidebar collapses into a slide-out navigation sheet, 16px screen padding.

- **Spacing Rhythms:**
  - Dense component internal spacing: 8px and 12px.
  - Card internal padding: 16px or 20px.
  - Section structural gaps: 24px or 32px.

## Elevation & Depth

Visual hierarchy is constructed primarily through **Low-Contrast Outlines** and subtle **Tonal Layers**, preserving an analytical and uncluttered surface feel:

- **Surface Elevation Levels:**
  - `Canvas Tier (L0)`: `#FAFAFA` (Root window).
  - `Card / Sheet Tier (L1)`: `#FFFFFF`, bounded by a single 1px solid `#E2E8F0` border. No drop shadow.
  - `Floating Popover / Dropdown (L2)`: `#FFFFFF`, 1px border `#E2E8F0`, with an ambient soft-tinted shadow: `0 4px 12px -2px rgba(15, 23, 42, 0.06), 0 2px 4px -1px rgba(15, 23, 42, 0.04)`.
  - `Modal Dialog / Overlay (L3)`: `#FFFFFF`, 1px border `#CBD5E1`, with elevation shadow: `0 20px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.03)`. Backdrops use `rgba(15, 23, 42, 0.35)` with an ultra-light blur (`backdrop-filter: blur(2px)`).

- **Depth Rules:** 
  - Never stack shadowed cards on top of shadowed cards.
  - Use contrast borders (`#E2E8F0` against `#FFFFFF`) rather than heavy drop shadows to communicate object boundaries.

## Shapes

The design system uses a controlled **Soft (`1`)** shape logic, utilizing subtle rounded geometry to maintain enterprise authority without harsh industrial corners:

- **Core Geometry Hierarchy:**
  - Base Micro Elements (`0.25rem / 4px`): Checkboxes, progress bar tracks, tooltips, and compact table tags.
  - Standard UI Elements (`0.375rem / 6px` to `0.5rem / 8px`): Input fields, buttons, dropdown triggers, and status badges.
  - Containers (`0.5rem / 8px` to `0.75rem / 12px`): Dashboard cards, summary metric tiles, table enclosures, and modal panels.
  - Avatar & Floating Status Dots: Full circular radius (`9999px`).

## Components

### Buttons
- **Primary:** Background `#1D4ED8`, text `#FFFFFF`, border none, 8px border radius. Hover: `#1E40AF`. Active: `#1E3A8A`.
- **Secondary / Outline:** Background `#FFFFFF`, text `#0F172A`, 1px border `#E2E8F0`. Hover: `#F8FAFC` and border `#CBD5E1`.
- **Ghost / Subtle:** Background transparent, text `#334155`. Hover: `#F1F5F9`.
- **Sizes:** Compact (32px height, 12px padding, `13px` type) for dense toolbars; Default (38px height, 16px padding, `14px` type) for standard forms.

### Chips & Status Badges
- **Structure:** 22px fixed height, pill shape or 6px radius, padding 2px 8px, font `11px` weight `600`, uppercase optional.
- **Approved / Active:** Surface `#ECFDF5`, text `#059669`, border 1px solid `#A7F3D0`. Includes a 6px solid emerald dot prefix.
- **In Review:** Surface `#FFFBEB`, text `#D97706`, border 1px solid `#FDE68A`.
- **Scheduled:** Surface `#F0F9FF`, text `#0284C7`, border 1px solid `#BAE6FD`.
- **Draft:** Surface `#F8FAFC`, text `#64748B`, border 1px solid `#E2E8F0`.

### Cards & Data Panels
- **Container:** Background `#FFFFFF`, border 1px solid `#E2E8F0`, radius `8px`.
- **Header:** Padding 16px 20px, bottom hairline divider 1px solid `#F1F5F9`, title using `headline-sm` with right-aligned action slots (filters, export, refresh).
- **Body:** 20px padding. Zero external shadow in neutral resting state.

### Input Fields & Controls
- **Text Inputs & Dropdowns:** 36px height, background `#FFFFFF`, border 1px solid `#CBD5E1`, radius `6px`, text `#0F172A`, placeholder `#94A3B8`. Focus state: 1px solid `#1D4ED8` with a 2px outer ring in `#DBEAFE`.
- **Checkboxes & Radios:** 16px dimension, border 1px solid `#CBD5E1`, selected background `#1D4ED8` with white glyph, focus-visible outline `#DBEAFE`.

### Tables & Data Grids
- **Header Row:** Background `#F8FAFC`, bottom border 1px solid `#E2E8F0`, type `label-sm` (`#475569`), padding 10px 16px.
- **Data Rows:** Background `#FFFFFF`, height 44px, bottom border 1px solid `#F1F5F9`, alternating hover background `#F8FAFC`. All metrics set in tabular numerals.

### Domain-Specific: AI Execution & Generation Units
- **Prompt / Copilot Bar:** Background `#FFFFFF`, 1px solid `#CBD5E1`, shadow `0 2px 6px -1px rgba(15, 23, 42, 0.05)`, containing a subtle blue gradient accent spark icon (`#1D4ED8`) denoting generative intelligence without visual distraction.
- **AI Suggestion Box:** Background `#F8FAFC`, left border 3px solid `#1D4ED8`, 12px padding, accompanied by inline `Accept` (Text `#1D4ED8`) and `Dismiss` (`#64748B`) actions.