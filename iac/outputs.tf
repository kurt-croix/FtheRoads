output "cloudfront_domain" {
  description = "CloudFront distribution domain name"
  value       = var.enable_https ? aws_cloudfront_distribution.website[0].domain_name : aws_s3_bucket_website_configuration.website.website_endpoint
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (needed for cache invalidations)"
  value       = var.enable_https ? aws_cloudfront_distribution.website[0].id : null
}

output "s3_bucket" {
  description = "S3 bucket name for the static site"
  value       = aws_s3_bucket.website.id
}

output "website_url" {
  description = "Website endpoint URL"
  value       = aws_s3_bucket_website_configuration.website.website_endpoint
}

output "email_lambda_url" {
  description = "Lambda Function URL for sending email notifications"
  value       = aws_lambda_function_url.send_email.function_url
}
