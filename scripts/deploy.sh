#!/bin/bash
set -e

# Deploy Terraform infrastructure for FtheRoads
# Works from both local execution and GitHub Actions

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🚀 Terraform Deployment Script"
echo "================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo -e "${GREEN}✓ Project root: $PROJECT_ROOT${NC}"

# Check if we're running in GitHub Actions
if [ -n "$GITHUB_ACTIONS" ]; then
    echo -e "${GREEN}✓ Running in GitHub Actions (OIDC auth)${NC}"
else
    if [ ! -f "secrets.yaml" ]; then
        echo -e "${RED}✗ Error: secrets.yaml not found!${NC}"
        echo "  Please create secrets.yaml with your AWS credentials:"
        echo "  aws:"
        echo "    AWS_ACCESS_KEY_ID: \"YOUR_ACCESS_KEY\""
        echo "    AWS_SECRET_ACCESS_KEY: \"YOUR_SECRET_KEY\""
        exit 1
    fi

    echo -e "${GREEN}✓ Found secrets.yaml${NC}"

    if command -v yq &> /dev/null; then
        AWS_ACCESS_KEY=$(yq '.aws.AWS_ACCESS_KEY_ID' secrets.yaml | tr -d '"')
        AWS_SECRET_KEY=$(yq '.aws.AWS_SECRET_ACCESS_KEY' secrets.yaml | tr -d '"')
    else
        AWS_ACCESS_KEY=$(grep "AWS_ACCESS_KEY_ID:" secrets.yaml | sed 's/.*: *"\([^"]*\)".*/\1/')
        AWS_SECRET_KEY=$(grep "AWS_SECRET_ACCESS_KEY:" secrets.yaml | sed 's/.*: *"\([^"]*\)".*/\1/')
    fi

    if [ -z "$AWS_ACCESS_KEY" ] || [ -z "$AWS_SECRET_KEY" ]; then
        echo -e "${RED}✗ Failed to parse AWS credentials from secrets.yaml${NC}"
        exit 1
    fi

    export AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY"
    export AWS_SECRET_ACCESS_KEY="$AWS_SECRET_KEY"
    echo -e "${GREEN}✓ Loaded AWS credentials from secrets.yaml${NC}"
    echo -e "${YELLOW}  Access Key ID: ${AWS_ACCESS_KEY_ID:0:8}...${NC}"
fi

cd iac

echo ""
echo "📋 Terraform state loaded from working tree"
echo "================================"

echo ""
echo "📋 Cleaning terraform provider cache..."
echo "================================"
rm -rf .terraform

echo ""
echo "📋 Running: terraform init"
echo "================================"
terraform init

echo ""
echo "📋 Importing existing resources if not in state..."
echo "================================"
BUCKET_NAME="ftheroads.com"

if ! terraform state show aws_s3_bucket.website &>/dev/null; then
    echo "Importing S3 bucket..."
    terraform import -input=false -var-file=envs/prod.tfvars aws_s3_bucket.website "$BUCKET_NAME" || echo "Import failed, may not exist yet"
fi

if ! terraform state show aws_s3_bucket_website_configuration.website &>/dev/null; then
    echo "Importing bucket website configuration..."
    terraform import -input=false -var-file=envs/prod.tfvars aws_s3_bucket_website_configuration.website "$BUCKET_NAME" || echo "Website config import failed"
fi

if ! terraform state show aws_s3_bucket_ownership_controls.website &>/dev/null; then
    echo "Importing bucket ownership controls..."
    terraform import -input=false -var-file=envs/prod.tfvars aws_s3_bucket_ownership_controls.website "$BUCKET_NAME" || echo "Ownership controls import failed"
fi

if ! terraform state show aws_s3_bucket_acl.website &>/dev/null; then
    echo "Importing bucket ACL..."
    terraform import -input=false -var-file=envs/prod.tfvars aws_s3_bucket_acl.website "$BUCKET_NAME" || echo "ACL import failed"
fi

if ! terraform state show aws_s3_bucket_public_access_block.website &>/dev/null; then
    echo "Importing bucket public access block..."
    terraform import -input=false -var-file=envs/prod.tfvars aws_s3_bucket_public_access_block.website "$BUCKET_NAME" || echo "Public access block import failed"
fi

# Import existing Route53 A record if it exists
ZONE_ID=$(aws route53 list-hosted-zones --query "HostedZones[?Name=='ftheroads.com.'].Id" --output text 2>/dev/null | sed 's|/hostedzone/||' || echo "")
if [ -n "$ZONE_ID" ] && [ "$ZONE_ID" != "None" ]; then
    if ! terraform state show 'aws_route53_record.www[0]' &>/dev/null; then
        echo "Checking for existing Route53 A record..."
        terraform import -input=false -var-file=envs/prod.tfvars 'aws_route53_record.www[0]' "${ZONE_ID}_ftheroads.com_A" || echo "Route53 A record import failed or doesn't exist"
    fi
fi

# Import existing CloudFront distribution if it exists
if ! terraform state show 'aws_cloudfront_distribution.website[0]' &>/dev/null; then
    echo "Checking for existing CloudFront distribution..."
    DIST_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?contains(Aliases.Items, 'ftheroads.com')].Id | [0]" --output text 2>/dev/null || echo "")
    if [ -n "$DIST_ID" ] && [ "$DIST_ID" != "None" ]; then
        echo "Importing CloudFront distribution: $DIST_ID"
        terraform import -input=false -var-file=envs/prod.tfvars 'aws_cloudfront_distribution.website[0]' "$DIST_ID" || echo "CloudFront import failed"
    else
        echo "No existing CloudFront distribution found - will create new one"
    fi
fi

# Import existing ACM certificate if it exists
if ! terraform state show 'aws_acm_certificate.website[0]' &>/dev/null; then
    echo "Checking for existing ACM certificate..."
    CERT_ARN=$(aws acm list-certificates --region us-east-1 --query "CertificateSummaryList[?DomainName=='ftheroads.com'].CertificateArn | [0]" --output text 2>/dev/null || echo "")
    if [ -n "$CERT_ARN" ] && [ "$CERT_ARN" != "None" ]; then
        terraform import -input=false -var-file=envs/prod.tfvars 'aws_acm_certificate.website[0]' "$CERT_ARN" || echo "ACM certificate import failed"
    else
        echo "No existing ACM certificate found, will create new one"
    fi
fi

echo ""
echo "📋 Refreshing terraform state..."
echo "================================"
terraform refresh -var-file=envs/prod.tfvars || echo "State refresh had warnings"

echo ""
echo "📋 Running: terraform plan"
echo "================================"
terraform plan -var-file=envs/prod.tfvars

echo ""
echo "🚀 Applying Terraform changes..."
terraform apply -var-file=envs/prod.tfvars -auto-approve || true
TERRAFORM_EXIT_CODE=$?

# Commit terraform state back to repo (only if apply failed partway)
echo ""
echo "💾 Checking terraform state..."
if [ $TERRAFORM_EXIT_CODE -ne 0 ]; then
    echo -e "${YELLOW}  Apply failed — preserving partial state in working tree${NC}"
fi

if [ $TERRAFORM_EXIT_CODE -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ Terraform apply completed successfully!${NC}"
else
    echo ""
    echo -e "${RED}✗ Terraform apply failed!${NC}"
    exit $TERRAFORM_EXIT_CODE
fi
