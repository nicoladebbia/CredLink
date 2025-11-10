# Sub-processor and Residency Disclosure

**Public Sub-processor List with Change Notice**

**Version**: 1.0.0  
**Last Updated**: November 5, 2025  
**Next Review**: February 5, 2026

---

## Current Sub-processors

### Infrastructure and Storage
**AWS (Amazon Web Services)**
- **Purpose**: Cloud infrastructure, compute, storage, KMS
- **Data Processing**: All customer data and evidence storage
- **Regions**: EU (Ireland), UK (London), US (Virginia, Oregon), BR (São Paulo)
- **Transfer Mechanism**: EU SCCs 2021/914, UK IDTA
- **Certification**: ISO 27001, SOC 2 Type II, PCI DSS

### Content Delivery and Security
**Cloudflare**
- **Purpose**: CDN, DDoS protection, edge caching
- **Data Processing**: Manifest delivery, API gateway
- **Regions**: Global edge network
- **Transfer Mechanism**: EU SCCs 2021/914
- **Certification**: ISO 27001, SOC 2 Type II

### Payment Processing
**Stripe**
- **Purpose**: Payment processing, subscription management
- **Data Processing**: Payment information, billing data
- **Regions**: US (primary), EU (backup)
- **Transfer Mechanism**: EU SCCs 2021/914
- **Certification**: PCI DSS Level 1, SOC 2 Type II

### Electronic Signatures
**DocuSign**
- **Purpose**: Contract execution, e-signature workflows
- **Data Processing**: Contract documents, signature data
- **Regions**: US, EU
- **Transfer Mechanism**: EU SCCs 2021/914, eIDAS compliant
- **Certification**: ISO 27001, SOC 2 Type II

---

## Change Notice Procedure

### 30-Day Notice Window
- Provider will notify customers 30 days before engaging new sub-processors
- Notice via email and dashboard notification
- RSS feed available for automated monitoring

### Objection Rights
Customers may object to new sub-processors on reasonable data protection grounds within 30 days of notice.

---

## Data Residency Options

| Region | Storage Locations | Transfer Mechanism |
|--------|------------------|-------------------|
| EU | Ireland, Germany, France | No transfer required |
| UK | London, Manchester | UK IDTA/Addendum |
| US | Virginia, Oregon | EU SCCs (if EU data) |
| BR | São Paulo | EU SCCs (if EU data) |

---

**Subscribe to Updates**: legal-updates@credlink.com  
**RSS Feed**: https://credlink.com/legal/sub-processors.rss
