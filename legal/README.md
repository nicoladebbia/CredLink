# C2 Concierge Legal Documentation - Phase 49

## Repository Structure

### `/contracts/`
- **MSA.md** - Master Services Agreement (C2PA-as-a-service)
- **DPA.md** - Data Processing Addendum (Art. 28 GDPR + SCCs/IDTA)
- **SLA.md** - Service Level Agreement (survival-aligned metrics)
- **Order-Form.md** - Editable order form with billing mechanics

### `/exhibits/`
- **Security-Exhibit.md** - Key custody, WORM, pen-test cadence
- **Data-Residency.md** - Region selection and transfer mechanisms
- **Sub-processor-Disclosure.md** - Public sub-processor list

### `/templates/`
- **MSA-Template-v1.0.md** - Standard master agreement template
- **DPA-Template-v1.0.md** - Standard DPA with SCCs/IDTA
- **Order-Form-Template-v1.0.md** - Editable order form template

### `/clauses/`
- **SLA-Credits.md** - Service credit clause snippets
- **Auto-Fallback.md** - Safety clause for SLO breaches
- **Evidence-Lock.md** - WORM retention clause
- **Sub-Processing.md** - Art. 28 sub-processor clauses
- **Transfer-Mechanisms.md** - International transfer clauses
- **E-Sign.md** - eIDAS/ESIGN compliance clauses

### `/playbooks/`
- **Sub-Processor-Changes.md** - Change management playbook
- **Notice-Windows.md** - Notice period procedures
- **Objection-Handling.md** - Customer objection procedures

### `/buyer-facing/`
- **Security-One-Pager.md** - Security controls and pen-test info
- **Residency-Memo.md** - Data residency and transfer memo
- **WORM-Explainer.md** - Evidence retention and legal hold

### `/versions/`
- **v1.0-README.md** - Version 1.0 release notes
- **Change-Log.md** - Template versioning and changes

## Compliance References

- **GDPR Art. 28** - Controller-processor relationships
- **EU SCCs 2021/914** - Standard Contractual Clauses
- **UK IDTA/Addendum** - UK International Data Transfer Agreement
- **eIDAS Art. 25** - Electronic signatures legal framework
- **ESIGN 15 U.S.C. §7001** - US electronic signatures
- **NIST SP 800-115** - Penetration testing methodology
- **AWS S3 Object Lock** - WORM storage implementation

## Quick Start

1. **Standard Contract Flow**: MSA → DPA → SLA → Order Form
2. **E-Sign Ready**: All documents support eIDAS/ESIGN execution
3. **Mid-Market Optimized**: Standard paper with minimal redline cycles
4. **Template Versioning**: All templates tracked with semantic versioning

## Support

For legal questions or template customization, contact legal@c2concierge.com
