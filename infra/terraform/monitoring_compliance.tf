# ============================================================
# UnderwriteOS — Monitoring, Compliance & Threat Detection
# ============================================================

# ── CloudTrail — audit all AWS API calls ────────────────────
resource "aws_cloudtrail" "underwriteos" {
  name                          = "underwriteos-trail-${var.environment}"
  s3_bucket_name                = aws_s3_bucket.cloudtrail.id
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true   # Detects tampered log files

  # Encrypt CloudTrail logs
  kms_key_id = aws_kms_key.underwriteos_cmk.arn

  # Log data events (S3 object access, Lambda invocations)
  event_selector {
    read_write_type           = "All"
    include_management_events = true

    data_resource {
      type   = "AWS::S3::Object"
      values = ["${aws_s3_bucket.underwriteos_data.arn}/"]
    }

    data_resource {
      type   = "AWS::Lambda::Function"
      values = ["arn:aws:lambda:${var.aws_region}:${var.aws_account_id}:function:underwriteos-*"]
    }
  }

  tags = { Project = "UnderwriteOS" }
}

# ── GuardDuty — ML-based threat detection ───────────────────
resource "aws_guardduty_detector" "underwriteos" {
  enable = true

  datasources {
    s3_logs { enable = true }
    kubernetes { audit_logs { enable = true } }
    malware_protection {
      scan_ec2_instance_with_findings {
        ebs_volumes { enable = true }
      }
    }
  }

  tags = { Project = "UnderwriteOS" }
}

# Alert admin on GuardDuty findings
resource "aws_cloudwatch_event_rule" "guardduty_findings" {
  name        = "underwriteos-guardduty-findings"
  description = "Alert on GuardDuty findings severity >= HIGH"

  event_pattern = jsonencode({
    source      = ["aws.guardduty"]
    detail-type = ["GuardDuty Finding"]
    detail = {
      severity = [{ numeric = [">=", 7] }]  # 7+ = HIGH, 9+ = CRITICAL
    }
  })
}

resource "aws_cloudwatch_event_target" "guardduty_sns" {
  rule      = aws_cloudwatch_event_rule.guardduty_findings.name
  target_id = "SendToSNS"
  arn       = aws_sns_topic.security_alerts.arn
}

# ── AWS Config — enforce encryption compliance ───────────────
resource "aws_config_config_rule" "rds_encrypted" {
  name = "underwriteos-rds-storage-encrypted"
  source {
    owner             = "AWS"
    source_identifier = "RDS_STORAGE_ENCRYPTED"
  }
  tags = { Project = "UnderwriteOS" }
}

resource "aws_config_config_rule" "s3_encrypted" {
  name = "underwriteos-s3-bucket-server-side-encryption-enabled"
  source {
    owner             = "AWS"
    source_identifier = "S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED"
  }
  tags = { Project = "UnderwriteOS" }
}

resource "aws_config_config_rule" "s3_ssl_only" {
  name = "underwriteos-s3-bucket-ssl-requests-only"
  source {
    owner             = "AWS"
    source_identifier = "S3_BUCKET_SSL_REQUESTS_ONLY"
  }
  tags = { Project = "UnderwriteOS" }
}

resource "aws_config_config_rule" "kms_rotation" {
  name = "underwriteos-cmk-backing-key-rotation-enabled"
  source {
    owner             = "AWS"
    source_identifier = "CMK_BACKING_KEY_ROTATION_ENABLED"
  }
  tags = { Project = "UnderwriteOS" }
}

resource "aws_config_config_rule" "secrets_rotation" {
  name = "underwriteos-secretsmanager-rotation-enabled-check"
  source {
    owner             = "AWS"
    source_identifier = "SECRETSMANAGER_ROTATION_ENABLED_CHECK"
  }
  tags = { Project = "UnderwriteOS" }
}

# ── WAF — rate limiting + managed rules ─────────────────────
resource "aws_wafv2_web_acl" "underwriteos" {
  name  = "underwriteos-waf-${var.environment}"
  scope = "CLOUDFRONT"

  default_action { allow {} }

  # AWS Managed Rules — common threats
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "CommonRuleSet"
      sampled_requests_enabled   = true
    }
  }

  # Block known bad IPs
  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "KnownBadInputs"
      sampled_requests_enabled   = true
    }
  }

  # Rate limit — 100 requests per 5 minutes per IP
  rule {
    name     = "RateLimitPerIP"
    priority = 3
    action { block {} }
    statement {
      rate_based_statement {
        limit              = 100
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "underwriteos-waf"
    sampled_requests_enabled   = true
  }

  tags = { Project = "UnderwriteOS" }
}

# ── SNS — security alert notifications ──────────────────────
resource "aws_sns_topic" "security_alerts" {
  name              = "underwriteos-security-alerts-${var.environment}"
  kms_master_key_id = aws_kms_key.underwriteos_cmk.arn
  tags              = { Project = "UnderwriteOS" }
}

resource "aws_sns_topic_subscription" "security_email" {
  topic_arn = aws_sns_topic.security_alerts.arn
  protocol  = "email"
  endpoint  = var.security_alert_email
}
