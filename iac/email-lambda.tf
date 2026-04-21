# SSM Parameter for Resend API key (encrypted)
resource "aws_ssm_parameter" "resend_api_key" {
  name        = "/ftheroads/resend-api-key"
  description = "Resend API key for email notifications"
  type        = "SecureString"
  value       = var.resend_api_key

  tags = {
    Name        = "ftheroads-resend-api-key"
    Environment = var.environment
  }
}

# IAM role for the email Lambda
resource "aws_iam_role" "email_lambda" {
  name = "ftheroads-email-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "email_lambda_basic" {
  role       = aws_iam_role.email_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Allow Lambda to read the SSM parameter
resource "aws_iam_role_policy" "email_lambda_ssm" {
  name = "ssm-read"
  role = aws_iam_role.email_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ssm:GetParameter"
        Resource = aws_ssm_parameter.resend_api_key.arn
      }
    ]
  })
}

# Zip the Lambda function code
data "archive_file" "email_lambda_zip" {
  type        = "zip"
  output_path = "${path.module}/lambda/send-email.zip"
  source_file = "${path.module}/lambda/send-email.mjs"
}

# Lambda function
resource "aws_lambda_function" "send_email" {
  filename      = data.archive_file.email_lambda_zip.output_path
  function_name = "ftheroads-send-email"
  role          = aws_iam_role.email_lambda.arn
  handler       = "send-email.handler"
  runtime       = "nodejs20.x"
  timeout       = 10

  environment {
    variables = {
      RESEND_API_KEY = aws_ssm_parameter.resend_api_key.value
    }
  }

  source_code_hash = data.archive_file.email_lambda_zip.output_base64sha256

  tags = {
    Name        = "ftheroads-send-email"
    Environment = var.environment
  }
}

# Lambda Function URL (no API Gateway needed)
resource "aws_lambda_function_url" "send_email" {
  function_name      = aws_lambda_function.send_email.function_name
  authorization_type = "NONE"
  cors {
    allow_origins     = ["https://ftheroads.com", "https://www.ftheroads.com", "http://localhost:5173"]
    allow_methods     = ["POST"]
    allow_headers     = ["Content-Type"]
    max_age           = 86400
  }
}
