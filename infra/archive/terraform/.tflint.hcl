config {
  format = "compact"
  
  plugin_dir = "~/.tflint.d/plugins"
  
  module = true
  
  force = false
  
  disabled_by_default = false
  
  ignore_module = {
    "terraform-aws-modules/vpc/aws" = true
    "terraform-aws-modules/security-group/aws" = true
  }
  
  varfile = []
  
  variables = true
  
  call_module_type = "all"
  
  terraform_version = ">= 1.0"
  
  deep_check = false
}

rule "terraform_comment_syntax" {
  enabled = true
}

rule "terraform_deprecated_index" {
  enabled = true
}

rule "terraform_deprecated_interpolation" {
  enabled = true
}

rule "terraform_documented_outputs" {
  enabled = false
}

rule "terraform_documented_variables" {
  enabled = false
}

rule "terraform_empty_list_equality" {
  enabled = false
}

rule "terraform_env_var_usage" {
  enabled = false
}

rule "terraform_error_message" {
  enabled = false
}

rule "terraform_formatting" {
  enabled = false
}

rule "terraform_invalid_column_type" {
  enabled = true
}

rule "terraform_module_call_decl" {
  enabled = true
}

rule "terraform_module_pinned_source" {
  enabled = true
}

rule "terraform_module_version" {
  enabled = true
}

rule "terraform_naming_convention" {
  enabled = false
}

rule "terraform_required_providers" {
  enabled = true
}

rule "terraform_required_version" {
  enabled = true
}

rule "terraform_standard_library" {
  enabled = false
}

rule "terraform_typed_variables" {
  enabled = false
}

rule "terraform_unused_declarations" {
  enabled = true
}

rule "terraform_unused_required_providers" {
  enabled = true
}

rule "terraform_unused_variable" {
  enabled = false
}

rule "terraform_workspace_invalid" {
  enabled = true
}

rule "terraform_workspace_remote" {
  enabled = false
}
