# Queues module outputs

output "queue_names" {
  description = "List of queue names"
  value       = [for q in cloudflare_queue.queue : q.name]
}

output "queue_arns" {
  description = "List of queue ARNs"
  value       = [for q in cloudflare_queue.queue : q.arn]
}
