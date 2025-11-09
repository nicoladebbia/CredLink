# Phase 48 - Compliance v2 Law Mapping & References

## Overview

This document provides comprehensive law mapping tables and official text references for all supported jurisdictions in Phase 48 Compliance v2. Each regulation is mapped to specific implementation requirements with direct links to authoritative sources.

## EU Regulations

### EU AI Act 2024/1689

| Requirement | Article | Implementation | Status | Official Source |
|-------------|---------|----------------|---------|-----------------|
| AI Content Labeling | Art. 50(1) | `cai.disclosure` assertion with visible badge | ✅ Implemented | [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689) |
| AI-Altered Content Disclosure | Art. 50(2) | `cai.disclosure.ai_altered` field | ✅ Implemented | [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689) |
| Provenance Information | Art. 50(3) | Link to Content Credentials manifest | ✅ Implemented | [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689) |
| Multilingual Support | Art. 50(4) | Localized disclosure templates | ✅ Implemented | [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689) |
| Record Keeping | Art. 51 | 12-month retention requirement | ✅ Implemented | [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689) |

**Template Version**: 1.1.0  
**Last Updated**: 2025-11-05  
**Next Review**: 2026-06-01 (AI Act effective date)

### EU Digital Services Act (DSA) 2022/2065

| Requirement | Article | Implementation | Status | Official Source |
|-------------|---------|----------------|---------|-----------------|
| Ad Transparency | Art. 26 | `ads.transparency` assertion with sponsor/targeting | ✅ Implemented | [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2065) |
| Recommender System Disclosure | Art. 27 | `ads.transparency.main_params` tracking | ✅ Implemented | [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2065) |
| VLOP Ad Repository | Art. 39 | CSV export for VLOP tenants | ✅ Implemented | [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2065) |
| Transparency Reporting | Art. 42 | Quarterly compliance metrics | ✅ Implemented | [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2065) |
| No PII in Repositories | Art. 39(2) | DSR redaction for ad exports | ✅ Implemented | [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2065) |

**Template Version**: 1.2.0  
**Last Updated**: 2025-11-05  
**Next Review**: 2025-12-05

## UK Regulations

### Online Safety Act 2023

| Requirement | Section | Implementation | Status | Official Source |
|-------------|---------|----------------|---------|-----------------|
| Transparency Reporting | Part 4, Ch. 5 §77 | `uk.osa.trace` assertion | ✅ Implemented | [legislation.gov.uk](https://www.legislation.gov.uk/ukpga/2023/50/part/4/chapter/5) |
| Risk Assessment Duties | Part 4, Ch. 5 §78 | Harm controls tracking | ✅ Implemented | [legislation.gov.uk](https://www.legislation.gov.uk/ukpga/2023/50/part/4/chapter/5) |
| Service Information | Part 4, Ch. 5 §77(2) | Service type disclosure | ✅ Implemented | [legislation.gov.uk](https://www.legislation.gov.uk/ukpga/2023/50/part/4/chapter/5) |
| User Metrics | Part 4, Ch. 5 §77(3) | Active user reporting | ✅ Implemented | [legislation.gov.uk](https://www.legislation.gov.uk/ukpga/2023/50/part/4/chapter/5) |
| Ofcom Guidance | Schedule 14 | Guidance reference tracking | ✅ Implemented | [GOV.UK](https://www.gov.uk/government/publications/online-safety-act-transparency-reporting-guidance) |

**Template Version**: 1.0.2  
**Last Updated**: 2025-11-05  
**Next Review**: 2025-12-05

## US Regulations

### FTC Endorsement Guides 16 CFR Part 255

| Requirement | Section | Implementation | Status | Official Source |
|-------------|---------|----------------|---------|-----------------|
| Clear Disclosure | §255.1 | `us.ftc.endorsement.disclosure_text` | ✅ Implemented | [eCFR](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-255) |
| Proximity Requirement | §255.5 | `us.ftc.endorsement.placement_proximity` | ✅ Implemented | [eCFR](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-255) |
| Material Connection | §255.1(a) | Compensation type tracking | ✅ Implemented | [eCFR](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-255) |
| Evidence Preservation | §255.7 | Screenshot capture & logging | ✅ Implemented | [eCFR](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-255) |

**Template Version**: 1.0.1  
**Last Updated**: 2025-11-05  
**Next Review**: 2025-12-05

### State Synthetic Media Laws (Advisory)

| State | Statute | Status | Implementation | Official Source |
|-------|---------|--------|----------------|-----------------|
| California | AB 730 (2019) | ⚠️ Enjoined | Matrix tracking with status | [California Legislature](https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=201920200AB730) |
| Texas | SB 1131 (2023) | ✅ Active | Disclosure requirement tracking | [Texas Legislature](https://capitol.texas.gov/BillLookup/History.aspx?LegSess=88R&Bill=SB1131) |
| New York | S07868 (2023) | ⚠️ Pending | Matrix tracking with status | [NY Senate](https://www.nysenate.gov/legislation/bills/2023/S7868) |
| Illinois | HB 3573 (2023) | ✅ Active | Disclosure requirement tracking | [ILGA](https://www.ilga.gov/legislation/BillStatus.asp?DocNum=3573&GA=103) |
| Washington | HB 1991 (2024) | ✅ Active | Disclosure requirement tracking | [Washington Legislature](https://app.leg.wa.gov/billsummary?BillNumber=1991&Session=2023-24) |

**Template Version**: 1.0.0-advisory  
**Last Updated**: 2025-11-05  
**Next Review**: 2025-12-05 (rapidly evolving landscape)

### Colorado AI Act SB24-205 (Runway)

| Requirement | Section | Implementation | Status | Official Source |
|-------------|---------|----------------|---------|-----------------|
| High-Risk AI Definition | §2-1-1101 | Risk assessment framework | ⚠️ Runway | [Colorado General Assembly](https://leg.colorado.gov/bills/sb24-205) |
| Risk Management | §2-1-1104 | Governance procedures | ⚠️ Runway | [Colorado General Assembly](https://leg.colorado.gov/bills/sb24-205) |
| Documentation | §2-1-1105 | Documentation procedures | ⚠️ Runway | [Colorado General Assembly](https://leg.colorado.gov/bills/sb24-205) |
| Effective Date | §2-1-1107 | Delayed to 2026-06-30 | ⚠️ Runway | [Colorado General Assembly](https://leg.colorado.gov/bills/sb24-205) |

**Template Version**: 1.0.0-runway  
**Last Updated**: 2025-11-05  
**Next Review**: 2026-03-01 (pre-effective date)

## Brazil Regulations

### LGPD Lei 13.709/2018

| Requirement | Article | Implementation | Status | Official Source |
|-------------|---------|----------------|---------|-----------------|
| Legal Basis | Art. 7 | `br.lgpd.data.legal_basis` field | ✅ Implemented | [Planalto](http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) |
| Data Processing Records | Art. 37 | Processing logs & categories | ✅ Implemented | [Planalto](http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) |
| Controller/Processor Roles | Art. 5 | Role identification & tracking | ✅ Implemented | [Planalto](http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) |
| Data Subject Rights | Art. 18 | DSR hooks & procedures | ✅ Implemented | [Planalto](http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) |
| Cross-Border Transfers | Art. 33 | Transfer tracking & safeguards | ✅ Implemented | [Planalto](http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) |
| Retention Periods | Art. 15 | 2-year maximum retention | ✅ Implemented | [Planalto](http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) |
| DPO Contact | Art. 41 | Contact information & procedures | ✅ Implemented | [Planalto](http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) |
| Security Measures | Art. 46 | Security measure tracking | ✅ Implemented | [Planalto](http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) |

**Template Version**: 1.0.0  
**Last Updated**: 2025-11-05  
**Next Review**: 2025-12-05

## Cross-Jurisdictional Mapping

### Data Retention Matrix

| Region | Base Retention | Legal Hold | WORM Storage | DSR Hooks | Maximum Applied |
|--------|----------------|------------|--------------|-----------|-----------------|
| EU | 365 days | Required | Recommended | Required | 730 days (with BR) |
| UK | 180 days | Required | Not Required | Required | 730 days (with BR) |
| US | 365 days | Required | Not Required | Required | 730 days (with BR) |
| BR | 730 days | Required | Recommended | Required | 730 days (strictest) |

### Assertion to Regulation Mapping

| Assertion | EU | UK | US | BR |
|-----------|----|----|----|----|
| `cai.disclosure` | ✅ AI Act Art. 50 | ❌ | ❌ | ❌ |
| `ads.transparency` | ✅ DSA Art. 26/27 | ❌ | ❌ | ❌ |
| `uk.osa.trace` | ❌ | ✅ OSA Part 4 Ch. 5 | ❌ | ❌ |
| `us.ftc.endorsement` | ❌ | ❌ | ✅ FTC 16 CFR 255 | ❌ |
| `us.state.synthetic` | ❌ | ❌ | ⚠️ State Laws | ❌ |
| `br.lgpd.data` | ❌ | ❌ | ❌ | ✅ LGPD Arts. 7/18/33 |

### Template Version Control

| Template | Current Version | Region | Regulation | Last Updated |
|----------|----------------|--------|------------|--------------|
| `eu_ai` | 1.1.0 | EU | AI Act 2024/1689 | 2025-11-05 |
| `dsa26` | 1.2.0 | EU | DSA 2022/2065 | 2025-11-05 |
| `uk_osa` | 1.0.2 | UK | Online Safety Act 2023 | 2025-11-05 |
| `us_ftc` | 1.0.1 | US | FTC 16 CFR 255 | 2025-11-05 |
| `br_lgpd` | 1.0.0 | BR | LGPD 13.709/2018 | 2025-11-05 |
| `us_state_advisory` | 1.0.0-advisory | US | State Laws | 2025-11-05 |

## Implementation References

### Official Text Sources

**European Union:**
- [EUR-Lex - AI Act 2024/1689](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689)
- [EUR-Lex - DSA 2022/2065](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2065)
- [AI Act Service Desk](https://artificialintelligence.ec.europa.eu/regulation_en)

**United Kingdom:**
- [Online Safety Act 2023](https://www.legislation.gov.uk/ukpga/2023/50/part/4/chapter/5)
- [Ofcom Guidance](https://www.ofcom.org.uk/__data/assets/pdf_file/0024/256189/online-safety-act-transparency-reporting-guidance.pdf)
- [GOV.UK OSA Resources](https://www.gov.uk/government/publications/online-safety-act-transparency-reporting-guidance)

**United States:**
- [FTC Endorsement Guides - eCFR](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-255)
- [NCSL State Deepfake Law Tracker](https://www.ncsl.org/technology-and-communication/deepfake-state-legislation)
- [Brennan Center - AI Legislation Tracker](https://www.brennancenter.org/our-work/research-reports/state-artificial-intelligence-legislation-tracker)
- [Colorado General Assembly - SB24-205](https://leg.colorado.gov/bills/sb24-205)

**Brazil:**
- [LGPD Full Text - Planalto](http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
- [ANPD Guidelines](https://www.gov.br/anpd/pt-br/assuntos/legislacao/guia-orientativo)
- [LGPD English Translation](https://www.privacylaws.com/translation/brazil/data-protection-law-lgpd)

### Legal Analysis Sources

**EU Analysis:**
- [CMS Digital Laws - AI Act Analysis](https://www.cms.law/en/eur/publication/eu-ai-act-compliance-guide)
- [Latham & Watkins - DSA Compliance](https://www.lw.com/en/thought-leadership/digital-services-act-compliance)
- [IAB Tech Lab - DSA Transparency](https://iabtechlab.com/standards/dsa-transparency/)

**UK Analysis:**
- [CMS Digital Laws - OSA Analysis](https://www.cms.law/en/gbr/publication/online-safety-act-2023-compliance)
- [Linklaters - OSA Guidance](https://www.linklaters.com/en/insights/blogs/tech-talk/2023/online-safety-act-2023-transparency-reporting)

**US Analysis:**
- [AP News - State Deepfake Laws](https://apnews.com/article/deepfake-laws-states-california-texas-2024)
- [Brennan Center - State AI Laws](https://www.brennancenter.org/our-work/research-reports/state-artificial-intelligence-legislation-tracker)
- [Clark Hill - Colorado AI Act](https://www.clarkhill.com/en/insights/publications/2024/06/colorado-ai-act-what-businesses-need-know)

**Brazil Analysis:**
- [Planalto - Official LGPD Portal](http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
- [Trench Rossi Watanabe - LGPD Compliance](https://www.trw.com/en/insights/lgpd-compliance-guide)

## Update Schedule

### Regular Reviews
- **Monthly**: State law changes (US)
- **Quarterly**: Template version updates
- **Semi-annually**: Major regulation analysis
- **Annually**: Full compliance framework review

### Trigger-Based Updates
- **New Legislation**: Immediate review and implementation planning
- **Court Rulings**: 30-day impact assessment
- **Regulatory Guidance**: 60-day implementation planning
- **Template Changes**: Version increment and documentation

### Change Management

All changes follow this process:
1. **Legal Research**: Verify authoritative sources
2. **Impact Analysis**: Assess implementation requirements
3. **Template Updates**: Modify assertion schemas
4. **Testing**: Comprehensive acceptance testing
5. **Documentation**: Update mapping tables
6. **Version Control**: Increment template versions
7. **Deployment**: Staged rollout with monitoring

## Compliance Verification

### Automated Checks
- Template version validation
- Assertion completeness verification
- Retention policy calculation accuracy
- Regional requirement coverage

### Manual Reviews
- Legal counsel sign-off
- Regulatory change impact assessment
- Cross-border transfer compliance
- Data subject rights implementation

### Audit Trail
- All compliance pack generations logged
- Template version changes tracked
- Regulatory updates documented
- Legal reviews archived

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-11-05  
**Next Review**: 2025-12-05  
**Maintained By**: CredLink Compliance Team

**⚠️ Important**: This document is for informational purposes only and does not constitute legal advice. Always consult qualified legal counsel for compliance matters.
