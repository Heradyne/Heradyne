# ============================================================
# UnderwriteOS — Terraform Variables
# ============================================================

variable "aws_account_id" {
  description = "Your AWS account ID"
  type        = string
}

variable "aws_region" {
  description = "AWS region (e.g. us-east-1)"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment: dev, staging, prod"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Must be dev, staging, or prod."
  }
}

variable "domain_name" {
  description = "Primary domain (e.g. underwriteos.com)"
  type        = string
}

variable "ses_arn" {
  description = "SES identity ARN for sending Cognito emails"
  type        = string
}

variable "callback_urls" {
  description = "Cognito OAuth callback URLs"
  type        = list(string)
}

variable "logout_urls" {
  description = "Cognito OAuth logout URLs"
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for Lambda and RDS"
  type        = list(string)
}

variable "db_instance_class" {
  description = "Aurora instance class"
  type        = string
  default     = "db.t4g.medium"
}

variable "security_alert_email" {
  description = "Email for GuardDuty and WAF security alerts"
  type        = string
}
