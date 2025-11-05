# Data Residency & Transfer Memo

**C2 Concierge Platform - Regional Data Processing**

## Available Regions

### European Union (EU)
- **Locations**: Ireland, Germany, France
- **Transfer Mechanism**: No cross-border transfer (data stays in EU)
- **Compliance**: GDPR Art. 44-50
- **Backup**: Multi-region within EU

### United Kingdom (UK)
- **Locations**: London, Manchester
- **Transfer Mechanism**: UK IDTA or UK Addendum to EU SCCs
- **Compliance**: UK Data Protection Act 2018
- **Backup**: Multi-region within UK

### United States (US)
- **Locations**: Northern Virginia, Oregon
- **Transfer Mechanism**: EU SCCs 2021/914 (if EU data transferred)
- **Compliance**: ESIGN Act, state privacy laws
- **Backup**: Multi-region within US

### Brazil (BR)
- **Locations**: São Paulo
- **Transfer Mechanism**: EU SCCs 2021/914 (if EU data transferred)
- **Compliance**: LGPD (Lei Geral de Proteção de Dados)
- **Backup**: Regional redundancy

## Transfer Mechanisms

### EU Standard Contractual Clauses (SCCs)
- **Version**: Commission Implementing Decision (EU) 2021/914
- **Modules**: Controller-to-Processor (Module 2)
- **Application**: Required for EU→non-EU transfers
- **Documentation**: Included in DPA Annex I

### UK International Data Transfer Agreement (IDTA)
- **Version**: UK ICO IDTA (2022)
- **Alternative**: UK Addendum to EU SCCs
- **Application**: Required for UK→non-UK transfers
- **Documentation**: Included in DPA Annex II

## "Stricter-Wins" Retention

When processing data across multiple jurisdictions, we apply the strictest retention requirement:
- **Brazil (LGPD)**: 730 days (24 months)
- **EU (GDPR)**: 365 days (12 months)
- **US**: 180 days (6 months)
- **Applied**: 730 days for multi-region customers

## Customer Control

- **Region Selection**: Choose primary and backup regions in Order Form
- **Transfer Consent**: Explicit consent required for cross-region transfers
- **Data Localization**: Option to restrict data to single region
- **Audit Rights**: Verify data residency through compliance reports

---

**Questions?** legal@c2concierge.com  
**Last Updated**: November 5, 2025
