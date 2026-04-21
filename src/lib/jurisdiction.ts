import townshipData from '@/data/rayCountyTownships.json';

interface DistrictInfo {
  name: string;
  roadCode: string;
}

/**
 * Point-in-polygon test using ray casting algorithm.
 */
function pointInPolygon(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Look up the road district (civil township) for a given lat/lng.
 * Uses embedded GeoJSON from the Census Bureau TIGERweb — no external API needed.
 */
export function lookupRoadDistrict(lat: number, lng: number): DistrictInfo | null {
  // Sort features so "County" (the largest polygon) is checked last
  const sorted = [...townshipData.features].sort((a, b) => {
    if (a.properties.name === 'County') return 1;
    if (b.properties.name === 'County') return -1;
    return 0;
  });
  for (const feature of sorted) {
    const geom = feature.geometry;
    if (geom.type === 'Polygon') {
      for (const ring of geom.coordinates) {
        if (pointInPolygon(lng, lat, ring)) {
          return {
            name: feature.properties.name,
            roadCode: '',
          };
        }
      }
    }
  }
  return null;
}