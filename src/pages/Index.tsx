import { lazy, useState, useCallback, useEffect, Suspense } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useRoadReports } from '@/hooks/useRoadReports';
import { ReportCard } from '@/components/ReportCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LoginArea } from '@/components/auth/LoginArea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertCircle,
  AlertTriangle,
  List,
  MapPin,
  Menu,
  X,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

const ReportMap = lazy(() =>
  import('@/components/ReportMap').then(m => ({ default: m.ReportMap }))
);
const ReportForm = lazy(() =>
  import('@/components/ReportForm').then(m => ({ default: m.ReportForm }))
);

function Header() {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-50 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-gray-700/50 shadow-2xl">
      <div className="container mx-auto px-3 sm:px-4">
        <div className="flex items-center h-14 gap-2 sm:gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="FtheRoads" className="h-8 w-8 rounded-lg shadow-lg" />
            <div>
              <h1 className="font-extrabold text-base text-white tracking-tight leading-none">
                F<span className="text-red-400">the</span>Roads
              </h1>
              <span className="text-[9px] text-gray-400 leading-none">.com</span>
            </div>
          </div>
          <div className="hidden md:flex items-center">
            <span className="text-xs text-gray-400 border-l border-gray-600 pl-3 ml-1">
              <span className="text-orange-400 font-semibold">"F"</span> is for{' '}
              <span className="text-white font-medium">Fix</span> — Report road hazards in Ray County, MO
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1 sm:gap-2 min-w-0">
            <Button variant="ghost" size="sm" onClick={() => navigate('/reports')} className="h-8 text-xs text-gray-300 hover:text-white hover:bg-white/10">
              <List className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Reports</span>
            </Button>
            <div className="min-w-0">
              <LoginArea className="max-w-32 sm:max-w-40" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function StatsBar({ reports }: { reports: ReturnType<typeof useRoadReports>['data'] }) {
  const total = reports?.length ?? 0;
  const open = reports?.filter(r => r.status === 'open').length ?? 0;
  const critical = reports?.filter(r => r.severity === 'critical').length ?? 0;
  const potholes = reports?.filter(r => r.type === 'pothole').length ?? 0;
  const stats = [
    { label: 'Total', value: total, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Open', value: open, color: 'text-red-400', bg: 'bg-red-500/10' },
    { label: 'Critical', value: critical, color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { label: 'Potholes', value: potholes, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  ];
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
      {stats.map((s) => (
        <div key={s.label} className={`${s.bg} rounded-xl p-1.5 sm:p-2.5 text-center`}>
          <div className={`text-base sm:text-xl font-bold ${s.color}`}>{s.value}</div>
          <div className="text-[9px] sm:text-[10px] text-muted-foreground font-medium">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function MapFallback() {
  return (
    <div className="flex items-center justify-center bg-muted/30 rounded-2xl h-[calc(100vh-200px)] sm:h-[calc(100vh-220px)] min-h-[300px] sm:min-h-[400px]">
      <div className="text-center space-y-3">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="text-sm text-muted-foreground">Loading map...</p>
      </div>
    </div>
  );
}

/** Sidebar content shared between desktop panel and mobile sheet. */
function SidebarContent({ reports, isLoading, selectedLocation, handleMapClick, navigate }: {
  reports: ReturnType<typeof useRoadReports>['data'];
  isLoading: boolean;
  selectedLocation: { lat: number; lng: number } | null;
  handleMapClick: (lat: number, lng: number) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const recentReports = reports?.slice(0, 8) ?? [];

  return (
    <div className="space-y-3">
      {/* Report form section */}
      <div>
        <h2 className="font-bold text-sm flex items-center gap-1.5 mb-2">
          <AlertCircle className="h-4 w-4 text-red-500" />
          Report Hazard
        </h2>
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <ReportForm
            selectedLocation={selectedLocation}
            onLocationSelect={handleMapClick}
            onClearLocation={() => {}}
          />
        </Suspense>
      </div>

      <div className="border-t pt-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-sm flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            Recent Reports
          </h2>
          <Button variant="ghost" size="sm" onClick={() => navigate('/reports')} className="h-7 text-xs">
            View All <ChevronRight className="h-3 w-3 ml-0.5" />
          </Button>
        </div>
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="rounded-xl">
              <CardContent className="p-3">
                <div className="flex items-start gap-2">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-2.5 w-1/2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : recentReports.length === 0 ? (
          <Card className="border-dashed rounded-xl">
            <CardContent className="py-6 text-center">
              <MapPin className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">No reports yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentReports.map((report) => (
              <ReportCard key={report.id} report={report} compact />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function IndexContent() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: reports, isLoading } = useRoadReports();
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const isMobile = useIsMobile();

  // Handle lat/lng query params from "Show on Map"
  useEffect(() => {
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    if (lat && lng) {
      setSelectedLocation({ lat: parseFloat(lat), lng: parseFloat(lng) });
      setSearchParams({}, { replace: true });
      if (isMobile) setMobileSheetOpen(true);
    }
  }, [searchParams, setSearchParams, isMobile]);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setSelectedLocation({ lat, lng });
    if (isMobile) {
      setMobileSheetOpen(true);
    } else {
      setShowSidebar(true);
    }
  }, [isMobile]);

  const recentReports = reports?.slice(0, 8) ?? [];

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-3">
        <StatsBar reports={reports} />
      </div>
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-h-0 min-w-0 relative">
          <Suspense fallback={<MapFallback />}>
            <ReportMap
              reports={reports ?? []}
              onMapClick={handleMapClick}
              selectedLocation={selectedLocation}
              interactive={true}
            />
          </Suspense>

          {/* Desktop sidebar toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSidebar(!showSidebar)}
            className="absolute top-2 right-2 z-[1001] h-8 w-8 p-0 bg-white dark:bg-gray-800 shadow-lg hidden md:flex"
          >
            {showSidebar ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>

          {/* Mobile FAB — opens bottom sheet with form + reports */}
          <Button
            variant="default"
            size="sm"
            onClick={() => setMobileSheetOpen(true)}
            className="absolute bottom-4 right-4 z-[1001] h-12 w-12 rounded-full shadow-xl md:hidden bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600"
          >
            <Plus className="h-6 w-6" />
          </Button>
        </div>

        {/* Desktop sidebar panel */}
        {showSidebar && (
          <div className="w-80 border-l bg-background overflow-y-auto p-3 hidden md:block">
            <SidebarContent
              reports={reports}
              isLoading={isLoading}
              selectedLocation={selectedLocation}
              handleMapClick={handleMapClick}
              navigate={navigate}
            />
          </div>
        )}
      </div>

      {/* Mobile bottom sheet */}
      <Sheet open={isMobile && mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl p-4 overflow-y-auto">
          <SheetTitle className="text-sm font-bold flex items-center gap-1.5 mb-3">
            <AlertCircle className="h-4 w-4 text-red-500" />
            Report &amp; Reports
          </SheetTitle>
          <SidebarContent
            reports={reports}
            isLoading={isLoading}
            selectedLocation={selectedLocation}
            handleMapClick={handleMapClick}
            navigate={navigate}
          />
        </SheetContent>
      </Sheet>

      <footer className="border-t py-2 px-4 text-center bg-muted/30">
        <p className="text-[10px] text-muted-foreground">
          <a href="https://shakespeare.diy" target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-500">
            Vibed with Shakespeare
          </a>
          {' • '}FtheRoads.com — Fix the Roads{' • '}Ray County, Missouri
        </p>
      </footer>
    </div>
  );
}

export default function Index() {
  useSeoMeta({
    title: 'FtheRoads.com — Fix the Roads | Report Road Hazards',
    description: 'Report potholes, ditches, obstructions and other road hazards in Ray County, Missouri. Community-powered road condition reporting via Nostr.',
    ogTitle: 'FtheRoads.com — Fix the Roads',
    ogDescription: 'Report road hazards in Ray County, MO. "F" is for Fix!',
  });

  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <AlertTriangle className="h-12 w-12 text-orange-500" />
          <p className="text-muted-foreground">Loading FtheRoads...</p>
        </div>
      </div>
    }>
      <IndexContent />
    </Suspense>
  );
}
