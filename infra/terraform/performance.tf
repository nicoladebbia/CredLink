#---------------------------------------------------
# Performance Optimization - Week 7
#---------------------------------------------------

# CloudFront CDN for Static Assets
resource "aws_cloudfront_distribution" "main" {
  enabled = true
  comment = "${var.project_name}-${var.environment} CDN"

  # Origin for API (ALB)
  origin {
    domain_name = aws_lb.main.dns_name
    origin_id   = "api-origin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Origin for S3 static assets
  origin {
    domain_name = aws_s3_bucket.proofs.bucket_regional_domain_name
    origin_id   = "s3-origin"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.main.cloudfront_access_identity_path
    }
  }

  # Default cache behavior for API
  default_cache_behavior {
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "api-origin"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = true
      headers      = ["*"]
      cookies {
        forward = "all"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  # Cache behavior for static assets
  ordered_cache_behavior {
    path_pattern           = "/static/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-origin"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 86400  # 1 day
    default_ttl = 604800 # 1 week
    max_ttl     = 31536000 # 1 year
  }

  # Cache behavior for proofs
  ordered_cache_behavior {
    path_pattern           = "/proofs/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-origin"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 3600   # 1 hour
    default_ttl = 86400  # 1 day
    max_ttl     = 604800 # 1 week
  }

  # Restrictions
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # SSL Certificate
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  # Logging
  logging_config {
    include_cookies = false
    bucket          = aws_s3_bucket.cloudfront_logs.id
    prefix          = "cloudfront-logs/"
  }

  tags = var.tags
}

# CloudFront Origin Access Identity
resource "aws_cloudfront_origin_access_identity" "main" {
  comment = "${var.project_name}-${var.environment} OAI"
}

# S3 bucket for CloudFront logs
resource "aws_s3_bucket" "cloudfront_logs" {
  bucket = "${var.project_name}-${var.environment}-cloudfront-logs"

  tags = var.tags
}

resource "aws_s3_bucket_versioning" "cloudfront_logs" {
  bucket = aws_s3_bucket.cloudfront_logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudfront_logs" {
  bucket = aws_s3_bucket.cloudfront_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "cloudfront_logs" {
  bucket = aws_s3_bucket.cloudfront_logs.id

  rule {
    id     = "logs"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }
  }
}

# S3 bucket policy for CloudFront access
resource "aws_s3_bucket_policy" "cloudfront_access" {
  bucket = aws_s3_bucket.proofs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipal"
        Effect    = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.proofs.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.main.arn
          }
        }
      }
    ]
  })
}

#---------------------------------------------------
# Enhanced Auto-Scaling - Week 7
#---------------------------------------------------

# Enhanced ECS auto-scaling with more metrics
resource "aws_appautoscaling_target" "ecs_enhanced" {
  max_capacity       = 20
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.main.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# Scale out on CPU
resource "aws_appautoscaling_policy" "ecs_scale_out_cpu" {
  name               = "${var.project_name}-${var.environment}-ecs-scale-out-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_enhanced.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_enhanced.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_enhanced.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 60.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Scale out on memory
resource "aws_appautoscaling_policy" "ecs_scale_out_memory" {
  name               = "${var.project_name}-${var.environment}-ecs-scale-out-memory"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_enhanced.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_enhanced.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_enhanced.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Scale out on ALB request count
resource "aws_appautoscaling_policy" "ecs_scale_out_requests" {
  name               = "${var.project_name}-${var.environment}-ecs-scale-out-requests"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_enhanced.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_enhanced.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_enhanced.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${aws_lb.main.arn_suffix}/${aws_lb_target_group.main.arn_suffix}"
    }
    target_value       = 1000.0  # 1000 requests per target
    scale_in_cooldown  = 300
    scale_out_cooldown = 30
  }
}

#---------------------------------------------------
# Performance Monitoring - Week 7
#---------------------------------------------------

# CloudWatch custom metrics for performance
resource "aws_cloudwatch_log_metric_filter" "response_time" {
  name           = "${var.project_name}-${var.environment}-response-time"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "response_time"

  metric_transformation {
    name      = "ResponseTime"
    namespace = "CredLinkPerformance"
    value     = "$.response_time"
  }
}

resource "aws_cloudwatch_log_metric_filter" "request_size" {
  name           = "${var.project_name}-${var.environment}-request-size"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "request_size"

  metric_transformation {
    name      = "RequestSize"
    namespace = "CredLinkPerformance"
    value     = "$.request_size"
  }
}

# Performance alarms
resource "aws_cloudwatch_metric_alarm" "high_response_time" {
  alarm_name          = "${var.project_name}-${var.environment}-high-response-time"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "ResponseTime"
  namespace           = "CredLinkPerformance"
  period              = "300"
  statistic           = "Average"
  threshold           = "500"  # 500ms
  alarm_description   = "High response time detected"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "high_request_rate" {
  alarm_name          = "${var.project_name}-${var.environment}-high-request-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "SignOperations"
  namespace           = "CredLink"
  period              = "300"
  statistic           = "Sum"
  threshold           = "10000"  # 10K requests per 5 min
  alarm_description   = "High request rate detected"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  tags = var.tags
}

#---------------------------------------------------
# RDS Performance Enhancement - Week 7
#---------------------------------------------------

# Enhanced monitoring for RDS
resource "aws_rds_enhanced_monitoring" "main" {
  identifier = aws_db_instance.main.id
  role_arn   = aws_iam_role.rds_enhanced_monitoring.arn
  granularity = "1"  # 1 second granularity
}

# IAM role for RDS enhanced monitoring
resource "aws_iam_role" "rds_enhanced_monitoring" {
  name = "${var.project_name}-${var.environment}-rds-enhanced-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "rds_enhanced_monitoring" {
  role       = aws_iam_role.rds_enhanced_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# Performance Insights for RDS
resource "aws_db_instance_performance_insights" "main" {
  identifier = aws_db_instance.main.id
  enabled    = true
  retention_period = 7  # days
}

#---------------------------------------------------
# Placeholder for Week 8:
# - Disaster Recovery Testing
# - Chaos Engineering
# - Production Launch Checklist
#---------------------------------------------------
