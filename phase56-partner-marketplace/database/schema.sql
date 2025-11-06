-- Phase 56 Partner Marketplace Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Partners table
CREATE TABLE partners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    legal_name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    website VARCHAR(500),
    logo_url VARCHAR(500),
    
    -- Certification
    certification_track VARCHAR(50) NOT NULL CHECK (certification_track IN ('installer', 'auditor', 'enterprise')),
    certification_tier VARCHAR(50) NOT NULL CHECK (certification_tier IN ('verified', 'advanced', 'premier')),
    certification_status VARCHAR(50) NOT NULL DEFAULT 'provisional' CHECK (certification_status IN ('provisional', 'active', 'suspended', 'revoked')),
    certified_at TIMESTAMP,
    certification_expires_at TIMESTAMP,
    
    -- Contact information
    contact_email VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(50),
    contact_form_url VARCHAR(500),
    
    -- Business details
    business_registration VARCHAR(100),
    tax_id VARCHAR(100),
    insurance_coverage DECIMAL(12,2),
    insurance_expires_at DATE,
    
    -- Stripe Connect
    stripe_account_id VARCHAR(100),
    stripe_onboarding_completed BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP,
    
    CONSTRAINT unique_legal_name UNIQUE (legal_name),
    CONSTRAINT unique_stripe_account UNIQUE (stripe_account_id)
);

CREATE INDEX idx_partners_certification ON partners(certification_track, certification_tier, certification_status);
CREATE INDEX idx_partners_status ON partners(certification_status);
CREATE INDEX idx_partners_activity ON partners(last_activity_at);

-- Partner metrics table
CREATE TABLE partner_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    
    -- Performance metrics
    avg_tti_ms INTEGER,
    p50_tti_ms INTEGER,
    p95_tti_ms INTEGER,
    total_installations INTEGER DEFAULT 0,
    survival_rate DECIMAL(5,4),
    
    -- Customer satisfaction
    nps_score INTEGER,
    nps_response_count INTEGER DEFAULT 0,
    customer_retention_rate DECIMAL(5,4),
    
    -- Business metrics
    total_deals_closed INTEGER DEFAULT 0,
    total_revenue DECIMAL(12,2) DEFAULT 0,
    total_commissions DECIMAL(12,2) DEFAULT 0,
    
    -- Quality metrics
    sla_compliance_rate DECIMAL(5,4),
    quality_score DECIMAL(5,2),
    
    -- Period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_partner_period UNIQUE (partner_id, period_start, period_end)
);

CREATE INDEX idx_partner_metrics_partner ON partner_metrics(partner_id);
CREATE INDEX idx_partner_metrics_period ON partner_metrics(period_start, period_end);

-- Certifications table
CREATE TABLE certifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    
    track VARCHAR(50) NOT NULL,
    tier VARCHAR(50) NOT NULL,
    
    -- Assessment results
    technical_score DECIMAL(5,2),
    operational_score DECIMAL(5,2),
    overall_score DECIMAL(5,2),
    
    -- Evidence
    installations_verified INTEGER,
    survival_reports_count INTEGER,
    evidence_pack_exports INTEGER,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    issued_at TIMESTAMP,
    expires_at TIMESTAMP,
    
    -- Auditing
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMP,
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_certifications_partner ON certifications(partner_id);
CREATE INDEX idx_certifications_status ON certifications(status);
CREATE INDEX idx_certifications_expiry ON certifications(expires_at);

-- Performance badges table
CREATE TABLE performance_badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    
    badge_type VARCHAR(50) NOT NULL CHECK (badge_type IN ('fast-installer', 'compliance-pro', 'five-star-nps')),
    
    -- Qualification criteria
    criteria_met JSONB NOT NULL,
    qualification_score DECIMAL(5,2),
    
    -- Badge details
    svg_url VARCHAR(500),
    earned_at TIMESTAMP NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_partner_badge UNIQUE (partner_id, badge_type)
);

CREATE INDEX idx_performance_badges_partner ON performance_badges(partner_id);
CREATE INDEX idx_performance_badges_type ON performance_badges(badge_type);
CREATE INDEX idx_performance_badges_status ON performance_badges(status);

-- Deal registrations table
CREATE TABLE deal_registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    
    -- Company information
    company_name VARCHAR(255) NOT NULL,
    website VARCHAR(500),
    industry VARCHAR(100),
    
    -- Opportunity details
    deal_value DECIMAL(12,2) NOT NULL,
    expected_close_date DATE NOT NULL,
    products JSONB NOT NULL,
    
    -- Competition
    competitors JSONB,
    differentiation TEXT,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'qualified', 'in-progress', 'won', 'lost', 'expired')),
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    closed_at TIMESTAMP,
    
    -- CRM integration
    crm_opportunity_id VARCHAR(100),
    crm_synced_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_deal_registrations_partner ON deal_registrations(partner_id);
CREATE INDEX idx_deal_registrations_status ON deal_registrations(status);
CREATE INDEX idx_deal_registrations_expiry ON deal_registrations(expires_at);
CREATE INDEX idx_deal_registrations_crm ON deal_registrations(crm_opportunity_id);

-- Attributions table
CREATE TABLE attributions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    
    -- Session tracking
    session_id VARCHAR(255) NOT NULL,
    
    -- UTM parameters
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(255),
    utm_content VARCHAR(255),
    utm_term VARCHAR(255),
    
    -- User data (anonymized)
    user_agent TEXT,
    ip_address_hash VARCHAR(64),
    referrer VARCHAR(500),
    
    -- Funnel stage
    stage VARCHAR(50) NOT NULL DEFAULT 'referral' CHECK (stage IN ('referral', 'signup', 'pilot', 'paid')),
    
    -- Conversions
    signup_at TIMESTAMP,
    pilot_at TIMESTAMP,
    paid_at TIMESTAMP,
    
    -- Deal association
    deal_id UUID REFERENCES deal_registrations(id),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_session UNIQUE (session_id)
);

CREATE INDEX idx_attributions_partner ON attributions(partner_id);
CREATE INDEX idx_attributions_session ON attributions(session_id);
CREATE INDEX idx_attributions_stage ON attributions(stage);
CREATE INDEX idx_attributions_deal ON attributions(deal_id);

-- Commissions table
CREATE TABLE commissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    deal_id UUID REFERENCES deal_registrations(id),
    
    -- Commission calculation
    deal_value DECIMAL(12,2) NOT NULL,
    commission_rate DECIMAL(5,4) NOT NULL,
    gross_commission DECIMAL(12,2) NOT NULL,
    platform_fee DECIMAL(12,2) NOT NULL,
    net_commission DECIMAL(12,2) NOT NULL,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'held', 'clawed-back')),
    
    -- Payout tracking
    payout_id UUID,
    approved_at TIMESTAMP,
    paid_at TIMESTAMP,
    
    -- Metadata
    tier VARCHAR(50),
    calculation_metadata JSONB,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_commissions_partner ON commissions(partner_id);
CREATE INDEX idx_commissions_deal ON commissions(deal_id);
CREATE INDEX idx_commissions_status ON commissions(status);
CREATE INDEX idx_commissions_payout ON commissions(payout_id);

-- Payouts table
CREATE TABLE payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    
    -- Payout details
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    gross_amount DECIMAL(12,2) NOT NULL,
    net_amount DECIMAL(12,2) NOT NULL,
    commission_count INTEGER NOT NULL,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed', 'cancelled')),
    
    -- Stripe transfer
    stripe_transfer_id VARCHAR(100),
    transferred_at TIMESTAMP,
    
    -- Error handling
    error_message TEXT,
    failed_at TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    
    -- Scheduling
    scheduled_for DATE NOT NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payouts_partner ON payouts(partner_id);
CREATE INDEX idx_payouts_status ON payouts(status);
CREATE INDEX idx_payouts_period ON payouts(period_start, period_end);
CREATE INDEX idx_payouts_scheduled ON payouts(scheduled_for);

-- NPS surveys table
CREATE TABLE nps_surveys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    client_id UUID,
    installation_id UUID,
    
    -- Survey configuration
    survey_config JSONB NOT NULL,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'completed', 'expired')),
    scheduled_for TIMESTAMP NOT NULL,
    sent_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_nps_surveys_partner ON nps_surveys(partner_id);
CREATE INDEX idx_nps_surveys_status ON nps_surveys(status);
CREATE INDEX idx_nps_surveys_scheduled ON nps_surveys(scheduled_for);

-- NPS responses table
CREATE TABLE nps_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_id UUID NOT NULL REFERENCES nps_surveys(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    
    -- Responses
    likelihood_to_recommend INTEGER NOT NULL CHECK (likelihood_to_recommend BETWEEN 0 AND 10),
    implementation_quality INTEGER CHECK (implementation_quality BETWEEN 1 AND 5),
    support_experience INTEGER CHECK (support_experience BETWEEN 1 AND 5),
    value_for_money INTEGER CHECK (value_for_money BETWEEN 1 AND 5),
    improvement_suggestions TEXT,
    
    -- Calculated fields
    nps_score INTEGER NOT NULL,
    category VARCHAR(20) NOT NULL CHECK (category IN ('promoter', 'passive', 'detractor')),
    satisfaction_score DECIMAL(5,2),
    
    -- Metadata
    completion_time_seconds INTEGER,
    user_agent TEXT,
    
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_nps_responses_survey ON nps_responses(survey_id);
CREATE INDEX idx_nps_responses_partner ON nps_responses(partner_id);
CREATE INDEX idx_nps_responses_category ON nps_responses(category);

-- Installations table
CREATE TABLE installations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    client_id UUID,
    
    -- Installation details
    stack VARCHAR(50) NOT NULL CHECK (stack IN ('wordpress', 'shopify', 'cloudflare-workers', 'custom')),
    complexity VARCHAR(20) CHECK (complexity IN ('simple', 'medium', 'complex')),
    
    -- Timing
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    duration_ms INTEGER,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'in-progress' CHECK (status IN ('in-progress', 'completed', 'failed')),
    success BOOLEAN,
    error_message TEXT,
    
    -- Configuration
    environment VARCHAR(50),
    version VARCHAR(50),
    features JSONB,
    manifest_url VARCHAR(500),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_installations_partner ON installations(partner_id);
CREATE INDEX idx_installations_stack ON installations(stack);
CREATE INDEX idx_installations_status ON installations(status);
CREATE INDEX idx_installations_timing ON installations(start_time, end_time);

-- Survival tests table
CREATE TABLE survival_tests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    installation_id UUID NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    
    -- Test configuration
    platforms JSONB NOT NULL,
    transformations JSONB NOT NULL,
    iterations INTEGER DEFAULT 10,
    
    -- Results
    results JSONB NOT NULL,
    survival_rate DECIMAL(5,4) NOT NULL,
    
    -- Evidence
    evidence_pack_url VARCHAR(500),
    evidence_pack_hash VARCHAR(64),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_survival_tests_installation ON survival_tests(installation_id);
CREATE INDEX idx_survival_tests_partner ON survival_tests(partner_id);
CREATE INDEX idx_survival_tests_rate ON survival_tests(survival_rate);

-- Webhook events table
CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_id UUID REFERENCES partners(id) ON DELETE CASCADE,
    
    -- Event details
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    
    -- Delivery tracking
    webhook_url VARCHAR(500),
    delivery_status VARCHAR(50) CHECK (delivery_status IN ('pending', 'delivered', 'failed')),
    delivery_attempts INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMP,
    delivered_at TIMESTAMP,
    
    -- Error handling
    error_message TEXT,
    next_retry_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhook_events_partner ON webhook_events(partner_id);
CREATE INDEX idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_events_status ON webhook_events(delivery_status);
CREATE INDEX idx_webhook_events_retry ON webhook_events(next_retry_at);

-- Audit log table
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_id UUID REFERENCES partners(id) ON DELETE SET NULL,
    
    -- Action details
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    
    -- Changes
    old_values JSONB,
    new_values JSONB,
    
    -- User context
    performed_by VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_log_partner ON audit_log(partner_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(created_at);

-- Update timestamps trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers to all tables
CREATE TRIGGER update_partners_updated_at BEFORE UPDATE ON partners FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_partner_metrics_updated_at BEFORE UPDATE ON partner_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_certifications_updated_at BEFORE UPDATE ON certifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_performance_badges_updated_at BEFORE UPDATE ON performance_badges FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_deal_registrations_updated_at BEFORE UPDATE ON deal_registrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_attributions_updated_at BEFORE UPDATE ON attributions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_commissions_updated_at BEFORE UPDATE ON commissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payouts_updated_at BEFORE UPDATE ON payouts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_nps_surveys_updated_at BEFORE UPDATE ON nps_surveys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_installations_updated_at BEFORE UPDATE ON installations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
