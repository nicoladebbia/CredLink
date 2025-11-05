# Phase 48 - Compliance v2 Scope Gates

## Purpose
Broaden legal mapping without bloating product. Extend assertion presets + reporting to cover multiple jurisdictions with unified compliance packs.

## Supported Jurisdictions & Requirements

### EU (Core Support)

#### AI Act 2024/1689 Article 50
- **Requirement**: Label AI-generated/altered content
- **Implementation**: Include disclosures in UI/ad copy and logs
- **Legal Reference**: EUR-Lex - [2024/1689](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689)
- **Status**: ✅ SHIP-READY

#### DSA 2022/2065
- **Art. 26**: Ad transparency (who paid, why shown)
- **Art. 27**: Recommender system parameters disclosure
- **Art. 39**: VLOP ad repositories (CSV export)
- **Art. 42**: Transparency reporting requirements
- **Implementation**: Generate per-ad transparency strings + optional export
- **Legal Reference**: EUR-Lex - [2022/2065](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2065)
- **Status**: ✅ SHIP-READY

### UK

#### Online Safety Act 2023
- **Part 4, Ch. 5 §§77–78**: Ofcom transparency reporting duties
- **Implementation**: Map logs to transparency report fields
- **Legal Reference**: [legislation.gov.uk](https://www.legislation.gov.uk/ukpga/2023/50/part/4/chapter/5)
- **Guidance**: GOV.UK Ofcom guidance
- **Status**: ✅ SHIP-READY

### US (Minimum Viable)

#### FTC Endorsement Guides, 16 CFR Part 255
- **Requirement**: Clear, proximate ad/endorsement disclosures
- **Implementation**: Ship copy blocks and audit trails
- **Legal Reference**: [eCFR - 16 CFR Part 255](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-255)
- **Status**: ✅ SHIP-READY

#### State Synthetic/Deepfake & Political Ad Rules
- **Implementation**: Track/flag where labeling applies
- **Caveat**: Note where laws are enjoined or evolving
- **References**: 
  - CA deepfakes injunction status
  - State law patchwork analysis
- **Sources**: AP News, Brennan Center for Justice
- **Status**: ⚠️ ADVISORY (Evolving Landscape)

#### Colorado AI Act (SB24-205)
- **Implementation**: Advisory runway for risk management
- **Effective Date**: June 30, 2026 (delayed)
- **Status**: ⚠️ RUNWAY ONLY

### Brazil

#### LGPD (Lei 13.709/2018)
- **Requirement**: Map data items as personal data processing
- **Implementation**: Include legal bases, controller/processor roles, DSR points, retention windows
- **Legal Reference**: [Planalto](http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
- **Status**: ✅ SHIP-READY

## Implementation Scope

### What We Support (Ship-Ready)
1. **EU AI Act Art. 50** - AI content labeling with visible badges
2. **EU DSA Arts. 26/27/39/42** - Ad transparency and reporting
3. **UK OSA** - Transparency reporting mapping
4. **US FTC Guides** - Endorsement disclosure compliance
5. **Brazil LGPD** - Data processing mapping and DSR

### What We Track (Advisory)
1. **US State Deepfake Laws** - Matrix with litigation status
2. **Colorado AI Act** - Risk management runway

### What We Don't Support (Out of Scope)
1. **Real-time political ad monitoring** - Requires external data feeds
2. **State-level enforcement tools** - Legal complexity exceeds product scope
3. **Custom legal advice** - Remain tool provider, not legal counsel

## Compliance Coverage Matrix

| Region | Regulation | Articles | Status | Implementation |
|--------|------------|----------|---------|----------------|
| EU | AI Act 2024/1689 | Art. 50 | ✅ Ship-Ready | Badge + disclosure |
| EU | DSA 2022/2065 | Arts. 26/27/39/42 | ✅ Ship-Ready | Transparency strings |
| UK | Online Safety Act 2023 | Part 4, Ch. 5 | ✅ Ship-Ready | Report mapping |
| US | FTC Guides | 16 CFR Part 255 | ✅ Ship-Ready | Copy blocks + audit |
| US | State Deepfake Laws | Various | ⚠️ Advisory | Matrix tracking |
| US | Colorado AI Act | SB24-205 | ⚠️ Runway | Risk management |
| BR | LGPD | Lei 13.709/2018 | ✅ Ship-Ready | Data mapping |

## Risk Mitigations

1. **Scope Creep**: EU first, minimal viable templates for others
2. **Legal Complexity**: Keep small template set with versioning
3. **US Patchwork**: Maintain neutral tracker sourcing, flag litigation
4. **Regulatory Changes**: Template versioning with change tracking

## Success Criteria

- All ship-ready items generate compliant disclosures
- Advisory items clearly marked as non-binding
- Regional appendices auto-generated from same data source
- Template versions tracked and referenced in reports
- Legal bases properly cited with official text links
