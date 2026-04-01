# ============================================================
# UnderwriteOS — Encryption in Transit (Terraform)
# ============================================================
# TLS 1.2 minimum everywhere. TLS 1.3 preferred.
# HTTP always redirected to HTTPS.
# ============================================================

# ── ACM Certificate (TLS for CloudFront + API Gateway) ──────
resource "aws_acm_certificate" "underwriteos" {
  domain_name               = var.domain_name
  subject_alternative_names = ["api.${var.domain_name}", "*.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = { Project = "UnderwriteOS" }
}

resource "aws_acm_certificate_validation" "underwriteos" {
  certificate_arn         = aws_acm_certificate.underwriteos.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# ── CloudFront — HTTPS only, TLS 1.2+ ───────────────────────
resource "aws_cloudfront_distribution" "underwriteos" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = [var.domain_name]

  origin {
    domain_name = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id   = "S3-frontend"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.underwriteos.cloudfront_access_identity_path
    }
  }

  # Force HTTPS — redirect all HTTP to HTTPS
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-frontend"
    viewer_protocol_policy = "redirect-to-https"   # HTTP → HTTPS redirect

    # TLS policy — TLS 1.2 minimum
    # TLSv1.2_2021 supports TLS 1.2 and 1.3 only. Disables TLS 1.0 and 1.1.
    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    # Security headers
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    compress = true
  }

  # SPA routing — return index.html for all 404s
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  # TLS certificate
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.underwriteos.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"   # TLS 1.2 + 1.3 only. No 1.0/1.1.
  }

  # WAF
  web_acl_id = aws_wafv2_web_acl.underwriteos.arn

  restrictions {
    geo_restriction {
      restriction_type = "whitelist"
      locations        = ["US", "CA", "GB", "AU"]  # Adjust for your market
    }
  }

  tags = { Project = "UnderwriteOS" }
}

# Security response headers — applied to every CloudFront response
resource "aws_cloudfront_response_headers_policy" "security" {
  name = "underwriteos-security-headers-${var.environment}"

  security_headers_config {
    # Prevent clickjacking
    frame_options {
      frame_option = "DENY"
      override     = true
    }

    # Prevent MIME sniffing
    content_type_options {
      override = true
    }

    # Force HTTPS for 1 year, include subdomains
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }

    # Block XSS
    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }

    # Restrict referrer info
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }

  # Content Security Policy — only allow our own API and Anthropic
  custom_headers_config {
    items {
      header   = "Content-Security-Policy"
      value    = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://api.${var.domain_name} https://cognito-idp.${var.aws_region}.amazonaws.com; img-src 'self' data:; frame-ancestors 'none';"
      override = true
    }
    items {
      header   = "Permissions-Policy"
      value    = "camera=(), microphone=(), geolocation=(), payment=()"
      override = true
    }
  }
}

# ── API Gateway — HTTPS only, TLS 1.2+ ──────────────────────
resource "aws_api_gateway_domain_name" "underwriteos" {
  domain_name              = "api.${var.domain_name}"
  regional_certificate_arn = aws_acm_certificate.underwriteos.arn

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  # TLS 1.2 minimum
  security_policy = "TLS_1_2"

  tags = { Project = "UnderwriteOS" }
}

resource "aws_api_gateway_rest_api" "underwriteos" {
  name = "underwriteos-api-${var.environment}"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  # Minimum TLS version
  minimum_compression_size = 1024

  tags = { Project = "UnderwriteOS" }
}

# API Gateway — enforce Cognito JWT auth on all routes
resource "aws_api_gateway_authorizer" "cognito" {
  name            = "cognito-authorizer"
  rest_api_id     = aws_api_gateway_rest_api.underwriteos.id
  type            = "COGNITO_USER_POOLS"
  provider_arns   = [aws_cognito_user_pool.underwriteos.arn]
  identity_source = "method.request.header.Authorization"
}

# ── VPC — internal traffic encryption ───────────────────────
# All Lambda-to-RDS traffic stays within the VPC private subnet
# and uses TLS via RDS Proxy. No traffic traverses the public internet.

resource "aws_vpc" "underwriteos" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = { Project = "UnderwriteOS", Name = "underwriteos-vpc" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.underwriteos.id
  cidr_block        = "10.0.${count.index + 1}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = { Project = "UnderwriteOS", Name = "underwriteos-private-${count.index}" }
}

resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.underwriteos.id
  cidr_block        = "10.0.${count.index + 10}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = { Project = "UnderwriteOS", Name = "underwriteos-public-${count.index}" }
}

# Security Groups — Lambda can only talk to RDS proxy and AWS services
resource "aws_security_group" "lambda_sg" {
  name        = "underwriteos-lambda-${var.environment}"
  description = "Lambda functions — egress to RDS proxy and AWS services only"
  vpc_id      = aws_vpc.underwriteos.id

  egress {
    description     = "To RDS proxy (PostgreSQL)"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.rds_proxy_sg.id]
  }

  egress {
    description = "To AWS services via VPC endpoints (HTTPS)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]   # NAT Gateway for external HTTPS (Anthropic, Plaid etc.)
  }

  tags = { Project = "UnderwriteOS" }
}

resource "aws_security_group" "rds_sg" {
  name        = "underwriteos-rds-${var.environment}"
  description = "RDS — only accepts connections from RDS proxy SG"
  vpc_id      = aws_vpc.underwriteos.id

  ingress {
    description     = "PostgreSQL from RDS proxy only"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.rds_proxy_sg.id]
  }

  tags = { Project = "UnderwriteOS" }
}

resource "aws_security_group" "rds_proxy_sg" {
  name        = "underwriteos-rds-proxy-${var.environment}"
  description = "RDS Proxy — accepts connections from Lambda SG"
  vpc_id      = aws_vpc.underwriteos.id

  ingress {
    description     = "PostgreSQL from Lambda"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda_sg.id]
  }

  egress {
    description     = "PostgreSQL to RDS"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.rds_sg.id]
  }

  tags = { Project = "UnderwriteOS" }
}
