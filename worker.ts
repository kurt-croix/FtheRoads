/**
 * Cloudflare Worker for FtheRoads.com
 *
 * Handles:
 * 1. CORS headers for the app
 * 2. Jurisdiction lookup via Ray County GIS API
 * 3. Email notification via Resend (or similar)
 */

interface Env {
  RESEND_API_KEY?: string;
  NOTIFICATION_EMAIL?: string;
}

const GIS_CONFIG = {
  geocortexBase: 'https://raygis.integritygis.com/Geocortex/Essentials/REST/sites/Ray_County_MO',
  geometryService: 'https://services2.integritygis.com/arcgis/rest/services/Utilities/Geometry/GeometryServer',
  statePlaneWKID: 102698,
  wgs84WKID: 4326,
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function projectToStatePlane(lat: number, lng: number): Promise<{ x: number; y: number }> {
  const geometries = JSON.stringify({
    geometryType: 'esriGeometryPoint',
    geometries: [{ x: lng, y: lat }],
  });

  const url = `${GIS_CONFIG.geometryService}/project?inSR=${GIS_CONFIG.wgs84WKID}&outSR=${GIS_CONFIG.statePlaneWKID}&geometries=${encodeURIComponent(geometries)}&f=pjson`;

  const response = await fetch(url);
  const data = await response.json() as { geometries?: Array<{ x: number; y: number }> };

  if (!data.geometries?.[0]) {
    throw new Error('Failed to project coordinates');
  }

  return { x: data.geometries[0].x, y: data.geometries[0].y };
}

async function lookupDistrict(lat: number, lng: number): Promise<{ name: string; roadCode: string } | null> {
  try {
    const projected = await projectToStatePlane(lat, lng);

    // Try the Geocortex identify endpoint
    const identifyUrl = `${GIS_CONFIG.geocortexBase}/map/identify`;
    const params = new URLSearchParams({
      geometry: `${projected.x},${projected.y}`,
      geometryType: 'esriGeometryPoint',
      sr: String(GIS_CONFIG.statePlaneWKID),
      layers: 'top',
      tolerance: '100',
      mapExtent: `${projected.x - 50000},${projected.y - 50000},${projected.x + 50000},${projected.y + 50000}`,
      imageDisplay: '400,300,96',
      returnGeometry: 'false',
      f: 'json',
    });

    const response = await fetch(`${identifyUrl}?${params}`);
    const data = await response.json();

    if (data.error) {
      console.error('GIS identify error:', data.error);
      return null;
    }

    // Find Road District result (layer 65)
    const results = data.results || [];
    const roadDistrict = results.find(
      (r: { layerId?: number; attributes?: Record<string, string> }) => r.layerId === 65
    );

    if (roadDistrict?.attributes) {
      return {
        name: roadDistrict.attributes.NAME || 'Unknown',
        roadCode: roadDistrict.attributes.ROAD_CODE || '',
      };
    }

    return null;
  } catch (error) {
    console.error('District lookup error:', error);
    return null;
  }
}

async function sendEmail(
  to: string,
  subject: string,
  body: string,
  env: Env
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log('Email would be sent to:', to, 'Subject:', subject);
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'FtheRoads <reports@ftheroads.com>',
        to,
        subject,
        html: body,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

function getEmailForDistrict(districtName: string, baseEmail: string): string {
  if (!districtName || districtName === 'Unknown') return baseEmail;

  // Create unique capitalization per district for testing
  const hash = districtName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const [local, domain] = baseEmail.split('@');

  const variations = [
    local,
    local.toUpperCase(),
    local.charAt(0).toUpperCase() + local.slice(1),
    local.split('').map((c, i) => i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()).join(''),
  ];

  const variationIndex = hash % variations.length;
  return `${variations[variationIndex]}+${districtName.replace(/\s+/g, '')}@${domain}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // API: Lookup district
    if (url.pathname === '/api/lookup-district' && request.method === 'POST') {
      try {
        const { lat, lng } = await request.json() as { lat: number; lng: number };
        const district = await lookupDistrict(lat, lng);

        return Response.json(
          { district },
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        return Response.json(
          { error: 'Failed to lookup district' },
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    // API: Send notification
    if (url.pathname === '/api/notify' && request.method === 'POST') {
      try {
        const { reportTitle, reportType, severity, location, district, description, reportUrl } =
          await request.json() as {
            reportTitle: string;
            reportType: string;
            severity: string;
            location: string;
            district: string;
            description: string;
            reportUrl: string;
          };

        const baseEmail = env.NOTIFICATION_EMAIL || 'au9913@pm.me';
        const targetEmail = getEmailForDistrict(district, baseEmail);

        const subject = `[FtheRoads] New ${severity.toUpperCase()} ${reportType} report: ${reportTitle}`;

        const htmlBody = `
          <div style="font-family: system-ui; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #ef4444;">🚧 New Road Hazard Report</h2>
            <div style="background: #f5f5f5; border-radius: 12px; padding: 16px; margin: 16px 0;">
              <p><strong>Title:</strong> ${reportTitle}</p>
              <p><strong>Type:</strong> ${reportType}</p>
              <p><strong>Severity:</strong> ${severity.toUpperCase()}</p>
              <p><strong>Location:</strong> ${location}</p>
              ${district ? `<p><strong>District:</strong> ${district}</p>` : ''}
            </div>
            ${description ? `<p><strong>Details:</strong></p><p>${description}</p>` : ''}
            ${reportUrl ? `<p><a href="${reportUrl}" style="background: #ef4444; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; display: inline-block;">View Report</a></p>` : ''}
            <hr style="margin: 24px 0; border: none; border-top: 1px solid #ddd;" />
            <p style="color: #888; font-size: 12px;">Reported via FtheRoads.com — Fix the Roads</p>
          </div>
        `;

        const sent = await sendEmail(targetEmail, subject, htmlBody, env);

        return Response.json(
          { sent, targetEmail },
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      } catch {
        return Response.json(
          { error: 'Failed to send notification' },
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Default: pass through to static assets
    return new Response('Not found', { status: 404, headers: CORS_HEADERS });
  },
};
