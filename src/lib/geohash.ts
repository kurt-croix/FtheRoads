/**
 * Encode a latitude/longitude to a geohash string.
 * Based on the geohash.org algorithm.
 */
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function encodeGeohash(lat: number, lng: number, precision: number = 8): string {
  let latRange = [-90, 90];
  let lngRange = [-180, 180];
  let hash = '';
  let bits = 0;
  let bit = 0;
  let isLng = true;
  let mid: number;

  while (hash.length < precision) {
    if (isLng) {
      mid = (lngRange[0] + lngRange[1]) / 2;
      if (lng >= mid) {
        bit = bit * 2 + 1;
        lngRange = [mid, lngRange[1]];
      } else {
        bit = bit * 2;
        lngRange = [lngRange[0], mid];
      }
    } else {
      mid = (latRange[0] + latRange[1]) / 2;
      if (lat >= mid) {
        bit = bit * 2 + 1;
        latRange = [mid, latRange[1]];
      } else {
        bit = bit * 2;
        latRange = [latRange[0], mid];
      }
    }

    isLng = !isLng;
    bits++;

    if (bits === 5) {
      hash += BASE32[bit];
      bits = 0;
      bit = 0;
    }
  }

  return hash;
}

/**
 * Decode a geohash to approximate lat/lng (center of the cell).
 */
export function decodeGeohash(hash: string): { lat: number; lng: number } {
  let latRange = [-90, 90];
  let lngRange = [-180, 180];
  let isLng = true;

  for (const char of hash) {
    const idx = BASE32.indexOf(char);
    if (idx === -1) continue;

    for (let bit = 4; bit >= 0; bit--) {
      const mask = 1 << bit;
      if (isLng) {
        const mid = (lngRange[0] + lngRange[1]) / 2;
        if (idx & mask) {
          lngRange = [mid, lngRange[1]];
        } else {
          lngRange = [lngRange[0], mid];
        }
      } else {
        const mid = (latRange[0] + latRange[1]) / 2;
        if (idx & mask) {
          latRange = [mid, latRange[1]];
        } else {
          latRange = [latRange[0], mid];
        }
      }
      isLng = !isLng;
    }
  }

  return {
    lat: (latRange[0] + latRange[1]) / 2,
    lng: (lngRange[0] + lngRange[1]) / 2,
  };
}
