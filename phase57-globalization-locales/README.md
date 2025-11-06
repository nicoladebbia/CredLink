# Phase 57 — Globalization & Locales (v1.2, ship-ready)

## Purpose (tight)
Sell outside English-first markets without breaking survival guarantees. Internationalize the badge UI, docs, and onboarding across the top 8 locales; add RTL support; wire locale-specific compliance notes; and default to correct date/number formats per locale. Keep translations fresh with translation memory + professional review and catch layout regressions with visual diff tests, including RTL.

## Hard decisions (copy-paste)

### 1) Target locales (L1 wave; pick by traffic & ICP)
- **Locales:** `en`, `es`, `pt-BR`, `fr`, `de`, `it`, `ja`, `zh-CN`, `ar` (RTL)
- Use **BCP-47 tags** end-to-end (routing, `<html lang>`, build output, SDK docs)
- Reference: [W3C Language Tags](https://www.w3.org/International/articles/language-tags/)

### 2) RTL correctness (badge + docs)
- Add `dir="rtl"` at container scope for Arabic locales
- Prefer **logical CSS** (`margin-inline`, `padding-inline`, `start/end` icons)
- For mixed LTR/RTL strings, set per-span `dir` or use Unicode bidi controls in non-markup contexts
- Reference: [W3C RTL Guidelines](https://www.w3.org/International/questions/qa-html-dir)

### 3) Fonts & glyph coverage
- Ship **Noto** as the default pan-script stack (subsetted per page), falling back to system fonts
- Ensures consistent rendering across >1,000 languages/150+ scripts and prevents "tofu"
- Reference: [Google Fonts Noto](https://fonts.google.com/noto)

### 4) Dates, numbers, and ranges
- Use **ECMA-402 Intl** (`Intl.DateTimeFormat`, `Intl.NumberFormat`) with locale from BCP-47
- Prefer `formatRange()` for date intervals in dashboards
- Reference: [MDN Intl API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)

### 5) Messages & plurals
- All UI and badge copy in **ICU MessageFormat** (plural/select rules) backed by CLDR
- Never concatenate strings
- Reference: [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/)

### 6) Accessibility and SEO signals
- Set `<html lang="…">` and apply **WCAG 2.1 3.1.2 Language of Parts** for inline quotes/code in other languages
- Publish localized docs with proper `hreflang` (`x-default`, regional variants) so they're discoverable in Search
- Reference: [W3C Language Declaration](https://www.w3.org/International/questions/qa-html-language-declarations)

---

## Architecture & implementation (precise)

### A) Locale wiring (web apps, badge, docs)
**Runtime locale:**
- `Accept-Language` → BCP-47 negotiation → user choice override (persist in storage & server session)

**Build:**
- One artifact per locale for docs
- UI bundles load per-locale JSON catalogs (`*.icu.json`) with checksum gating

**Badge web component:**
- Props: `lang`, `dir` (auto from lang), `numeral-locale`, `date-style`
- The component renders with:
  ```html
  <html lang={xx-YY} dir={rtl|ltr}> on shadow root container
  ```
- Uses:
  - `Intl.DateTimeFormat(lang, { dateStyle: 'medium' })`
  - `Intl.NumberFormat(lang, { notation: 'compact' })`

### B) Message catalogs (ICU)
**File shape:**
```json
{
  "badge.disclosure": "{count, plural, one {Content Credential} other {Content Credentials}}",
  "verify.status": "{status, select, ok {Verified} fail {Failed} other {Unknown}}"
}
```

**Validation:**
- Compile at CI using ICU parser
- Fail on missing keys
- Fallback chain: `zh-CN` → `zh` → `en`

### C) RTL & visual safety
- CSS uses **logical properties**
- Iconography mirrored via `transform: scaleX(-1)` behind `[dir=rtl]` gates
- **Pseudo-localization** CI job:
  - Expands strings (`[!! Áé… !!]`)
  - Adds bidi stress chars
  - Lengthens by 30% to catch overflows

### D) Fonts & performance
- Ship **Noto subsets** per script (WOFF2)
- Preload primary subset per locale
- Defer emoji set
- Keep FOUT acceptable with `font-display: swap`

### E) Docs localization & discoverability
**Foldering:** `/docs/<lang-BCP47>/…`

Every page includes:
```html
<link rel="alternate" hreflang="x-default" href="/docs/en/" />
<link rel="alternate" hreflang="es" href="/docs/es/" />
<link rel="alternate" hreflang="pt-BR" href="/docs/pt-BR/" />
<link rel="alternate" hreflang="fr" href="/docs/fr/" />
<link rel="alternate" hreflang="de" href="/docs/de/" />
<link rel="alternate" hreflang="it" href="/docs/it/" />
<link rel="alternate" hreflang="ja" href="/docs/ja/" />
<link rel="alternate" hreflang="zh-CN" href="/docs/zh-CN/" />
<link rel="alternate" hreflang="ar" href="/docs/ar/" />
```

- Canonical per-locale
- Sitemap includes all alternates

### F) Compliance snippets per locale
- Localize required disclosure/policy text
- Mark legal copy for **professional review only** (no machine-only merges)
- Append region notes (e.g., EU ad transparency phrasing) beneath each snippet in its language
- Maps to Phase 48 compliance requirements

---

## QA & automation

### Coverage gate
- CI fails if a shipped locale < 90% string coverage or has ICU compile errors

### Linguistic QA
- **Professional review** for legal/compliance strings
- **Community review** for developer docs

### Functional RTL QA
- Visual diff snapshots for `ar` across badge states and top docs layouts
- Check caret placement, number/date rendering, and icon mirroring

### Accessibility QA
- Verify `<html lang>` and Language of Parts where mixed content appears

---

## Copy/format examples (drop-in)

### ICU plural (verification count)
```
{n, plural, one {# verification today} other {# verifications today}}
```
→ localized via CLDR rules

### Date range
```javascript
new Intl.DateTimeFormat(lang, { dateStyle: "medium" })
  .formatRange(startDate, endDate)
```

---

## Ops & metrics (what you track)

### Locale adoption
- % traffic per locale
- Time-to-first-verify in docs per locale

### String freshness
- Age of last translation vs source
- Open issues per locale

### SEO
- Localized docs impressions/clicks
- `hreflang` errors (Search Console)

---

## Exit tests (binary)

1. ✅ **≥90% translation coverage** across chosen locales (ICU compile passes; fallback gaps logged)
2. ✅ **Locale QA signed off** (linguistic + functional + RTL visual diffs)
3. ✅ **One non-English pilot completes** with zero translation blockers (badge, onboarding, docs)
4. ✅ **Localized docs are discoverable** (`hreflang` present; Search Console shows indexed alternates)

---

## Risks → mitigations

### Stale translations
- **Mitigation:** CI gate on coverage; translation memory and termbase; scheduled batch drops; professional review for legal strings
- ICU/CLDR keeps plurals correct across locales

### Layout breaks (especially RTL)
- **Mitigation:** Pseudo-loc + visual diffs for `ar`; enforce logical CSS + `dir` usage per W3C guidance

### Glyph gaps
- **Mitigation:** Noto subsets by script + fallbacks; test "tofu" elimination

---

## Bottom line
BCP-47 + ICU/CLDR + Intl formatting + Noto + W3C-correct RTL handling yields a predictable, accessible global experience—measured, testable, and ready for non-English pilots without surprises.

---

## References
- [W3C Internationalization](https://www.w3.org/International/)
- [Unicode CLDR](https://cldr.unicode.org/)
- [MDN Intl API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)
- [Google Fonts Noto](https://fonts.google.com/noto)
- [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/)
