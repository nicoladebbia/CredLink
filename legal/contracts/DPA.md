# Data Processing Addendum

**GDPR Art. 28 Compliant - Controller to Processor**

**Version**: 1.0.0  
**Effective Date**: [Date]  
**Parties**: 
- **Controller**: [Customer Name]
- **Processor**: C2 Concierge Inc.

This Data Processing Addendum ("DPA") is incorporated into the Master Services Agreement between Controller and Processor and governs the processing of Personal Data in connection with the C2PA-as-a-Service.

---

## 1. Definitions

**"Personal Data"** means any information relating to an identified or identifiable natural person, as defined by GDPR and applicable data protection laws.

**"Processing"** means any operation performed on Personal Data, such as collection, recording, organization, storage, adaptation, retrieval, use, disclosure, dissemination, or erasure.

**"Data Subject"** means the identified or identifiable natural person to whom Personal Data relates.

**"Supervisory Authority"** means an independent public authority which is established by a Member State pursuant to Article 51 of the GDPR.

**"Applicable Data Protection Law"** means GDPR, UK Data Protection Act 2018, CCPA, LGPD, and any other applicable data protection legislation.

---

## 2. Subject Matter, Duration, and Purpose

### 2.1 Subject Matter
Processor shall process Personal Data on behalf of Controller for the purpose of providing the C2PA-as-a-Service, including manifest generation, content verification, evidence custody, and compliance reporting.

### 2.2 Duration
Processing shall continue for the duration of the Master Services Agreement and shall cease upon termination in accordance with the data deletion and return provisions.

### 2.3 Purpose
Processor shall process Personal Data solely for the following purposes:
- Generating and managing C2PA manifests for Controller's Content
- Providing remote manifest survival and verification services
- Maintaining immutable evidence for compliance purposes
- Generating regional compliance reports
- Providing technical support and service maintenance

### 2.4 Types of Personal Data
Processor may process the following categories of Personal Data:
- User identifiers and account information
- Content metadata and provenance data
- Verification and audit logs
- Compliance evidence and timestamps
- Support communications and interactions

### 2.5 Categories of Data Subjects
Personal Data may relate to:
- End users of Controller's applications
- Content creators and contributors
- System administrators and support personnel
- Compliance and audit personnel

---

## 3. Processor Duties

### 3.1 Processing Instructions
Processor shall:
- Process Personal Data only on documented instructions from Controller
- Ensure that authorized personnel processing Personal Data are committed to confidentiality
- Implement appropriate technical and organizational measures
- Not process Personal Data for purposes other than those specified

### 3.2 Confidentiality
Processor shall ensure that persons authorized to process Personal Data are committed to confidentiality or are under an appropriate statutory obligation of confidentiality.

### 3.3 Security Measures
Processor shall implement and maintain appropriate technical and organizational measures, including:
- Per-tenant encryption using AWS KMS
- Access controls with principle of least privilege
- Regular security testing and vulnerability assessments
- Incident detection and response procedures
- Secure data transmission protocols

### 3.4 Sub-processor Engagement
Processor shall:
- Not engage any Sub-processor without Controller's prior general written authorization
- Provide Controller with advance notice of any intended changes concerning the addition or replacement of Sub-processors
- Remain liable to Controller for the performance of the Sub-processor's obligations
- Ensure Sub-processors are bound by terms no less protective than this DPA

### 3.5 Assistance to Controller
Processor shall, taking into account the nature of processing, assist Controller by:
- Responding to data subject requests
- Conducting data protection impact assessments
- Consulting with supervisory authorities
- Notifying of personal data breaches without undue delay

### 3.6 Data Deletion and Return
Upon termination of the MSA:
- Processor shall delete or return all Personal Data to Controller
- Deletion shall include backup copies and shall be verifiable
- Processor may retain Personal Data where required by applicable law
- Processor shall provide a certificate of deletion upon request

---

## 4. International Data Transfers

### 4.1 Restricted Transfers
For transfers of Personal Data from the EEA to a third country that does not ensure an adequate level of protection, the Parties shall execute the European Commission Standard Contractual Clauses (2021/914) in the appropriate module.

### 4.2 UK Transfers
For transfers of Personal Data from the UK to a third country, the Parties shall execute the UK International Data Transfer Agreement or the UK Addendum to the EU SCCs, as applicable.

### 4.3 Transfer Mechanisms
Processor shall use the following transfer mechanisms:
- **EU SCCs**: Commission Implementing Decision (EU) 2021/914
- **UK IDTA**: International Data Transfer Agreement (UK Addendum)
- **Adequacy Decisions**: Where applicable, rely on EU Commission adequacy decisions

### 4.4 Onward Transfers
Processor shall not transfer Personal Data to third countries without appropriate safeguards and unless otherwise permitted by applicable data protection law.

---

## 5. Data Subject Rights

### 5.1 Assistance with Requests
Processor shall assist Controller in fulfilling its obligations to respond to requests for exercising the following data subject rights:
- Right of access
- Right to rectification
- Right to erasure ('right to be forgotten')
- Right to restriction of processing
- Right to data portability
- Right to object
- Rights in relation to automated decision making and profiling

### 5.2 Response Procedures
Processor shall:
- Provide information about Personal Data processing activities
- Respond to Controller's requests within applicable timeframes
- Implement technical measures to facilitate data subject rights
- Maintain records of data subject requests and responses

---

## 6. Personal Data Breach Notification

### 6.1 Notification Obligations
Processor shall notify Controller without undue delay after becoming aware of a personal data breach, providing:
- Nature of the personal data breach
- Categories and approximate number of data subjects concerned
- Categories and approximate number of personal data records concerned
- Likely consequences of the personal data breach
- Measures taken or proposed to address the breach

### 6.2 Notification Timing
Processor shall provide initial notification within 72 hours of becoming aware of the breach and follow-up information as it becomes available.

### 6.3 Controller Notification
Controller shall, without undue delay and where feasible, not later than 72 hours after becoming aware of a personal data breach, notify the relevant supervisory authority unless the breach is unlikely to result in a risk to the rights and freedoms of natural persons.

---

## 7. Data Protection Impact Assessment and Prior Consultation

### 7.1 DPIA Assistance
Processor shall, upon request, provide reasonable assistance to Controller in carrying out data protection impact assessments and prior consultations with supervisory authorities.

### 7.2 High-Risk Processing
For processing that is likely to result in a high risk to the rights and freedoms of natural persons, Processor shall:
- Conduct systematic and comprehensive risk assessments
- Implement appropriate mitigation measures
- Cooperate with supervisory authority consultations
- Document the assessment and outcomes

---

## 8. Audit and Compliance

### 8.1 Right to Audit
Controller shall have the right to conduct audits and inspections of Processor's processing activities to verify compliance with this DPA.

### 8.2 Audit Procedures
Audits shall be:
- Conducted during normal business hours
- Performed by Controller or an independent third party
- Reasonably limited to processing activities covered by this DPA
- Subject to reasonable confidentiality obligations

### 8.3 Compliance Certifications
Processor shall:
- Provide evidence of compliance with applicable data protection laws
- Maintain relevant security certifications and attestations
- Cooperate with regulatory investigations and inquiries
- Update compliance measures as required by law

---

## 9. Sub-processor Management

### 9.1 Current Sub-processors
Processor's current Sub-processors are listed in the Sub-processor Disclosure and include:
- AWS (Infrastructure and storage)
- Cloudflare (Content delivery and security)
- Stripe (Payment processing)
- DocuSign (Electronic signatures)

### 9.2 Sub-processor Approval
Controller grants general authorization for Processor to engage Sub-processors that provide:
- Cloud infrastructure services
- Security and monitoring services
- Payment processing services
- Electronic signature services

### 9.3 Objection Rights
Controller may object to new Sub-processors on reasonable grounds related to data protection risks. Processor shall:
- Provide 30 days' notice before engaging new Sub-processors
- Allow Controller to object and negotiate mitigations
- Permit termination for affected processing if objections cannot be resolved

---

## 10. Data Residency and Sovereignty

### 10.1 Storage Locations
Processor shall store Personal Data in the following regions as specified in the Order Form:
- **EU**: Ireland, Germany, France
- **UK**: London, Manchester
- **US**: Northern Virginia, Oregon
- **BR**: São Paulo

### 10.2 Transfer Restrictions
Processor shall not transfer Personal Data outside the specified regions without:
- Controller's prior written consent
- Appropriate transfer mechanisms in place
- Compliance with applicable data protection laws

### 10.3 "Stricter-Wins" Retention
Processor shall apply the strictest applicable retention requirements among all relevant jurisdictions, ensuring Personal Data is retained for the longest period required by any applicable law.

---

## 11. Technical and Organizational Measures

### 11.1 Encryption
- **At Rest**: AES-256 encryption using per-tenant KMS keys
- **In Transit**: TLS 1.3 with perfect forward secrecy
- **Key Management**: Quarterly key rotation with secure key disposal

### 11.2 Access Controls
- Multi-factor authentication for administrative access
- Role-based access control with principle of least privilege
- Regular access reviews and privilege audits
- Session timeout and monitoring

### 11.3 Monitoring and Logging
- Comprehensive audit logging of all Personal Data access
- Real-time security monitoring and alerting
- Log integrity protection using cryptographic hashing
- 24-month retention of security logs in WORM storage

### 11.4 Testing and Assessment
- Annual penetration testing by independent third parties
- Quarterly vulnerability scanning and assessment
- Regular security awareness training for personnel
- Incident response testing and tabletop exercises

---

## 12. Liability and Indemnification

### 12.1 Processor Liability
Processor shall be liable for damages caused by processing that infringes this DPA, except where Processor proves that it is not in any way responsible for the event giving rise to the damage.

### 12.2 Indemnification
Processor shall indemnify Controller against claims arising from:
- Breaches of this DPA by Processor or its Sub-processors
- Violations of applicable data protection laws
- Failure to implement appropriate security measures

### 12.3 Limitations
Processor's liability under this DPA shall be subject to the limitations set forth in the MSA, except where prohibited by applicable law.

---

## 13. Term and Termination

### 13.1 Term
This DPA shall remain in effect for the duration of the MSA and shall terminate upon termination of the MSA.

### 13.2 Post-Termination Obligations
Following termination, Processor shall:
- Continue to protect Personal Data in accordance with this DPA
- Provide assistance with ongoing data subject requests
- Cooperate with regulatory investigations
- Maintain records as required by applicable law

---

## 14. Governing Law and Dispute Resolution

### 14.1 Governing Law
This DPA shall be governed by the laws of the European Union for EU data processing and by the laws of the United Kingdom for UK data processing, in accordance with GDPR and UK Data Protection Act requirements.

### 14.2 Dispute Resolution
Disputes arising from this DPA shall be resolved through good faith negotiations and, if necessary, through arbitration or litigation as specified in the MSA.

---

## 15. Amendments

### 15.1 Regulatory Updates
Processor shall update this DPA as necessary to comply with changes in applicable data protection laws and shall provide notice of such changes to Controller.

### 15.2 Mutual Agreement
Other amendments to this DPA shall require mutual written agreement of both parties.

---

## 16. Annexes

- **Annex I**: Standard Contractual Clauses (EU SCCs 2021/914)
- **Annex II**: UK International Data Transfer Agreement
- **Annex III**: Sub-processor List
- **Annex IV**: Technical and Organizational Measures

---

**IN WITNESS WHEREOF**, the Parties have executed this Data Processing Addendum as of the Effective Date.

**CONTROLLER:**
[Customer Name]
By: _________________________
Name: [Name]
Title: [Title]
Date: [Date]

**PROCESSOR:**
C2 Concierge Inc.
By: _________________________
Name: [Name]
Title: [Title]
Date: [Date]

---

*Template Version: 1.0.0*  
*GDPR Art. 28 Compliant*  
*Last Updated: November 5, 2025*
