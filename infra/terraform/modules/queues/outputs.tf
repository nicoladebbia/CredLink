# Queues module outputs

output "queue_names" {
  description = "List of queue names"
  value       = [for q in cloudflare_queue.queues : q.name]
}

output "queue_ids" {
  description = "List of queue IDs"
  value       = [for q in cloudflare_queue.queues : q.id]
}
