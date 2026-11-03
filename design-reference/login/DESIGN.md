---
name: Alumni Mendunia SMK DKI Jakarta
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#444653'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#757684'
  outline-variant: '#c4c5d5'
  surface-tint: '#3755c3'
  primary: '#00288e'
  on-primary: '#ffffff'
  primary-container: '#1e40af'
  on-primary-container: '#a8b8ff'
  inverse-primary: '#b8c4ff'
  secondary: '#0051d5'
  on-secondary: '#ffffff'
  secondary-container: '#316bf3'
  on-secondary-container: '#fefcff'
  tertiary: '#003d28'
  on-tertiary: '#ffffff'
  tertiary-container: '#00563a'
  on-tertiary-container: '#5bcf9e'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dde1ff'
  primary-fixed-dim: '#b8c4ff'
  on-primary-fixed: '#001453'
  on-primary-fixed-variant: '#173bab'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#003ea8'
  tertiary-fixed: '#85f8c4'
  tertiary-fixed-dim: '#68dba9'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005137'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.05em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1.5rem
  margin: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system establishes a professional, trustworthy, and modern administrative environment tailored for the Alumni Mendunia SMK DKI Jakarta platform. The visual identity bridges institutional credibility with contemporary digital warmth, evoking pride, professional ambition, and global connectivity.

Adopting a refined Corporate / Modern aesthetic, the interface relies on clean neutral surfaces, deep indigo authority, and vibrant status indicators to deliver clarity across complex dashboard metrics, alumni directories, and global engagement trackers.

## Colors

The color palette is engineered for high legibility, professional gravitas, and intuitive status communication. The foundation rests on pristine neutral backgrounds (`#F8FAFC`) paired with crisp white card surfaces separated by subtle slate borders (`#E2E8F0`).

- **Primary:** Deep indigo (`#1E40AF` and `#2563EB`) commands authority, guiding primary actions, active navigation items, and key metric focal points.
- **Text:** Soft slate (`#334155` for body text, `#64748B` for secondary labels) ensures high-contrast readability without the harshness of pure black.
- **Accents:** Vibrant emerald (`#059669`) and amber (`#D97706`) are strictly reserved for pill badges, communicating active employment, global placement status, and pending verifications at a glance.

## Typography

Powered by Plus Jakarta Sans, the typographic scale establishes an approachable yet authoritative hierarchy suited for data-dense dashboards. Letter spacing is slightly tightened on prominent headings to project modern digital craftsmanship, while body weights remain balanced for extended scanning of alumni records, metrics, and regional placement reports.

## Layout & Spacing

This design system implements a fluid 12-column grid layout system that gracefully adapts across mobile, tablet, and desktop viewports.

- **Breakpoints:** Mobile (< 640px) stacks content in a single column with 1rem margins; Tablet (640px – 1024px) utilizes a 6-column sub-grid; Desktop (> 1024px) unlocks the full 12-column layout with 24px gutters and generous outer canvas margins.
- **Spacing Rhythm:** Built upon an 8px base unit scale (`space-xs` through `space-xl`), ensuring consistent vertical rhythm between dashboard widgets, metric cards, and data tables.

## Elevation & Depth

Visual hierarchy relies on a combination of crisp low-contrast outlines and soft ambient shadows. Cards and interactive containers utilize clean 1px borders (`#E2E8F0`) paired with diffused, low-opacity shadows (`0 4px 6px -1px rgba(30, 64, 175, 0.05)`) tinted with subtle indigo undertones. Elevated elements like dropdown menus, modals, and floating action panels apply deeper, layered shadow treatments to separate themselves cleanly from the neutral background canvas.

## Shapes

Adopting a friendly, approachable pill-shaped interactive language, the design system utilizes high border-radius values across clickable elements. Primary buttons, status badges, search inputs, and filter chips are fully pill-shaped (1rem to 9999px roundedness), contrasting pleasantly with the structured, softly rounded corners (0.75rem) of primary dashboard cards and containers.

## Components

### Buttons
Pill-shaped containers featuring deep indigo (`#1E40AF`) backgrounds with crisp white text for primary triggers. Secondary actions use ghost styles with subtle borders or transparent backgrounds that elevate on hover.

### Chips & Badges
Fully rounded pill badges featuring vibrant emerald (`#059669`) for active/verified statuses and amber (`#D97706`) for pending reviews, paired with matching soft background tints.

### Input Fields
Pill-shaped text inputs and search bars featuring neutral borders (`#E2E8F0`), soft slate placeholder text, and clear focus states utilizing primary indigo rings.

### Cards
Crisp white surfaces (`#FFFFFF`) enclosed by subtle slate borders, housing metric summaries, alumni profile snippets, and regional distribution charts.

### Tables & Lists
Clean data rows featuring alternating hover states, clear column alignments, and compact padding for high-density alumni directory scanning.

### Checkboxes & Radios
Refined square and circular selectors featuring indigo accent fills and smooth check/dot transitions.
