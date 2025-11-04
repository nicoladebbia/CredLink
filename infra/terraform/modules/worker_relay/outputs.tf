# Worker relay module outputs

output "script_name" {
  description = "Name of the worker script"
  value       = cloudflare_worker_script.worker.name
}

output "worker_id" {
  description = "ID of the worker"
  value       = cloudflare_worker_script.worker.id
}
