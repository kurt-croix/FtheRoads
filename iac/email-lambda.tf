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
      RESEND_API_KEY = var.resend_api_key
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
  invoke_mode        = "BUFFERED"
  cors {
    allow_origins     = ["https://ftheroads.com", "https://www.ftheroads.com", "http://localhost:5173", "http://localhost:8080"]
    allow_methods     = ["POST"]
    allow_headers     = ["Content-Type"]
    max_age           = 86400
  }
}

output "lambda_function_url" {
  value = aws_lambda_function_url.send_email.function_url
}
