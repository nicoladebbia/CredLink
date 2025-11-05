# CRM Integration for Order Forms

## Required CRM Fields

### Customer Information
- **Company Name**: Legal entity name
- **Contact Name**: Primary authorized signatory
- **Contact Email**: For contract delivery and notices
- **Contact Phone**: For urgent communications
- **Billing Address**: For invoicing and tax purposes

### Order Form Data
- **Plan Tier**: Starter | Professional | Enterprise | Custom
- **Seats**: Number of licensed users
- **Usage Cap**: Monthly usage entitlement
- **Overage Price**: Per-unit overage pricing
- **Region**: Primary data residency region (EU/UK/US/BR)
- **Renewal Date**: Contract end date
- **Spend Cap**: Maximum monthly/annual spend

### Billing Integration
- **Billing Cycle**: Monthly | Annual
- **Payment Method**: Credit Card | ACH | Wire Transfer | Invoice
- **Stripe Customer ID**: For payment processing
- **Auto-Renewal**: Enabled | Disabled
- **Proration**: Enabled for mid-term changes

### Compliance Tracking
- **DPA Executed**: Yes | No | Date
- **SCCs Executed**: Yes | No | Module
- **UK IDTA Executed**: Yes | No | Date
- **E-Sign Method**: DocuSign | Adobe Sign | Manual

## Stripe Integration

### Subscription Management
- **Create Subscription**: Map Order Form to Stripe subscription
- **Update Subscription**: Handle mid-term upgrades/downgrades
- **Proration**: Automatic daily proration for changes
- **Schedule Changes**: Use Stripe subscription schedules

### Usage-Based Billing
- **Metered Billing**: Track API calls, signatures, verifications
- **Overage Calculation**: Automatic overage charges
- **Spend Caps**: Enforce contract spend limits
- **Billing Alerts**: Notify approaching spend caps

## Workflow Automation

1. **Order Form Submission** → Create CRM opportunity
2. **Legal Review** → Route for approval if non-standard
3. **E-Sign Initiation** → Send via DocuSign/Adobe Sign
4. **Contract Execution** → Update CRM with signed dates
5. **Stripe Provisioning** → Create subscription and payment schedule
6. **Service Activation** → Provision tenant and send welcome email

---

**Integration Docs**: /docs/crm-integration-guide.md  
**API Reference**: /api/v1/orders
