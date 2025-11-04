# Cost module outputs

output "cost_allocation_tag_id" {
  description = "AWS cost allocation tag ID"
  value       = var.enable_aws_cost_allocation ? aws_costallocationtag.cost_tags[0].id : null
}

output "cost_center_tag" {
  description = "Cost center tag value"
  value       = var.cost_center
}
