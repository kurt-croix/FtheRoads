const RESEND_API_URL = "https://api.resend.com/emails";

// Lambda Function URL event format uses event.requestContext.http.method
// and event.headers is lowercase. API Gateway format uses event.httpMethod.
function getMethod(event) {
  return event.requestContext?.http?.method || event.httpMethod || "";
}

export const handler = async (event) => {
  const method = getMethod(event);

  // CORS preflight
  if (method === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: "",
    };
  }

  if (method !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // TODO: Uncomment origin check for production. Disabled during development.
  // Real protections: rate limiting, CAPTCHA, IAM auth (see docs/improvements.md).
  // const origin = event.headers?.origin || event.headers?.Origin || "";
  // const allowed = [
  //   "https://ftheroads.com",
  //   "https://www.ftheroads.com",
  // ];
  // if (!allowed.includes(origin)) {
  //   return { statusCode: 403, body: "Forbidden" };
  // }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { to, subject, text, html, imageUrl } = body;
  if (!to || !subject || !text) {
    return { statusCode: 400, body: "Missing required fields: to, subject, text" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY not set");
    return { statusCode: 500, body: "Server configuration error" };
  }

  try {
    const emailPayload = {
      from: "FtheRoads <reports@ftheroads.com>",
      to: [to],
      subject,
      text,
      // Use provided HTML or fall back to plain text
      html: html || text.replace(/\n/g, "<br>"),
    };

    // If an image URL was provided, fetch it and embed inline via CID
    if (imageUrl) {
      try {
        const imgResponse = await fetch(imageUrl);
        if (imgResponse.ok) {
          const imgBuffer = await imgResponse.arrayBuffer();
          const base64 = Buffer.from(imgBuffer).toString("base64");
          const urlPath = new URL(imageUrl).pathname;
          const filename = urlPath.split("/").pop() || "photo.jpg";
          emailPayload.attachments = [
            { filename, content: base64, encoding: "base64", content_id: "report-photo" },
          ];
          // Append inline image to the HTML body
          emailPayload.html += `<p><img src="cid:report-photo" alt="Report photo" style="max-width:600px;border-radius:8px" /></p>`;
        } else {
          console.warn("Could not fetch image:", imageUrl, imgResponse.status);
        }
      } catch (imgErr) {
        console.warn("Image fetch failed, sending without attachment:", imgErr.message);
      }
    }

    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Resend error:", JSON.stringify(result));
      return {
        statusCode: response.status,
        headers: corsHeaders(),
        body: JSON.stringify({ error: result }),
      };
    }

    console.log("Email sent:", JSON.stringify({ to, subject, id: result.id }));
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ success: true, id: result.id }),
    };
  } catch (err) {
    console.error("Send failed:", err);
    return { statusCode: 500, body: "Internal server error" };
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
