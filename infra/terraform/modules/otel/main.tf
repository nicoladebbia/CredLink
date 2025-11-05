terraform {
  required_version = "~> 1.9"
  required_providers {
    kubernetes = { source = "hashicorp/kubernetes", version = "~> 2.35" }
    helm       = { source = "hashicorp/helm", version = "~> 2.16" }
  }
}

# OpenTelemetry Collector module


locals {
  name_prefix = "${var.project}-${var.env}"
  common_tags = merge(var.tags, {
    module = "otel"
  })
}


# Create namespace
resource "kubernetes_namespace" "otel" {
  metadata {
    name = var.namespace
    labels = merge(local.common_tags, {
      name = var.namespace
    })
  }
}

# Helm provider for OpenTelemetry Collector
provider "helm" {
  kubernetes {
    config_path = var.kubeconfig_path
  }
}

# OpenTelemetry Collector Helm release
resource "helm_release" "otel_collector" {
  name       = "${local.name_prefix}-otel-collector"
  repository = "https://open-telemetry.github.io/opentelemetry-helm-charts"
  chart      = "opentelemetry-collector"
  namespace  = kubernetes_namespace.otel.metadata[0].name
  version    = "0.79.0"

  values = [
    yamlencode({
      mode = "deployment"

      replicas = 2

      image = {
        repository = "otel/opentelemetry-collector-contrib"
        tag        = "0.99.0"
      }

      config = merge({
        receivers = [
          {
            otlp = {
              protocols = {
                grpc = {
                  endpoint = "0.0.0.0:4317"
                }
                http = {
                  endpoint = "0.0.0.0:4318"
                }
              }
            }
          },
          {
            prometheus = {
              config = {
                scrape_configs = [
                  {
                    job_name = "kubernetes-pods"
                    kubernetes_sd_configs = [
                      {
                        role = "pod"
                      }
                    ]
                  }
                ]
              }
            }
          }
        ]

        processors = [
          {
            batch = {}
          },
          {
            memory_limiter = {
              limit_mib = 512
            }
          },
          {
            resource = {
              attributes = [
                {
                  key   = "environment"
                  value = var.env
                },
                {
                  key   = "project"
                  value = var.project
                },
                {
                  key   = "service.name"
                  value = "${local.name_prefix}-collector"
                }
              ]
            }
          }
        ]

        exporters = var.otlp_endpoint != "" ? [
          {
            otlp = {
              endpoint = var.otlp_endpoint
              headers = var.otlp_api_key != "" ? {
                "api-key" = var.otlp_api_key
              } : {}
            }
          }
          ] : [
          {
            logging = {
              loglevel = "info"
            }
          }
        ]

        service = {
          pipelines = {
            traces = {
              receivers  = ["otlp"]
              processors = ["memory_limiter", "batch", "resource"]
              exporters  = var.otlp_endpoint != "" ? ["otlp"] : ["logging"]
            }
            metrics = {
              receivers  = ["otlp", "prometheus"]
              processors = ["memory_limiter", "batch", "resource"]
              exporters  = var.otlp_endpoint != "" ? ["otlp"] : ["logging"]
            }
            logs = {
              receivers  = ["otlp"]
              processors = ["memory_limiter", "batch", "resource"]
              exporters  = var.otlp_endpoint != "" ? ["otlp"] : ["logging"]
            }
          }
        }
      }, var.collector_config)

      serviceMonitor = {
        enabled   = true
        namespace = var.namespace
      }

      podAnnotations = {
        "prometheus.io/scrape" = "true"
        "prometheus.io/port"   = "8888"
        "prometheus.io/path"   = "/metrics"
      }

      resources = {
        limits = {
          cpu    = "500m"
          memory = "512Mi"
        }
        requests = {
          cpu    = "100m"
          memory = "128Mi"
        }
      }

      nodeSelector = {
        "kubernetes.io/os" = "linux"
      }

      tolerations = [
        {
          key      = "node-role.kubernetes.io/master"
          operator = "Exists"
          effect   = "NoSchedule"
        }
      ]

      affinity = {
        podAntiAffinity = {
          preferredDuringSchedulingIgnoredDuringExecution = [
            {
              weight = 100
              podAffinityTerm = {
                labelSelector = {
                  matchLabels = {
                    "app.kubernetes.io/name" = "opentelemetry-collector"
                  }
                }
                topologyKey = "kubernetes.io/hostname"
              }
            }
          ]
        }
      }
    })
  ]

  depends_on = [kubernetes_namespace.otel]
}

# Service for OpenTelemetry Collector
resource "kubernetes_service" "otel_collector" {
  metadata {
    name      = "${local.name_prefix}-otel-collector"
    namespace = kubernetes_namespace.otel.metadata[0].name
    labels = merge(local.common_tags, {
      app = "otel-collector"
    })
    annotations = {
      "prometheus.io/scrape" = "true"
      "prometheus.io/port"   = "8888"
      "prometheus.io/path"   = "/metrics"
    }
  }

  spec {
    selector = {
      "app.kubernetes.io/name"     = "opentelemetry-collector"
      "app.kubernetes.io/instance" = helm_release.otel_collector.name
    }

    port = [
      {
        name        = "otlp-grpc"
        port        = 4317
        target_port = 4317
        protocol    = "TCP"
      },
      {
        name        = "otlp-http"
        port        = 4318
        target_port = 4318
        protocol    = "TCP"
      },
      {
        name        = "metrics"
        port        = 8888
        target_port = 8888
        protocol    = "TCP"
      }
    ]

    type = "ClusterIP"
  }
}

# ServiceAccount for OpenTelemetry Collector
resource "kubernetes_service_account" "otel_collector" {
  metadata {
    name      = "${local.name_prefix}-otel-collector"
    namespace = kubernetes_namespace.otel.metadata[0].name
    labels    = local.common_tags
  }
}

# ConfigMap for additional collector configuration
resource "kubernetes_config_map" "otel_config" {
  metadata {
    name      = "${local.name_prefix}-otel-config"
    namespace = kubernetes_namespace.otel.metadata[0].name
    labels    = local.common_tags
  }

  data = {
    "collector.yaml" = yamlencode({
      exporters = {
        file = {
          path = "/tmp/otel-output.json"
        }
      }
    })
  }
}

# Variable for OTLP API key
variable "otlp_api_key" {
  description = "OTLP API key for authentication"
  type        = string
  default     = ""
  sensitive   = true
}

# Outputs
output "collector_endpoint" {
  description = "OpenTelemetry Collector endpoint"
  value       = "${kubernetes_service.otel_collector.metadata[0].name}.${kubernetes_namespace.otel.metadata[0].name}.svc.cluster.local:4317"
}

output "collector_http_endpoint" {
  description = "OpenTelemetry Collector HTTP endpoint"
  value       = "${kubernetes_service.otel_collector.metadata[0].name}.${kubernetes_namespace.otel.metadata[0].name}.svc.cluster.local:4318"
}

output "metrics_endpoint" {
  description = "Metrics endpoint"
  value       = "${kubernetes_service.otel_collector.metadata[0].name}.${kubernetes_namespace.otel.metadata[0].name}.svc.cluster.local:8888/metrics"
}

output "namespace" {
  description = "Kubernetes namespace"
  value       = kubernetes_namespace.otel.metadata[0].name
}

output "helm_release_name" {
  description = "Helm release name"
  value       = helm_release.otel_collector.name
}
