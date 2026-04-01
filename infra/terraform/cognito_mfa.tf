# ============================================================
# UnderwriteOS — Cognito MFA Configuration (Terraform)
# ============================================================
# Enforces MFA for all users. Admin group requires TOTP.
# Owners and Buyers require TOTP or SMS.
# ============================================================

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

# ── KMS key for Cognito and all sensitive data ──────────────
resource "aws_kms_key" "underwriteos_cmk" {
  description             = "UnderwriteOS Customer Managed Key — all sensitive data"
  deletion_window_in_days = 30
  enable_key_rotation     = true  # Auto-rotates annually

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowRootFull"
        Effect = "Allow"
        Principal = { AWS = "arn:aws:iam::${var.aws_account_id}:root" }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowLambdaDecrypt"
        Effect = "Allow"
        Principal = {
          AWS = [
            aws_iam_role.lambda_exec.arn,
            aws_iam_role.lambda_ai_agent.arn
          ]
        }
        Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
        Resource = "*"
      },
      {
        Sid    = "AllowRDSEncryption"
        Effect = "Allow"
        Principal = { Service = "rds.amazonaws.com" }
        Action   = ["kms:Decrypt", "kms:GenerateDataKey", "kms:CreateGrant"]
        Resource = "*"
      },
      {
        Sid    = "DenyDisableKeyRotation"
        Effect = "Deny"
        Principal = { AWS = "*" }
        Action   = "kms:DisableKeyRotation"
        Resource = "*"
        Condition = {
          StringNotEquals = {
            "aws:PrincipalArn" = "arn:aws:iam::${var.aws_account_id}:root"
          }
        }
      }
    ]
  })

  tags = { Project = "UnderwriteOS", Environment = var.environment }
}

resource "aws_kms_alias" "underwriteos_cmk" {
  name          = "alias/underwriteos-cmk"
  target_key_id = aws_kms_key.underwriteos_cmk.key_id
}

# ── Cognito User Pool ────────────────────────────────────────
resource "aws_cognito_user_pool" "underwriteos" {
  name = "underwriteos-${var.environment}"

  # MFA — required for all users, cannot be opted out
  mfa_configuration = "ON"   # "ON" = required, "OPTIONAL" = user choice, "OFF" = disabled

  software_token_mfa_configuration {
    enabled = true   # TOTP via Google Authenticator, Authy, 1Password etc.
  }

  sms_configuration {
    external_id    = "underwriteos-sms-${var.environment}"
    sns_caller_arn = aws_iam_role.cognito_sms.arn
    sns_region     = var.aws_region
  }

  # SMS MFA as fallback (TOTP is preferred)
  sms_authentication_message = "Your UnderwriteOS verification code is {####}. Do not share this code."

  # Password policy — enterprise-grade
  password_policy {
    minimum_length                   = 14
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 1   # Force reset on first login
  }

  # Account recovery — email only (not SMS, to prevent SIM-swap attacks)
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Email verification required before account is active
  auto_verified_attributes = ["email"]

  # Advanced security features — detects compromised credentials, anomalous logins
  user_pool_add_ons {
    advanced_security_mode = "ENFORCED"
  }

  # Session tokens — short-lived
  device_configuration {
    challenge_required_on_new_device      = true
    device_only_remembered_on_user_prompt = true
  }

  # Token expiry
  # Access token: 15 minutes (used for API calls)
  # Refresh token: 12 hours (used to get new access tokens)
  # ID token: 15 minutes
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "hours"
  }

  # Schema — custom attributes for role and business ID
  schema {
    name                     = "role"
    attribute_data_type      = "String"
    mutable                  = true
    required                 = false
    string_attribute_constraints {
      min_length = 1
      max_length = 50
    }
  }

  schema {
    name                     = "business_id"
    attribute_data_type      = "String"
    mutable                  = true
    required                 = false
    string_attribute_constraints {
      min_length = 0
      max_length = 100
    }
  }

  schema {
    name                     = "mfa_enrolled"
    attribute_data_type      = "Boolean"
    mutable                  = true
    required                 = false
  }

  # Email — use SES for production (not Cognito default)
  email_configuration {
    email_sending_account = "DEVELOPER"
    source_arn            = var.ses_arn
    from_email_address    = "noreply@underwriteos.com"
  }

  # Lambda triggers for custom auth flows
  lambda_config {
    pre_authentication          = aws_lambda_function.pre_auth.arn
    post_authentication         = aws_lambda_function.post_auth.arn  # Writes to audit log
    pre_token_generation        = aws_lambda_function.pre_token.arn  # Inject role claims
    user_migration              = null
  }

  tags = { Project = "UnderwriteOS", Environment = var.environment }
}

# ── User Pool Client (the app) ───────────────────────────────
resource "aws_cognito_user_pool_client" "underwriteos_app" {
  name         = "underwriteos-web-${var.environment}"
  user_pool_id = aws_cognito_user_pool.underwriteos.id

  # Never issue a client secret for browser apps — use PKCE instead
  generate_secret = false

  # Auth flows — PKCE only. No legacy flows.
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",        # Secure Remote Password — password never sent in plaintext
    "ALLOW_REFRESH_TOKEN_AUTH",   # Allow token refresh
    "ALLOW_USER_AUTH",            # Allows passwordless / passkey flows
  ]

  # OAuth2 PKCE
  allowed_oauth_flows                  = ["code"]    # Authorization code + PKCE only
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  callback_urls                        = var.callback_urls
  logout_urls                          = var.logout_urls
  supported_identity_providers         = ["COGNITO"]

  # Token validity
  access_token_validity  = 15     # minutes
  id_token_validity      = 15     # minutes
  refresh_token_validity = 12     # hours

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "hours"
  }

  # Prevent token reuse attacks
  enable_token_revocation                       = true
  enable_propagate_additional_user_context_data = false

  # Prevent user enumeration (don't reveal if email exists)
  prevent_user_existence_errors = "ENABLED"

  read_attributes  = ["email", "custom:role", "custom:business_id", "custom:mfa_enrolled"]
  write_attributes = ["email"]
}

# ── User Groups (RBAC) ───────────────────────────────────────
resource "aws_cognito_user_group" "admin" {
  name         = "Admin"
  user_pool_id = aws_cognito_user_pool.underwriteos.id
  description  = "Platform administrators — full access, MFA always required, audit log access"
  precedence   = 1  # Highest priority group
  role_arn     = aws_iam_role.cognito_admin_group.arn
}

resource "aws_cognito_user_group" "owner" {
  name         = "Owner"
  user_pool_id = aws_cognito_user_pool.underwriteos.id
  description  = "Business owners — access to own business data only"
  precedence   = 10
  role_arn     = aws_iam_role.cognito_owner_group.arn
}

resource "aws_cognito_user_group" "buyer" {
  name         = "Buyer"
  user_pool_id = aws_cognito_user_pool.underwriteos.id
  description  = "Buyers / acquirers — access to target business data + acquisition tools"
  precedence   = 10
  role_arn     = aws_iam_role.cognito_buyer_group.arn
}

# ── MFA enforcement Lambda trigger ──────────────────────────
# Fires on every login — blocks access if MFA not enrolled
resource "aws_lambda_function" "pre_auth" {
  function_name = "underwriteos-pre-auth-${var.environment}"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "pre_auth.handler"
  runtime       = "python3.12"
  filename      = data.archive_file.pre_auth.output_path

  environment {
    variables = {
      ENVIRONMENT             = var.environment
      AUDIT_LOG_TABLE         = aws_dynamodb_table.audit_log.name
      BLOCK_WITHOUT_MFA       = "true"
      MAX_FAILED_ATTEMPTS     = "5"
      LOCKOUT_DURATION_MINS   = "30"
    }
  }

  # Lambda itself in VPC — no internet access except via NAT Gateway
  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.lambda_sg.id]
  }

  # Encrypt Lambda env vars at rest
  kms_key_arn = aws_kms_key.underwriteos_cmk.arn

  tags = { Project = "UnderwriteOS" }
}

# ── Post-auth trigger — writes every login to audit log ─────
resource "aws_lambda_function" "post_auth" {
  function_name = "underwriteos-post-auth-${var.environment}"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "post_auth.handler"
  runtime       = "python3.12"
  filename      = data.archive_file.post_auth.output_path

  environment {
    variables = {
      AUDIT_LOG_TABLE = aws_dynamodb_table.audit_log.name
      ENVIRONMENT     = var.environment
    }
  }

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.lambda_sg.id]
  }

  kms_key_arn = aws_kms_key.underwriteos_cmk.arn

  tags = { Project = "UnderwriteOS" }
}
