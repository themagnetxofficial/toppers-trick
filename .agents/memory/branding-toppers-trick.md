---
name: ToppersTrick branding
description: Brand name, logo files, and placement across the app
---

## Brand

- **Name:** ToppersTrick (not "Smart Study" / "Smart Study Guide")
- **Logo:** Navy (#0F1F3C) square with white T+necktie mark
- **Source file:** `attached_assets/toppers_trick_logo_1786951230722.png`
- **Deployed to:**
  - `artifacts/smart-study-guide/public/icon.png` — favicon + OG image + all UI headers
  - `artifacts/smart-study-guide/public/logo.png` — Clerk auth modal logo
  - `artifacts/smart-study-guide/public/favicon.svg` — SVG favicon approximating the mark
  - `artifacts/api-server/src/assets/icon.png` — PDF header logo (pdfkit embed)

## Placement

| Location | Implementation |
|---|---|
| Landing page header | `<img src="/icon.png">` + "ToppersTrick" text |
| Landing page footer | same |
| Public pages header/footer | `public-layout.tsx` |
| Authenticated sidebar | `shell.tsx` |
| Admin sidebar | `admin-shell.tsx` |
| Clerk sign-in/up modal | `logo.png` via `clerkAppearance.options.logoImageUrl` in `App.tsx` |
| PDF header | `pdfService.ts renderHeader()` — navy bar + logo + "ToppersTrick" in white |
| Browser tab favicon | `favicon.svg` + `icon.png` (16/32/180) in `index.html` |
| OG/Twitter image | `icon.png` in `index.html` meta tags |

## Gotchas

- Clerk modal title ("Sign in to Study Guide Analyzer") is set in the Clerk dashboard, not in code — change it there.
- The blog page has an editorial headline "Study Smart" (not the brand name) — intentionally left.
- `landing.tsx` has its own standalone header/footer (not `PublicLayout`) — both must be updated independently.
- When adding logo img tags, use `className="rounded-md"` to match the square logo with subtle rounding.

**Why:** Consistent brand identity across all user touchpoints (public, auth, admin, PDF, social share).
