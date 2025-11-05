# Phase 47: CRM Fields Mapped to Exit Criteria

## Core CRM Fields
- **vertical**: newsroom | ads_eu | marketplace
- **stack_cdn**: cloudflare | fastly | akamai | other
- **stack_cms**: wordpress | shopify | custom | other
- **eu_article_50_exposure**: true/false
- **asset_volume_monthly**: number
- **pilot_scope**: confirmed/pending/declined
- **decision_date**: YYYY-MM-DD
- **value_owner**: brand_safety | compliance | editorial_ops
- **champion**: contact_name
- **survival_baseline_%**: current measurement
- **survival_target_%**: ≥99.9
- **caiverify_links**: array of proof URLs
- **pricing_tier**: starter | pro | enterprise
- **contract_limit_$**: pilot budget
- **pilot_status**: scheduled | active | completed | cancelled

## Reports & Dashboards

### Time to Pilot
- Formula: decision_date - first_contact_date
- Target: ≤30 days
- Filter by vertical and stack

### Pilot → Paid Rate
- Formula: converted_pilots / total_pilots
- Target: ≥60%
- Segment by pricing tier

### Survival Lift
- Formula: survival_target_% - survival_baseline_%
- Target: ≥20% improvement
- Track by CDN/CMS combination

### EU-Exposed Deals
- Count: eu_article_50_exposure = true
- Conversion rate vs non-EU
- Average contract value

### Asset Views on Demo
- Track: demo_microsite_tile_clicks
- Correlate: tile_clicks → pilot_conversion
- Optimize: hook effectiveness by vertical

## Automation Rules
- **High Priority**: eu_article_50_exposure = true + asset_volume_monthly > 1000
- **Fast Track**: stack_cdn = cloudflare + stack_cms = wordpress
- **Nurture**: pilot_scope = pending + decision_date > 60 days
- **Closed Lost**: red_flags > 2 OR decision_date > 90 days
