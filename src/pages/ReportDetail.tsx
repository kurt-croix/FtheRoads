import { lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRoadReport } from '@/hooks/useRoadReports';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, MapPin, Clock, User, AlertTriangle, Mail, Loader2 } from 'lucide-react';
import { HAZARD_TYPES, SEVERITY_LEVELS, DEFAULT_NOTIFICATION_EMAIL, getDistrictEmail } from '@/lib/constants';
import { decodeGeohash } from '@/lib/geohash';
import { formatDistanceToNow } from 'date-fns';
import { NoteContent } from '@/components/NoteContent';

const ReportMap = lazy(() =>
  import('@/components/ReportMap').then(m => ({ default: m.ReportMap }))
);

export default function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: report, isLoading } = useRoadReport(id ?? '');

  if (isLoading) {
    return (
      <div className="container max-w-2xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="container max-w-2xl mx-auto px-4 py-16 text-center">
        <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
        <h2 className="text-xl font-bold mb-2">Report Not Found</h2>
        <p className="text-muted-foreground mb-4">This report may not exist or hasn't propagated to relays yet.</p>
        <Button onClick={() => navigate('/map')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Map
        </Button>
      </div>
    );
  }

  const hazardType = HAZARD_TYPES.find(h => h.value === report.type);
  const severity = SEVERITY_LEVELS.find(s => s.value === report.severity);
  const emailTarget = report.district
    ? getDistrictEmail(report.district)
    : DEFAULT_NOTIFICATION_EMAIL;

  // Get coordinates for the map
  let lat = report.lat;
  let lng = report.lng;
  if (!lat || !lng) {
    const decoded = decodeGeohash(report.geohash);
    lat = decoded.lat;
    lng = decoded.lng;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b">
        <div className="container max-w-2xl mx-auto px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="h-8">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </div>
      </div>

      <div className="container max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Map preview */}
        <div className="rounded-2xl overflow-hidden border relative h-48 sm:h-72 md:h-80">
          <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center bg-muted/30"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
            <ReportMap
              reports={[report]}
              interactive={false}
            />
          </Suspense>
        </div>

        {/* Main report card */}
        <Card className="rounded-2xl border-l-4" style={{ borderLeftColor: severity?.color }}>
          <CardHeader className="pb-2">
            <div className="flex items-start gap-3">
              <div
                className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                style={{ background: `${severity?.color}20` }}
              >
                {hazardType?.icon ?? '⚫'}
              </div>
              <div className="flex-1">
                <CardTitle className="text-lg">{report.title}</CardTitle>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <Badge
                    variant="secondary"
                    className="text-xs"
                    style={{
                      background: severity?.color,
                      color: 'white',
                    }}
                  >
                    {severity?.label ?? report.severity}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {hazardType?.label ?? report.type}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className={`text-xs ${
                      report.status === 'open' ? 'bg-red-100 text-red-700' :
                      report.status === 'acknowledged' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-green-100 text-green-700'
                    }`}
                  >
                    {report.status}
                  </Badge>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Meta info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="truncate">{report.location || `${lat?.toFixed(4)}, ${lng?.toFixed(4)}`}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span>{formatDistanceToNow(report.createdAt * 1000, { addSuffix: true })}</span>
              </div>
            </div>

            {/* District info */}
            {report.district && (
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    District: {report.district}
                  </span>
                </div>
                <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-1 ml-6">
                  Notification sent to: {emailTarget}
                </p>
              </div>
            )}

            {/* Description */}
            {report.description && (
              <div>
                <h3 className="text-sm font-semibold mb-1.5">Details</h3>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap break-words bg-muted/50 rounded-xl p-3">
                  <NoteContent event={report.event} />
                </div>
              </div>
            )}

            {/* Images */}
            {report.images.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-1.5">Photos</h3>
                <div className="grid gap-2">
                  {report.images.map((img, i) => (
                    <img
                      key={i}
                      src={img}
                      alt={`Photo ${i + 1}`}
                      className="w-full rounded-xl object-cover max-h-80"
                      loading="lazy"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Reporter */}
            <ReporterInfo pubkey={report.event.pubkey} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ReporterInfo({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.name || genUserName(pubkey);
  const picture = metadata?.picture;

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t">
      <div className="w-6 h-6 rounded-full bg-muted overflow-hidden">
        {picture && <img src={picture} alt="" className="w-full h-full object-cover" />}
      </div>
      <User className="h-3.5 w-3.5" />
      <span>Reported by {name}</span>
    </div>
  );
}
