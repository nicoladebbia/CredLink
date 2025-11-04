# Terraform Makefile for C2 Concierge Infrastructure
# Phase 45 - Terraform & Infra Blueprints (v1.2)

.PHONY: help init plan apply destroy validate fmt lint test clean demo staging prod

# Default target
help:
	@echo "C2 Concierge Terraform Infrastructure Management"
	@echo ""
	@echo "Available targets:"
	@echo "  init          - Initialize Terraform configuration"
	@echo "  validate      - Validate Terraform configuration"
	@echo "  fmt           - Format Terraform files"
	@echo "  lint          - Run Terraform linter"
	@echo "  plan          - Show execution plan"
	@echo "  apply         - Apply configuration"
	@echo "  destroy       - Destroy infrastructure"
	@echo "  test          - Run smoke tests"
	@echo "  clean         - Clean temporary files"
	@echo "  demo          - Deploy demo environment"
	@echo "  staging       - Deploy staging environment"
	@echo "  prod          - Deploy production environment"
	@echo "  destroy-demo  - Destroy demo environment"
	@echo "  destroy-staging - Destroy staging environment"
	@echo "  destroy-prod  - Destroy production environment"
	@echo ""
	@echo "Usage examples:"
	@echo "  make demo ENV=demo"
	@echo "  make staging ENV=staging"
	@echo "  make prod ENV=prod"

# Environment variables
ENV ?= demo
TF_VAR_file ?= terraform.tfvars
workspace = envs/$(ENV)

# Terraform commands with workspace
init:
	@echo "Initializing Terraform for $(ENV) environment..."
	cd $(workspace) && terraform init -upgrade -lockfile=readonly

validate: init
	@echo "Validating Terraform configuration for $(ENV)..."
	cd $(workspace) && terraform validate

fmt:
	@echo "Formatting Terraform files..."
	terraform fmt -recursive

lint: fmt
	@echo "Running Terraform linter..."
	cd $(workspace) && terraform fmt -check -recursive
	cd $(workspace) && terraform validate

plan: validate
	@echo "Planning Terraform deployment for $(ENV)..."
	cd $(workspace) && terraform plan -detailed-exitcode -var-file=$(TF_VAR_file)

apply: validate
	@echo "Applying Terraform configuration for $(ENV)..."
	cd $(workspace) && terraform apply -auto-approve -var-file=$(TF_VAR_file)

destroy: validate
	@echo "Destroying Terraform infrastructure for $(ENV)..."
	cd $(workspace) && terraform destroy -auto-approve -var-file=$(TF_VAR_file)

# Environment-specific targets
demo: validate
	@echo "Deploying demo environment..."
	cd envs/demo && terraform apply -auto-approve -var-file=terraform.tfvars

staging: validate
	@echo "Deploying staging environment..."
	cd envs/staging && terraform apply -auto-approve -var-file=terraform.tfvars

prod: validate
	@echo "Deploying production environment..."
	cd envs/prod && terraform apply -auto-approve -var-file=terraform.tfvars

# Environment-specific destroy targets
destroy-demo:
	@echo "Destroying demo environment..."
	cd envs/demo && terraform destroy -auto-approve -var-file=terraform.tfvars

destroy-staging:
	@echo "Destroying staging environment..."
	cd envs/staging && terraform destroy -auto-approve -var-file=terraform.tfvars

destroy-prod:
	@echo "Destroying production environment..."
	cd envs/prod && terraform destroy -auto-approve -var-file=terraform.tfvars

# Testing and validation
test: apply
	@echo "Running smoke tests for $(ENV)..."
	./scripts/smoke-tests.sh $(ENV)

clean:
	@echo "Cleaning temporary files..."
	find . -name "*.tfstate*" -delete
	find . -name ".terraform*" -exec rm -rf {} +
	find . -name ".terraform.lock.hcl" -delete

# CI/CD pipeline targets
ci-plan:
	@echo "CI: Planning deployment for $(ENV)..."
	cd $(workspace) && terraform init -upgrade -lockfile=readonly
	cd $(workspace) && terraform validate
	cd $(workspace) && terraform plan -detailed-exitcode -var-file=$(TF_VAR_file)

ci-apply:
	@echo "CI: Applying deployment for $(ENV)..."
	cd $(workspace) && terraform init -upgrade
	cd $(workspace) && terraform apply -auto-approve -var-file=$(TF_VAR_file)

# Drift detection
drift-detect:
	@echo "Detecting drift for $(ENV)..."
	cd $(workspace) && terraform plan -detailed-exitcode -var-file=$(TF_VAR_file) -out=drift.plan
	@if [ $$? -eq 1 ]; then \
		echo "Drift detected!"; \
		cd $(workspace) && terraform show drift.plan; \
	else \
		echo "No drift detected."; \
	fi

# Security scanning
security-scan:
	@echo "Running security scan..."
	@if command -v tfsec >/dev/null 2>&1; then \
		tfsec $(workspace); \
	else \
		echo "tfsec not installed, skipping security scan"; \
	fi

# Cost estimation
cost-estimate:
	@echo "Estimating costs for $(ENV)..."
	cd $(workspace) && terraform plan -detailed-exitcode -var-file=$(TF_VAR_file) -out=cost.plan
	@if command -v infracost >/dev/null 2>&1; then \
		infracost breakdown --path cost.plan; \
	else \
		echo "infracost not installed, skipping cost estimation"; \
	fi

# Documentation generation
docs:
	@echo "Generating documentation..."
	@if command -v terraform-docs >/dev/null 2>&1; then \
		terraform-docs markdown table ./modules; \
		terraform-docs markdown table ./envs/$(ENV); \
	else \
		echo "terraform-docs not installed, skipping documentation generation"; \
	fi

# Backup and restore
backup:
	@echo "Backing up Terraform state for $(ENV)..."
	cd $(workspace) && terraform state pull > state-backup-$(shell date +%Y%m%d-%H%M%S).json

restore:
	@echo "Restoring Terraform state for $(ENV)..."
	@read -p "Enter backup file path: " backup_file; \
	cd $(workspace) && terraform state push "$$backup_file"

# Import existing resources
import:
	@echo "Importing existing resources..."
	@read -p "Enter resource address: " resource_addr; \
	read -p "Enter resource ID: " resource_id; \
	cd $(workspace) && terraform import "$$resource_addr" "$$resource_id"

# Workspace management
workspace-new:
	@echo "Creating new workspace: $(ENV)"
	terraform workspace new $(ENV)

workspace-select:
	@echo "Selecting workspace: $(ENV)"
	terraform workspace select $(ENV)

workspace-list:
	@echo "Listing workspaces:"
	terraform workspace list

# Output management
output:
	@echo "Getting outputs for $(ENV)..."
	cd $(workspace) && terraform output

output-json:
	@echo "Getting JSON outputs for $(ENV)..."
	cd $(workspace) && terraform output -json

# Force unlock (emergency use)
force-unlock:
	@echo "Force unlocking Terraform state for $(ENV)..."
	@read -p "Enter lock ID: " lock_id; \
	cd $(workspace) && terraform force-unlock "$$lock_id"

# Version management
version:
	@echo "Terraform version:"
	terraform version
	@echo "Provider versions:"
	cd $(workspace) && terraform providers

# Upgrade providers
upgrade:
	@echo "Upgrading providers for $(ENV)..."
	cd $(workspace) && terraform init -upgrade

# Graph visualization
graph:
	@echo "Generating dependency graph for $(ENV)..."
	cd $(workspace) && terraform graph -type=plan | dot -Tpng > dependency-graph.png

# State management
state-list:
	@echo "Listing managed resources for $(ENV)..."
	cd $(workspace) && terraform state list

state-show:
	@echo "Showing resource state for $(ENV)..."
	@read -p "Enter resource address: " resource_addr; \
	cd $(workspace) && terraform state show "$$resource_addr"

state-rm:
	@echo "Removing resource from state for $(ENV)..."
	@read -p "Enter resource address: " resource_addr; \
	cd $(workspace) && terraform state rm "$$resource_addr"

# Taint and untaint resources
taint:
	@echo "Tainting resource for $(ENV)..."
	@read -p "Enter resource address: " resource_addr; \
	cd $(workspace) && terraform taint "$$resource_addr"

untaint:
	@echo "Untainting resource for $(ENV)..."
	@read -p "Enter resource address: " resource_addr; \
	cd $(workspace) && terraform untaint "$$resource_addr"

# Refresh state
refresh:
	@echo "Refreshing state for $(ENV)..."
	cd $(workspace) && terraform refresh -var-file=$(TF_VAR_file)

# Comprehensive deployment pipeline
deploy: validate security-scan cost-estimate apply test
	@echo "Deployment completed for $(ENV)"

# Comprehensive teardown pipeline
teardown: destroy clean
	@echo "Teardown completed for $(ENV)"
