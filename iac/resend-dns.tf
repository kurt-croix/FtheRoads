# Resend email DNS verification records for ftheroads.com
# These are public DNS records — not secrets

# SPF record — authorizes Resend to send email on behalf of ftheroads.com
resource "aws_route53_record" "spf" {
  zone_id = data.aws_route53_zone.selected.zone_id
  name    = local.full_domain
  type    = "TXT"
  ttl     = 300
  records = [var.resend_spf_record]
}

# DKIM TXT — Resend provides the public key for domain signing
resource "aws_route53_record" "dkim" {
  zone_id = data.aws_route53_zone.selected.zone_id
  name    = var.resend_dkim_name
  type    = "TXT"
  ttl     = 300
  records = [var.resend_dkim_value]
}

# DMARC record — tells receiving servers what to do with unauthenticated mail
resource "aws_route53_record" "dmarc" {
  zone_id = data.aws_route53_zone.selected.zone_id
  name    = "_dmarc.${local.full_domain}"
  type    = "TXT"
  ttl     = 300
  records = [var.resend_dmarc_record]
}
