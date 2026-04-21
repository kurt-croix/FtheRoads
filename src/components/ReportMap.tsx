import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Crosshair, Search, Loader2 } from 'lucide-react';
import type { RoadReport } from '@/hooks/useRoadReports';
import { HAZARD_TYPES, SEVERITY_LEVELS } from '@/lib/constants';
import { decodeGeohash } from '@/lib/geohash';
import townshipData from '@/data/rayCountyTownships.json';

// Declare global L from CDN-loaded Leaflet
declare const L: any;

interface ReportMapProps {
  reports: RoadReport[];
  onMapClick?: (lat: number, lng: number) => void;
  selectedLocation?: { lat: number; lng: number } | null;
  onReportClick?: (report: RoadReport) => void;
  className?: string;
  interactive?: boolean;
}

export function ReportMap({
  reports,
  onMapClick,
  selectedLocation,
  className = '',
  interactive = true,
}: ReportMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const selMarkerRef = useRef<any>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [ready, setReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Init map — L is already global from CDN
  useEffect(() => {
    if (!containerRef.current || typeof L === 'undefined') return;

    const map = L.map(containerRef.current, {
      center: [39.4, -93.9],
      zoom: 11,
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);

    // Road district boundary overlay
    const districtColors: Record<string, string> = {
      'County': '#6366f1',
      'Crystal Lakes': '#f59e0b',
      'Camden': '#10b981',
      'Lawson': '#ef4444',
      'Excelsior Springs': '#8b5cf6',
      'Henrietta': '#ec4899',
      'Orrick': '#14b8a6',
      'Richmond': '#f97316',
      'Hardin': '#06b6d4',
    };
    L.geoJSON(townshipData as any, {
      style: (feature) => {
        const color = districtColors[feature?.properties?.name] || '#6366f1';
        return {
          color,
          weight: 2,
          opacity: 0.6,
          fillColor: color,
          fillOpacity: 0.08,
        };
      },
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.name || '';
        layer.bindTooltip(name, {
          permanent: true,
          direction: 'center',
          className: 'district-label',
        });
      },
    }).addTo(map);

    if (interactive && onMapClick) {
      map.on('click', (e: any) => {
        onMapClick(e.latlng.lat, e.latlng.lng);
      });
      map.getContainer().style.cursor = 'crosshair';
    }

    mapRef.current = map;
    setReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
      selMarkerRef.current = null;
      setReady(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Markers
  useEffect(() => {
    if (!ready || !markersRef.current) return;
    markersRef.current.clearLayers();

    for (const report of reports) {
      let lat = report.lat;
      let lng = report.lng;
      if (!lat || !lng) {
        const d = decodeGeohash(report.geohash);
        lat = d.lat;
        lng = d.lng;
      }
      if (!lat || !lng) continue;

      const ht = HAZARD_TYPES.find(h => h.value === report.type);
      const sv = SEVERITY_LEVELS.find(s => s.value === report.severity);
      const icon = ht?.icon ?? '⚫';
      const color = sv?.color ?? '#6b7280';

      const m = L.marker([lat, lng], {
        icon: L.divIcon({
          html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:14px;">${icon}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          popupAnchor: [0, -14],
          className: '',
        }),
      });

      m.bindPopup(`
        <div style="font-family:system-ui;min-width:180px">
          <b style="font-size:13px">${report.title}</b>
          <div style="font-size:11px;color:#666;margin-top:2px">${report.location || ''}</div>
          <div style="display:flex;gap:4px;margin-top:6px">
            <span style="background:${color};color:white;padding:1px 6px;border-radius:10px;font-size:10px">${report.severity}</span>
            <span style="background:#e5e7eb;padding:1px 6px;border-radius:10px;font-size:10px">${report.type}</span>
          </div>
        </div>
      `);

      markersRef.current.addLayer(m);
    }
  }, [reports, ready]);

  // Selection pin
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    if (selMarkerRef.current) {
      selMarkerRef.current.remove();
      selMarkerRef.current = null;
    }

    if (selectedLocation) {
      selMarkerRef.current = L.marker(
        [selectedLocation.lat, selectedLocation.lng],
        {
          icon: L.divIcon({
            html: `<div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 0 0 2px #3b82f6,0 0 12px rgba(59,130,246,0.5)"></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
            className: '',
          }),
          zIndexOffset: 1000,
        }
      ).addTo(mapRef.current);

      mapRef.current.setView(
        [selectedLocation.lat, selectedLocation.lng],
        Math.max(mapRef.current.getZoom(), 15)
      );
    }
  }, [selectedLocation, ready]);

  const handleGeolocate = useCallback(() => {
    if (!mapRef.current) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 15);
        onMapClick?.(pos.coords.latitude, pos.coords.longitude);
        setIsLocating(false);
      },
      () => setIsLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [onMapClick]);

  const handleAddressSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q || !mapRef.current) return;
    setIsSearching(true);
    try {
      const r = await fetch(
        `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?` +
        new URLSearchParams({ address: q, f: 'json', maxLocations: '1' })
      );
      const d = await r.json();
      if (d.candidates?.[0]) {
        const { y: lat, x: lng } = d.candidates[0].location;
        mapRef.current.setView([lat, lng], 16);
        onMapClick?.(lat, lng);
      }
    } catch (e) {
      console.error('Search failed:', e);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, onMapClick]);

  return (
    <div className={`absolute inset-0 flex flex-col bg-gray-100 ${className}`}>
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-600 to-blue-700 z-[500]">
        <MapPin className="h-4 w-4 text-white shrink-0" />
        <span className="text-white text-sm font-medium mr-1 hidden sm:inline">Map</span>
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-blue-300 pointer-events-none" />
            <input
              type="text"
              placeholder="Search address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddressSearch())}
              className="w-full h-8 pl-8 pr-3 rounded-md bg-white/15 text-white placeholder:text-blue-200 text-sm border border-white/20 focus:outline-none focus:bg-white/25"
            />
          </div>
          <Button size="sm" onClick={handleAddressSearch} disabled={isSearching || !searchQuery.trim()}
            className="h-8 px-3 text-xs bg-white/20 text-white hover:bg-white/30 border border-white/20 shrink-0">
            {isSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Go'}
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={handleGeolocate} disabled={isLocating}
          className="h-8 text-xs text-white hover:bg-white/20 shrink-0">
          <Crosshair className="h-3.5 w-3.5 mr-1" />
          <span className="hidden sm:inline">{isLocating ? '...' : 'Locate'}</span>
        </Button>
      </div>

      {/* Map */}
      <div ref={containerRef} className="flex-1 min-h-0" />

      {/* Hint */}
      {interactive && ready && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-xs font-medium backdrop-blur-sm z-[1000] pointer-events-none whitespace-nowrap">
          Click the map to report a hazard
        </div>
      )}
    </div>
  );
}
