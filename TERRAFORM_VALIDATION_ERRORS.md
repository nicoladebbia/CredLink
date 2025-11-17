# Terraform Validation Errors - Technical Debt

**Discovery Date:** November 17, 2025  
**Severity:** CRITICAL - 95+ validation errors blocking deployment  
**Status:** PRE-EXISTING INFRASTRUCTURE ISSUES (not caused by security fixes)

---

## 🚨 Critical Validation Errors Summary

**Total Errors:** 95+ critical validation failures  
**Impact:** Complete deployment pipeline failure  
**Root Cause:** Pre-existing Terraform configuration issues  

---

## 📊 Error Categories

### 1. Missing Variables (Critical)
```
Error: Reference to undeclared input variable
- var.db_username (secrets.tf:20)
- var.db_password (secrets.tf:21)  
- var.jwt_secret (secrets.tf:40)
- var.dr_backup_retention_days (disaster-recovery.tf:250)
```

### 2. Invalid Resource Types (Critical)
```
Error: Invalid resource type
- aws_rds_enhanced_monitoring (performance.tf:329)
- aws_db_instance_performance_insights (performance.tf:361)
```

### 3. AWS Backup Plan Configuration Errors (Critical)
```
Error: Missing required argument / Unsupported argument
- aws_backup_plan resources in disaster-recovery.tf
- Incorrect rule structure and arguments
```

### 4. Missing Resource References (Critical)
```
Error: Reference to undeclared resource
- aws_ecs_service.main (multiple files)
- aws_secretsmanager.main (multiple files)
```

### 5. WAF Configuration Errors (Critical)
```
Error: Missing required argument / Insufficient blocks
- aws_wafv2_web_acl configuration issues
- Missing match_scope, oversize_handling, match_pattern blocks
```

### 6. ElastiCache Parameter Group Issues (Critical)
```
Error: Missing required argument / Unsupported argument
- aws_elasticache_parameter_group.name missing
- name_prefix not supported
```

---

## 🎯 Immediate Impact

**DEPLOYMENT STATUS:** 🔴 **COMPLETELY BLOCKED**
- Terraform validation fails with 95+ errors
- No infrastructure deployment possible
- CI/CD pipeline will fail at Terraform stage
- Rollback mechanisms cannot be tested

---

## 🛠️ Required Remediation Plan

### Phase 1: Variable Declaration (Immediate)
1. Add missing variables to `variables.tf`:
   ```hcl
   variable "db_username" {
     description = "Database username"
     type        = string
     default     = "credlink_user"
   }
   
   variable "db_password" {
     description = "Database password"
     type        = string
     sensitive   = true
   }
   
   variable "jwt_secret" {
     description = "JWT signing secret"
     type        = string
     sensitive   = true
   }
   
   variable "dr_backup_retention_days" {
     description = "DR backup retention period"
     type        = number
     default     = 2555
   }
   ```

### Phase 2: Resource Type Corrections (High Priority)
1. Remove invalid resource types:
   - `aws_rds_enhanced_monitoring` → Use AWS RDS built-in monitoring
   - `aws_db_instance_performance_insights` → Use `performance_insights_enabled` argument

### Phase 3: AWS Backup Plan Fixes (High Priority)
1. Fix backup plan rule structure:
   ```hcl
   rule {
     rule_name              = "daily_backups"
     target_vault_name      = aws_backup_vault.disaster_recovery.name
     schedule_expression    = "cron(0 2 * * ? *)"
     lifecycle {
       delete_after = 30
     }
   }
   ```

### Phase 4: Resource Reference Fixes (Medium Priority)
1. Fix ECS service references
2. Fix secrets manager references
3. Update all dependent resources

### Phase 5: WAF Configuration Fixes (Medium Priority)
1. Add required WAF rule arguments
2. Fix match_pattern blocks
3. Add missing match_scope and oversize_handling

### Phase 6: ElastiCache Fixes (Low Priority)
1. Fix parameter group configuration
2. Remove unsupported arguments

---

## 📋 Testing Requirements

### Pre-Deployment Validation
```bash
# Must pass all validation commands
terraform fmt -check -recursive
terraform validate
terraform plan -out=tfplan
```

### Integration Testing
```bash
# Test with actual AWS credentials
terraform apply -target=aws_secretsmanager_secret.main
terraform apply -target=aws_db_instance.main
```

---

## 🚨 Risk Assessment

**Current Risk Level:** 🔴 **CRITICAL**
- Complete deployment failure
- Infrastructure provisioning impossible
- Security fixes cannot be deployed

**Post-Fix Risk Level:** 🟡 **MEDIUM**
- Complex infrastructure changes
- Potential for breaking existing resources
- Requires careful migration planning

---

## 📞 Ownership

**Infrastructure Team:** Primary responsibility  
**Security Team:** Review security implications  
**DevOps Team:** Deployment coordination  

---

## 📅 Timeline Estimate

- **Phase 1 (Variables):** 2-4 hours
- **Phase 2 (Resource Types):** 4-6 hours  
- **Phase 3 (Backup Plans):** 6-8 hours
- **Phase 4 (References):** 8-12 hours
- **Phase 5 (WAF):** 4-6 hours
- **Phase 6 (ElastiCache):** 2-4 hours

**Total Estimated Effort:** 26-40 hours

---

*This document will be updated as fixes are implemented and tested.*
