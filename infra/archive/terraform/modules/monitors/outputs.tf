# Monitors module outputs

output "monitor_ids" {
  description = "List of monitor IDs"
  value       = [for m in cloudflare_monitor.monitor : m.id]
}

output "health_check_urls" {
  description = "List of health check URLs"
  value       = [for h in var.health_checks : h.url]
}
