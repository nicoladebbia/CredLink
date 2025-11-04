# OPA Policies for Terraform
# Phase 45 - Terraform & Infra Blueprints (v1.2)

# Package: terraform.security
package terraform.security

# Import Rego and Terraform libraries
import future.keywords.every
import future.keywords.in

# Deny public S3 buckets
deny_public_s3[resource] {
    resource := input.resources[_]
    resource.type == "aws_s3_bucket"
    resource.values.force_destroy == true
}

# Deny S3 buckets without public access blocks
deny_no_public_access_block[resource] {
    resource := input.resources[_]
    resource.type == "aws_s3_bucket_public_access_block"
    not resource.values.block_public_acls
}

# Require KMS encryption for S3
deny_no_kms_encryption[resource] {
    resource := input.resources[_]
    resource.type == "aws_s3_bucket_server_side_encryption_configuration"
    resource.values.rule[0].apply_server_side_encryption_by_default.sse_algorithm != "aws:kms"
}

# Require Object Lock for production
deny_no_object_lock_prod[resource] {
    resource := input.resources[_]
    resource.type == "aws_s3_bucket"
    resource.values.tags.env == "prod"
    not object_lock_enabled(resource.name)
}

object_lock_enabled(bucket_name) {
    some i
    input.resources[i].type == "aws_s3_bucket_object_lock_configuration"
    input.resources[i].name == bucket_name
    input.resources[i].values.object_lock_enabled == true
}

# Require cost allocation tags
deny_missing_cost_tags[resource] {
    resource := input.resources[_]
    required_tags := ["env", "cost_center", "owner", "project"]
    missing_tags := [tag | tag := required_tags[_]; not has_tag(resource, tag)]
    count(missing_tags) > 0
}

has_tag(resource, tag_name) {
    resource.values.tags[tag_name]
}

# Require monitoring for production
deny_no_monitoring_prod {
    some resource in input.resources
    resource.type == "aws_s3_bucket"
    resource.values.tags.env == "prod"
    not has_monitoring(resource.values.tags.env)
}

has_monitoring(env) {
    some i
    input.resources[i].type == "cloudflare_monitor"
    input.resources[i].values.tags.env == env
}

# Enforce least privilege IAM
deny_wildcard_iam_actions[resource] {
    resource := input.resources[_]
    resource.type == "aws_iam_policy"
    contains_wildcard(resource)
}

contains_wildcard(resource) {
    some i
    action := resource.values.policy.Statement[i].Action[_]
    action == "*"
}

# Require secure worker configurations
deny_insecure_worker[resource] {
    resource := input.resources[_]
    resource.type == "cloudflare_worker_script"
    is_old_compatibility_date(resource.values.compatibility_date)
}

is_old_compatibility_date(date) {
    date < "2024-01-01"
}

# Require secure TLS configurations
deny_insecure_tls[resource] {
    resource := input.resources[_]
    resource.type == "aws_lb_listener"
    resource.values.protocol != "HTTPS"
}

# Enforce naming conventions
deny_invalid_naming[resource] {
    resource := input.resources[_]
    invalid_name(resource)
}

invalid_name(resource) {
    resource.type == "aws_s3_bucket"
    not regex.match("^[a-z0-9][a-z0-9-]*[a-z0-9]$", resource.values.bucket)
}

invalid_name(resource) {
    resource.type == "cloudflare_worker_script"
    not regex.match("^[a-z0-9][a-z0-9-]*[a-z0-9]$", resource.values.name)
}

# Require appropriate resource limits
deny_excessive_queue_retention[resource] {
    resource := input.resources[_]
    resource.type == "cloudflare_queue"
    resource.values.message_retention_seconds > 1209600  # 14 days
}

deny_early_lifecycle_transition[resource] {
    resource := input.resources[_]
    resource.type == "aws_s3_bucket_lifecycle_configuration"
    resource.values.rule[0].transition[0].days < 30
}

# Package: terraform.cost
package terraform.cost

# Require cost tags for cost allocation
deny_missing_cost_tags[resource] {
    resource := input.resources[_]
    cost_tags := ["env", "cost_center", "owner", "project"]
    missing_cost_tags := [tag | tag := cost_tags[_]; not has_cost_tag(resource, tag)]
    count(missing_cost_tags) > 0
}

has_cost_tag(resource, tag_name) {
    resource.values.tags[tag_name]
}

# Require budget configuration for production
deny_no_budget_prod {
    some resource in input.resources
    resource.type == "aws_s3_bucket"
    resource.values.tags.env == "prod"
    not has_budget(resource.values.tags.env)
}

has_budget(env) {
    some i
    input.resources[i].type == "aws_budgets_budget"
    input.resources[i].values.tags.env == env
}

# Package: terraform.compliance
package terraform.compliance

# Require compliance mode for production storage
deny_no_compliance_mode[resource] {
    resource := input.resources[_]
    resource.type == "aws_s3_bucket_object_lock_configuration"
    resource.values.tags.env == "prod"
    resource.values.rule[0].default_retention.mode != "COMPLIANCE"
}

# Require audit logging for production
deny_no_audit_logging_prod {
    some resource in input.resources
    resource.type == "aws_s3_bucket"
    resource.values.tags.env == "prod"
    not has_audit_logging(resource.name)
}

has_audit_logging(bucket_name) {
    some i
    input.resources[i].type == "aws_s3_bucket_logging"
    input.resources[i].values.bucket == bucket_name
}

# Require data residency compliance
deny_invalid_data_residency[resource] {
    resource := input.resources[_]
    resource.type == "aws_s3_bucket"
    resource.values.tags.env == "prod"
    not allowed_region(resource.values.region)
}

allowed_region(region) {
    region in ["us-east-1", "us-west-2", "eu-west-1"]
}

# Package: terraform.monitoring
package terraform.monitoring

# Require health checks for production services
deny_no_health_checks_prod {
    some resource in input.resources
    resource.type == "cloudflare_worker_script"
    resource.values.tags.env == "prod"
    not has_health_check(resource.values.tags.env)
}

has_health_check(env) {
    some i
    input.resources[i].type == "cloudflare_monitor"
    input.resources[i].values.tags.env == env
    contains(input.resources[i].values.http_config.url, "/health")
}

# Require alerting configuration
deny_no_alerting_prod {
    some resource in input.resources
    resource.type == "cloudflare_monitor"
    resource.values.tags.env == "prod"
    count(resource.values.notification_channels) == 0
}

# Require OpenTelemetry for production
deny_no_otel_prod {
    some resource in input.resources
    resource.type == "cloudflare_worker_script"
    resource.values.tags.env == "prod"
    not has_otel_collector(resource.values.tags.env)
}

has_otel_collector(env) {
    some i
    input.resources[i].type == "helm_release"
    input.resources[i].values.chart == "opentelemetry-collector"
    input.resources[i].values.tags.env == env
}
