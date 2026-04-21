locals {
  full_domain = var.subdomain != "" ? "${var.subdomain}.${var.domain_name}" : var.domain_name
}

# S3 Bucket for static website hosting
resource "aws_s3_bucket" "website" {
  bucket = var.bucket_name

  tags = {
    Name        = var.bucket_name
    Environment = var.environment
  }
}

# S3 Bucket public access configuration (for static website)
resource "aws_s3_bucket_public_access_block" "website" {
  bucket = aws_s3_bucket.website.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# S3 Bucket ownership controls
resource "aws_s3_bucket_ownership_controls" "website" {
  bucket = aws_s3_bucket.website.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

# S3 Bucket ACL for public read access
resource "aws_s3_bucket_acl" "website" {
  depends_on = [
    aws_s3_bucket_ownership_controls.website,
    aws_s3_bucket_public_access_block.website,
  ]

  bucket = aws_s3_bucket.website.id
  acl    = "public-read"
}

# S3 Bucket website configuration
resource "aws_s3_bucket_website_configuration" "website" {
  bucket = aws_s3_bucket.website.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "404.html"
  }
}

# S3 Bucket policy to allow public read access
resource "aws_s3_bucket_policy" "website" {
  depends_on = [
    aws_s3_bucket_public_access_block.website,
  ]

  bucket = aws_s3_bucket.website.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource = [
          "${aws_s3_bucket.website.arn}/*",
          "${aws_s3_bucket.website.arn}"
        ]
      }
    ]
  })
}

# Get Route 53 hosted zone
data "aws_route53_zone" "selected" {
  name = var.domain_name
}

# ACM Certificate for HTTPS (conditional)
resource "aws_acm_certificate" "website" {
  count             = var.enable_https ? 1 : 0
  domain_name       = local.full_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = local.full_domain
    Environment = var.environment
  }
}

# DNS validation records for ACM certificate (conditional)
resource "aws_route53_record" "certificate_validation" {
  count = var.enable_https ? 1 : 0

  allow_overwrite = true
  name            = try(element(tolist(aws_acm_certificate.website[0].domain_validation_options), 0).resource_record_name, "")
  records         = [try(element(tolist(aws_acm_certificate.website[0].domain_validation_options), 0).resource_record_value, "")]
  ttl             = 60
  type            = try(element(tolist(aws_acm_certificate.website[0].domain_validation_options), 0).resource_record_type, "CNAME")
  zone_id         = data.aws_route53_zone.selected.zone_id
}

# Wait for certificate validation (conditional)
resource "aws_acm_certificate_validation" "website" {
  count = var.enable_https ? 1 : 0

  certificate_arn         = aws_acm_certificate.website[0].arn
  validation_record_fqdns = [aws_route53_record.certificate_validation[0].fqdn]
}

# CloudFront distribution with HTTPS using ACM certificate (conditional)
resource "aws_cloudfront_distribution" "website" {
  count = var.enable_https ? 1 : 0

  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${local.full_domain} - ${var.environment}"
  default_root_object = "index.html"

  aliases = [local.full_domain]

  origin {
    domain_name = aws_s3_bucket_website_configuration.website.website_endpoint
    origin_id   = local.full_domain

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1", "TLSv1.1", "TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = local.full_domain

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
    compress               = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.website[0].certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }
}

# CloudFront cache invalidation - runs on every deploy
resource "null_resource" "invalidate_cache" {
  count = var.enable_https ? 1 : 0

  triggers = {
    distribution_id = aws_cloudfront_distribution.website[0].id
    run_hash        = timestamp()
  }

  provisioner "local-exec" {
    command = "aws cloudfront create-invalidation --distribution-id ${aws_cloudfront_distribution.website[0].id} --paths '/*'"
  }

  depends_on = [aws_cloudfront_distribution.website]
}

# Route53 A record pointing to CloudFront distribution
resource "aws_route53_record" "www" {
  count = var.enable_https ? 1 : 0

  zone_id = data.aws_route53_zone.selected.zone_id
  name    = local.full_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.website[0].domain_name
    zone_id                = aws_cloudfront_distribution.website[0].hosted_zone_id
    evaluate_target_health = true
  }
}
