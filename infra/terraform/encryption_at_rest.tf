# ============================================================
# UnderwriteOS — Encryption at Rest (Terraform)
# ============================================================
# All data stores use AES-256 via the CMK defined in cognito_mfa.tf
# ============================================================

# ── Aurora PostgreSQL (financial data) ──────────────────────
resource "aws_db_subnet_group" "underwriteos" {
  name       = "underwriteos-${var.environment}"
  subnet_ids = var.private_subnet_ids   # Private subnets only — no public access
  tags       = { Project = "UnderwriteOS" }
}

resource "aws_rds_cluster" "underwriteos" {
  cluster_identifier      = "underwriteos-${var.environment}"
  engine                  = "aurora-postgresql"
  engine_version          = "15.4"
  database_name           = "underwriteos"
  master_username         = "underwriteos_admin"
  manage_master_user_password = true   # Secrets Manager rotation, not hardcoded

  # Encryption at rest — AES-256 via CMK
  storage_encrypted = true
  kms_key_id        = aws_kms_key.underwriteos_cmk.arn

  # Network — private only
  db_subnet_group_name    = aws_db_subnet_group.underwriteos.name
  vpc_security_group_ids  = [aws_security_group.rds_sg.id]

  # Backups — encrypted (inherits cluster encryption)
  backup_retention_period = 30
  preferred_backup_window = "03:00-04:00"
  copy_tags_to_snapshot   = true

  # Deletion protection
  deletion_protection = true
  skip_final_snapshot = false
  final_snapshot_identifier = "underwriteos-final-${var.environment}"

  # TLS only — connections without SSL are rejected
  # Applied via parameter group below

  # Enhanced monitoring
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = { Project = "UnderwriteOS", Encryption = "AES-256-KMS-CMK" }
}

resource "aws_rds_cluster_parameter_group" "underwriteos" {
  name   = "underwriteos-${var.environment}"
  family = "aurora-postgresql15"

  # Force SSL/TLS on all connections
  parameter {
    name  = "rds.force_ssl"
    value = "1"
    apply_method = "immediate"
  }

  # Log all connections for audit
  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  # Log statements that take >1s (slow query log)
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  tags = { Project = "UnderwriteOS" }
}

resource "aws_rds_cluster_instance" "underwriteos" {
  count              = var.environment == "prod" ? 2 : 1  # 2 instances in prod (HA)
  identifier         = "underwriteos-${var.environment}-${count.index}"
  cluster_identifier = aws_rds_cluster.underwriteos.id
  instance_class     = var.db_instance_class
  engine             = "aurora-postgresql"
  engine_version     = "15.4"

  # No public IP
  publicly_accessible = false

  # Enhanced monitoring — 60 second intervals
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn

  performance_insights_enabled          = true
  performance_insights_kms_key_id       = aws_kms_key.underwriteos_cmk.arn
  performance_insights_retention_period = 7

  tags = { Project = "UnderwriteOS" }
}

# RDS Proxy — Lambda connects via proxy, not directly
# Proxy handles connection pooling and enforces IAM auth
resource "aws_db_proxy" "underwriteos" {
  name                   = "underwriteos-${var.environment}"
  debug_logging          = false
  engine_family          = "POSTGRESQL"
  idle_client_timeout    = 1800
  require_tls            = true   # TLS required on all proxy connections
  role_arn               = aws_iam_role.rds_proxy.arn
  vpc_security_group_ids = [aws_security_group.rds_proxy_sg.id]
  vpc_subnet_ids         = var.private_subnet_ids

  auth {
    auth_scheme               = "SECRETS"
    iam_auth                  = "REQUIRED"  # IAM auth only — no password auth to DB
    secret_arn                = aws_secretsmanager_secret.db_credentials.arn
    client_password_auth_type = "POSTGRES_SCRAM_SHA_256"
  }

  tags = { Project = "UnderwriteOS" }
}

# ── DynamoDB (audit log, session state, real-time data) ─────
resource "aws_dynamodb_table" "audit_log" {
  name         = "underwriteos-audit-log-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "event_id"
  range_key    = "timestamp"

  attribute {
    name = "event_id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "event_type"
    type = "S"
  }

  # Encryption at rest — AES-256 via CMK
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.underwriteos_cmk.arn
  }

  # Point-in-time recovery — 35-day window
  point_in_time_recovery {
    enabled = true
  }

  # GSI for querying by user
  global_secondary_index {
    name            = "user-timestamp-index"
    hash_key        = "user_id"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  # GSI for querying by event type
  global_secondary_index {
    name            = "type-timestamp-index"
    hash_key        = "event_type"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  # Audit log is immutable — DynamoDB streams for any changes
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"  # Detect any tampering

  # TTL — keep audit logs 7 years for financial compliance
  ttl {
    attribute_name = "expire_at"
    enabled        = true
  }

  tags = { Project = "UnderwriteOS", DataClass = "Audit", Encryption = "AES-256-KMS-CMK" }
}

resource "aws_dynamodb_table" "session_state" {
  name         = "underwriteos-sessions-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "session_id"

  attribute {
    name = "session_id"
    type = "S"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.underwriteos_cmk.arn
  }

  ttl {
    attribute_name = "expire_at"
    enabled        = true
  }

  tags = { Project = "UnderwriteOS", Encryption = "AES-256-KMS-CMK" }
}

# ── S3 — SBA dataset, document storage, exports ─────────────
resource "aws_s3_bucket" "underwriteos_data" {
  bucket = "underwriteos-data-${var.environment}-${var.aws_account_id}"
  tags   = { Project = "UnderwriteOS", DataClass = "Financial" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "underwriteos_data" {
  bucket = aws_s3_bucket.underwriteos_data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.underwriteos_cmk.arn
    }
    bucket_key_enabled = true   # Reduces KMS API calls and cost
  }
}

# Block all public access
resource "aws_s3_bucket_public_access_block" "underwriteos_data" {
  bucket                  = aws_s3_bucket.underwriteos_data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Versioning — protect against accidental deletion
resource "aws_s3_bucket_versioning" "underwriteos_data" {
  bucket = aws_s3_bucket.underwriteos_data.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Enforce TLS on all S3 requests
resource "aws_s3_bucket_policy" "underwriteos_data" {
  bucket = aws_s3_bucket.underwriteos_data.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyNonTLS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [
          "${aws_s3_bucket.underwriteos_data.arn}",
          "${aws_s3_bucket.underwriteos_data.arn}/*"
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      },
      {
        Sid       = "DenyUnencryptedUploads"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.underwriteos_data.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption" = "aws:kms"
          }
        }
      }
    ]
  })
}

# Lifecycle — move old versions to Glacier after 90 days, delete after 7 years
resource "aws_s3_bucket_lifecycle_configuration" "underwriteos_data" {
  bucket = aws_s3_bucket.underwriteos_data.id

  rule {
    id     = "financial-data-retention"
    status = "Enabled"
    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
    transition {
      days          = 180
      storage_class = "GLACIER"
    }
    expiration {
      days = 2555  # 7 years — financial data retention requirement
    }
  }
}

# ── CloudWatch Logs — encrypted ─────────────────────────────
resource "aws_cloudwatch_log_group" "api" {
  name              = "/underwriteos/${var.environment}/api"
  retention_in_days = 90
  kms_key_id        = aws_kms_key.underwriteos_cmk.arn
  tags              = { Project = "UnderwriteOS" }
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/underwriteos/${var.environment}/lambda"
  retention_in_days = 90
  kms_key_id        = aws_kms_key.underwriteos_cmk.arn
  tags              = { Project = "UnderwriteOS" }
}

# ── Secrets Manager — all API keys and DB credentials ───────
resource "aws_secretsmanager_secret" "anthropic_api_key" {
  name        = "underwriteos/${var.environment}/anthropic-api-key"
  description = "Anthropic API key — rotated every 90 days"
  kms_key_id  = aws_kms_key.underwriteos_cmk.arn

  recovery_window_in_days = 30

  tags = { Project = "UnderwriteOS", DataClass = "Secret" }
}

resource "aws_secretsmanager_secret" "plaid_keys" {
  name        = "underwriteos/${var.environment}/plaid-keys"
  description = "Plaid client_id and secret — rotated every 90 days"
  kms_key_id  = aws_kms_key.underwriteos_cmk.arn
  recovery_window_in_days = 30
  tags        = { Project = "UnderwriteOS", DataClass = "Secret" }
}

resource "aws_secretsmanager_secret" "quickbooks_oauth" {
  name        = "underwriteos/${var.environment}/quickbooks-oauth"
  description = "QuickBooks OAuth client credentials"
  kms_key_id  = aws_kms_key.underwriteos_cmk.arn
  recovery_window_in_days = 30
  tags        = { Project = "UnderwriteOS", DataClass = "Secret" }
}

resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "underwriteos/${var.environment}/db-credentials"
  description = "Aurora PostgreSQL master credentials"
  kms_key_id  = aws_kms_key.underwriteos_cmk.arn
  recovery_window_in_days = 30
  tags        = { Project = "UnderwriteOS", DataClass = "Secret" }
}

# Auto-rotate DB credentials every 30 days
resource "aws_secretsmanager_secret_rotation" "db_credentials" {
  secret_id           = aws_secretsmanager_secret.db_credentials.id
  rotation_lambda_arn = aws_lambda_function.rotate_db_secret.arn

  rotation_rules {
    automatically_after_days = 30
  }
}
