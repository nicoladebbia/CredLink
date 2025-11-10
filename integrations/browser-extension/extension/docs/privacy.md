# CredLink Browser Extension - Privacy Policy

**Last Updated:** November 2, 2025  
**Effective Date:** November 2, 2025

## Overview

CredLink is a privacy-first browser extension that verifies C2PA content credentials on images and videos. We are committed to protecting your privacy and ensuring transparency about data practices.

## Data We Collect

### Default Behavior (No Data Collection)

By default, the extension **does not collect any browsing data**:

- ❌ No page content is recorded or transmitted
- ❌ No browsing history is tracked
- ❌ No user behavior analytics
- ❌ No personal identifiers collected
- ❌ No third-party tracking or advertising

### Data Processed Locally

The extension processes the following data **only on your device**:

- **Media URLs**: To discover and verify C2PA manifests
- **Response Headers**: To find Link headers pointing to manifests
- **Verification Results**: Cached locally for 5 minutes to improve performance
- **Site Settings**: Your per-site enable/disable preferences

### Optional Data Collection (Opt-in Only)

With your explicit consent, we may collect:

- **Anonymous Usage Statistics**: Number of verifications performed
- **Technical Information**: Browser version, extension version
- **Error Reports**: Anonymized error details to improve reliability

**Opt-in data is:**
- Completely anonymous
- Aggregated only
- Used for product improvement
- Stored for maximum 90 days
- Can be disabled at any time

## How Data Is Used

### Verification Process

1. **Discovery**: Extension looks for C2PA manifests via:
   - HTTP Link headers (`rel="c2pa-manifest"`)
   - Sidecar files (same-path `.c2pa`)
   - Embedded data in media files

2. **Verification**: 
   - Remote manifests: Sent through privacy-preserving relay
   - Embedded manifests: Processed locally using bundled tools

3. **Display**: Results shown in badge overlays and detail panels

### Privacy-Preserving Relay

For remote manifest verification, we use a relay service that:

- **Strips IP addresses**: No source IP tracking
- **No cookies**: No tracking cookies or identifiers
- **No logging**: Verification requests are not logged
- **Minimal data**: Only manifest URL and asset URL transmitted

## Data Storage

### Local Storage

- **Configuration**: Site preferences stored in `chrome.storage.sync`
- **Cache**: Verification results cached for 5 minutes in memory
- **Limits**: Respects browser storage quotas (~100KB total)

### Server Storage (Opt-in Only)

- **Analytics**: Anonymous usage statistics on secure servers
- **Retention**: 90-day rolling window
- **Security**: Encrypted at rest and in transit
- **Location**: Servers in US/EU with strict access controls

## Data Sharing

We **do not sell, rent, or share** your data with third parties for:

- ❌ Advertising targeting
- ❌ Cross-site tracking
- ❌ Data brokerage
- ❌ Marketing purposes

### Limited Sharing

We may share anonymized, aggregated data only for:

- **Research**: Academic research on content provenance
- **Compliance**: Legal requirements or court orders
- **Security**: Security threat analysis and protection

## Your Rights

### Control Your Data

- **Disable**: Turn off extension entirely
- **Per-Site**: Enable/disable on specific websites
- **Opt-out**: Disable all optional data collection
- **Export**: Download your configuration data
- **Delete**: Clear all local data and settings

### Access and Correction

- **Transparency**: Full access to what data is processed
- **Correction**: Update or fix inaccurate information
- **Portability**: Export your data in standard formats
- **Deletion**: Request complete data removal

### Withdraw Consent

You can withdraw consent at any time:

1. Right-click extension icon
2. Select "Options"
3. Disable "Share anonymous usage data"
4. Click "Clear all data"

## Security Measures

### Technical Protections

- **Encryption**: All data transmissions use TLS 1.3+
- **Authentication**: Requests authenticated with secure tokens
- **Validation**: All inputs validated and sanitized
- **Isolation**: Shadow DOM prevents page access to extension data

### Organizational Protections

- **Access Controls**: Limited employee access to data
- **Audits**: Regular security and privacy audits
- **Training**: Privacy training for all team members
- **Compliance**: GDPR, CCPA, and privacy law compliance

## Third-Party Services

### Verification Relay

- **Purpose**: Privacy-preserving manifest verification
- **Privacy**: No IP logging, no tracking, minimal data
- **Security**: HTTPS only, regular security audits
- **Control**: We control and audit this service

### Browser Stores

- **Distribution**: Chrome Web Store, Edge Add-ons, Safari App Store
- **Updates**: Automatic security updates through stores
- **Reviews**: Store review process for security compliance

### No Third-Party Analytics

We explicitly do not use:

- ❌ Google Analytics
- ❌ Mixpanel or similar
- ❌ Ad networks
- ❌ Tracking pixels

## Children's Privacy

The extension is not directed to children under 13:

- **No Collection**: We do not knowingly collect data from children
- **Parental Controls**: Parents can disable extension entirely
- **Compliance**: COPPA compliant practices

## International Data Transfers

### Data Processing Locations

- **Local Processing**: Majority of data processed on your device
- **Server Processing**: Opt-in data processed in US/EU servers
- **Legal Frameworks**: GDPR, CCPA, and international privacy laws

### Cross-Border Transfers

- **Adequacy**: Only to countries with adequate privacy laws
- **Safeguards**: Standard contractual clauses where required
- **Rights**: Your privacy rights maintained internationally

## Changes to This Policy

### Notification Process

- **In-Extension**: Notice displayed in extension popup
- **Email**: Email notification for registered users
- **Website**: Posted on our website with effective date
- **GitHub**: Commit history tracks all changes

### Significant Changes

For material changes to privacy practices:

- **30-Day Notice**: Advance notice for significant changes
- **Opt-Out**: Ability to opt out of new data collection
- **Data Deletion**: Option to delete data under new practices

## Contact Information

### Privacy Questions

- **Email**: privacy@credlink.org
- **Website**: https://credlink.org/privacy
- **GitHub**: https://github.com/Nickiller04/credlink/issues

### Data Protection Officer

- **Email**: dpo@credlink.org
- **Address**: CredLink Privacy Team, 123 Tech Street, San Francisco, CA 94105

### Complaints

- **Internal**: privacy@credlink.org
- **Regulatory**: Relevant data protection authority
- **Arbitration**: Independent arbitration for disputes

## Legal Basis for Processing

### Legitimate Interests

- **Verification**: Providing content verification service
- **Security**: Protecting against security threats
- **Improvement**: Improving service quality and reliability

### Consent

- **Optional Features**: Explicit consent for optional data collection
- **Withdrawable**: Consent can be withdrawn at any time
- **Granular**: Separate consent for different features

### Compliance

- **GDPR**: Articles 6, 7, 17, 18, 21 compliance
- **CCPA**: California Consumer Privacy Act compliance
- **Other Laws**: Applicable privacy laws and regulations

## Policy Review

This privacy policy is reviewed annually and updated as needed to reflect:

- **New Features**: Changes in extension functionality
- **Legal Requirements**: Updates to privacy laws
- **User Feedback**: Input from our user community
- **Best Practices**: Evolving privacy standards

---

**Commitment to Privacy**

We are committed to earning and maintaining your trust through transparent privacy practices, minimal data collection, and strong security protections. Your privacy is not an afterthought—it's fundamental to our design and development process.

If you have any questions or concerns about this privacy policy or our privacy practices, please contact us at privacy@credlink.org.
