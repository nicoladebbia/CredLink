/**
 * Phase 48 - Compliance v2 Assertion Presets
 * C2PA to Compliance Mapping for EU/UK/US/BR Regulations
 */

export interface ComplianceAssertion {
  label: string;
  data: Record<string, any>;
  regions: string[];
  regulation: string;
  version: string;
}

// EU AI Act Article 50 - AI Content Disclosure
export const CAI_DISCLOSURE_ASSERTION: ComplianceAssertion = {
  label: "cai.disclosure",
  data: {
    ai_generated: "boolean",           // Required: AI Act Art. 50
    ai_altered: "boolean",             // Required: AI Act Art. 50  
    disclosure_text_id: "string",      // Required: Localized disclosure reference
    locale: "string",                  // Required: Language/locale code
    visible_badge: "boolean",          // Required: Visible badge placement
    badge_type: "ai_generated|ai_altered|synthetic_media",
    disclosure_timestamp: "string",    // ISO 8601 timestamp
    provenance_url: "string"           // Link to full manifest
  },
  regions: ["EU"],
  regulation: "AI Act 2024/1689 Art. 50",
  version: "1.1.0"
};

// EU DSA Article 26 - Ad Transparency
export const ADS_TRANSPARENCY_ASSERTION: ComplianceAssertion = {
  label: "ads.transparency", 
  data: {
    sponsor: "string",                 // Required: Who paid for the ad
    why_targeted: "string",            // Required: Why user is seeing this
    main_params: "Array<{param:string;value:string;category:string}>",             // Required: Key targeting parameters
    ad_id: "string",                   // Required: Unique ad identifier
    campaign_id: "string",             // Required: Campaign reference
    placement_type: "feed|story|sidebar|search",
    vlop_eligible: "boolean",          // Required: VLOP status for repo export
    transparency_string: "string",     // Generated: DSA Art. 26 formatted string
    repo_export_url: "string"         // Optional: VLOP repository CSV link
  },
  regions: ["EU"],
  regulation: "DSA 2022/2065 Arts. 26/27/39",
  version: "1.2.0"
};

// UK Online Safety Act - Trace Fields for Transparency Reporting
export const UK_OSA_TRACE_ASSERTION: ComplianceAssertion = {
  label: "uk.osa.trace",
  data: {
    service_type: "string",            // Required: Service category
    risk_assessment_date: "string",    // Required: Last risk assessment
    harms_controls: "Array<{harm_type:string;control_measure:string;effectiveness_score:number}>",          // Required: Harm mitigation measures
    reporting_period_start: "string",  // Required: Reporting period
    reporting_period_end: "string",    // Required: Reporting period
    user_base_size: "number",          // Required: Active user count
    content_moderation_active: "boolean", // Required: Moderation status
    ofcom_reference: "string",         // Required: Ofcom guidance reference
    compliance_officer: "string",      // Required: Contact person
    data_processed: "boolean",         // Required: Personal data processing flag
    international_transfers: "boolean" // Required: Cross-border data transfers
  },
  regions: ["UK"],
  regulation: "Online Safety Act 2023 Part 4 Ch. 5",
  version: "1.0.2"
};

// US FTC Endorsement Disclosure
export const US_FTC_ENDORSEMENT_ASSERTION: ComplianceAssertion = {
  label: "us.ftc.endorsement",
  data: {
    endorsement_type: "paid|gift|affiliate|free_product",
    brand_name: "string",              // Required: Brand being endorsed
    compensation_type: "string",       // Required: Nature of compensation
    disclosure_text: "string",         // Required: Actual disclosure shown
    placement_proximity: "immediate|nearby|distant", // FTC proximity requirement
    disclosure_visible: "boolean",     // Required: Was disclosure actually visible
    screenshot_url: "string",         // Optional: Proof of placement
    campaign_id: "string",             // Required: Campaign reference
    influencer_id: "string",           // Required: Influencer identifier
    compliance_score: "number"         // Generated: 0-100 compliance score
  },
  regions: ["US"],
  regulation: "FTC Endorsement Guides 16 CFR Part 255",
  version: "1.0.1"
};

// US State Deepfake/Political Ad Tracking
export const US_STATE_SYNTHETIC_ASSERTION: ComplianceAssertion = {
  label: "us.state.synthetic",
  data: {
    states_applicable: "Array<string>", // Required: List of relevant states
    content_type: "political_ad|deepfake|synthetic_media",
    disclosure_required: "boolean",    // Required: Is disclosure required
    disclosure_provided: "boolean",    // Required: Was disclosure actually provided
    statute_references: "Array<{state:string;statute:string;status:string;url:string}>",     // Required: Legal references
    election_context: "boolean",       // Required: Political/election context
    minors_audience: "boolean",        // Required: Targeting minors
    compliance_notes: "string",        // Required: Explanation of compliance approach
    last_legal_review: "string"        // Required: Date of last legal review
  },
  regions: ["US"],
  regulation: "State Synthetic Media Laws",
  version: "1.0.0-advisory"
};

// Brazil LGPD Data Processing
export const BR_LGPD_DATA_ASSERTION: ComplianceAssertion = {
  label: "br.lgpd.data",
  data: {
    data_categories: "Array<string>",  // Required: Types of personal data processed
    legal_basis: "string",             // Required: LGPD legal basis (Art. 7)
    controller_name: "string",         // Required: Data controller identification
    processor_name: "string",         // Optional: Data processor if applicable
    purpose: "string",                 // Required: Processing purpose
    retention_period_days: "number",   // Required: Data retention period
    cross_border_transfer: "boolean",  // Required: International data transfer
    transfer_destination: "string",   // Optional: Transfer destination country
    dpo_contact: "string",             // Required: Data Protection Officer contact
    data_subject_rights: "Array<string>", // Required: Available rights under Art. 18
    security_measures: "Array<string>", // Required: Security measures implemented
    processing_location: "string",     // Required: Geographic location of processing
    legal_hold_active: "boolean"       // Required: Legal preservation status
  },
  regions: ["BR"],
  regulation: "LGPD Lei 13.709/2018",
  version: "1.0.0"
};

// Assertion Registry for Compliance Mapping
export const COMPLIANCE_ASSERTIONS = {
  "cai.disclosure": CAI_DISCLOSURE_ASSERTION,
  "ads.transparency": ADS_TRANSPARENCY_ASSERTION,
  "uk.osa.trace": UK_OSA_TRACE_ASSERTION,
  "us.ftc.endorsement": US_FTC_ENDORSEMENT_ASSERTION,
  "us.state.synthetic": US_STATE_SYNTHETIC_ASSERTION,
  "br.lgpd.data": BR_LGPD_DATA_ASSERTION
} as const;

// Region to Assertion Mapping
export const REGION_ASSERTION_MAP = {
  "EU": ["cai.disclosure", "ads.transparency"],
  "UK": ["uk.osa.trace"],
  "US": ["us.ftc.endorsement", "us.state.synthetic"],
  "BR": ["br.lgpd.data"]
} as const;

// Compliance Badge Display Logic
export interface BadgeDisplayConfig {
  show_badge: boolean;
  badge_text: string;
  badge_style: "standard" | "minimal" | "detailed";
  disclosure_modal: boolean;
  locale: string;
}

export const getBadgeConfig = (
  assertions: Record<string, any>,
  region: string
): BadgeDisplayConfig => {
  const config: BadgeDisplayConfig = {
    show_badge: false,
    badge_text: "",
    badge_style: "standard",
    disclosure_modal: false,
    locale: "en"
  };

  // EU AI Act Badge Logic
  if (region === "EU" && assertions["cai.disclosure"]) {
    const disclosure = assertions["cai.disclosure"];
    if (disclosure.ai_generated || disclosure.ai_altered) {
      config.show_badge = disclosure.visible_badge;
      config.badge_text = disclosure.disclosure_text_id;
      config.badge_style = "detailed";
      config.disclosure_modal = true;
      config.locale = disclosure.locale;
    }
  }

  return config;
};

// Template Version Tracking - Maps assertion keys to current template versions
export const TEMPLATE_VERSIONS = {
  "eu_ai": "1.1.0",
  "dsa26": "1.2.0", 
  "uk_osa": "1.0.2",
  "us_ftc": "1.0.1",
  "br_lgpd": "1.0.0",
  "us_state_advisory": "1.0.0-advisory"
} as const;
