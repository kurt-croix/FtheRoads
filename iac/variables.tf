variable "bucket_name" {
  description = "Name of the S3 bucket for static website hosting"
  type        = string
}

variable "domain_name" {
  description = "Root domain name (e.g., ftheroads.com)"
  type        = string
}

variable "subdomain" {
  description = "Subdomain for the site (empty string for apex)"
  type        = string
  default     = ""
}

variable "environment" {
  description = "Environment (prod, dev, etc.)"
  type        = string
  default     = "prod"
}

variable "enable_https" {
  description = "Enable HTTPS with ACM certificate"
  type        = bool
  default     = false
}

variable "resend_api_key" {
  description = "Resend API key for email notifications"
  type        = string
  sensitive   = true
}

variable "resend_spf_record" {
  description = "SPF TXT record value from Resend (e.g. 'v=spf1 include:resend.com ~all')"
  type        = string
  default     = ""
}

variable "resend_dkim_name" {
  description = "DKIM TXT record name from Resend (e.g. 'resend._domainkey')"
  type        = string
  default     = ""
}

variable "resend_dkim_value" {
  description = "DKIM TXT record value from Resend (the public key starting with 'p=')"
  type        = string
  default     = ""
}

variable "resend_dmarc_record" {
  description = "DMARC TXT record value (e.g. 'v=DMARC1; p=none;')"
  type        = string
  default     = ""
}
