import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MapPin, Clock, AlertTriangle, MoreVertical, Map, Image, Pencil, Trash2, Code, Copy } from 'lucide-react';
import type { RoadReport } from '@/hooks/useRoadReports';
import { HAZARD_TYPES, SEVERITY_LEVELS } from '@/lib/constants';
import { formatDistanceToNow } from 'date-fns';
import { nip19 } from 'nostr-tools';
import { useToast } from '@/hooks/useToast';
import { useCurrentUser } from '@/hooks/useCurrentUser';

interface ReportCardProps {
  report: RoadReport;
  onClick?: () => void;
  compact?: boolean;
  onShowOnMap?: (lat: number, lng: number) => void;
  onEdit?: (report: RoadReport) => void;
  onDelete?: (report: RoadReport) => void;
}

function ReporterInfo({ pubkey }: { pubkey: string }) {
  try {
    const npub = nip19.npubEncode(pubkey);
    const truncated = `${npub.slice(0, 12)}...${npub.slice(-4)}`;
    return (
      <span className="text-xs text-muted-foreground font-mono">
        by {truncated}
      </span>
    );
  } catch {
    return null;
  }
}

export function ReportCard({ report, onClick, compact = false, onShowOnMap, onEdit, onDelete }: ReportCardProps) {
  const hazardType = HAZARD_TYPES.find(h => h.value === report.type);
  const severity = SEVERITY_LEVELS.find(s => s.value === report.severity);
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const [showRawEvent, setShowRawEvent] = useState(false);
  const [showImage, setShowImage] = useState(false);
  const isOwner = user?.pubkey === report.event.pubkey;

  const statusColors: Record<string, string> = {
    open: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    acknowledged: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    fixed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  };

  const handleCopyId = () => {
    try {
      const nevent = nip19.neventEncode({ id: report.id, author: report.event.pubkey, kind: report.event.kind });
      navigator.clipboard.writeText(nevent);
      toast({ title: 'Copied', description: 'Event ID copied to clipboard' });
    } catch {
      navigator.clipboard.writeText(report.id);
      toast({ title: 'Copied', description: 'Event ID copied to clipboard' });
    }
  };

  return (
    <>
      <Card
        className={`hover:shadow-lg transition-all duration-200 border-l-4 rounded-xl overflow-hidden ${
          severity ? 'border-l-[color:var(--severity-color)]' : ''
        }`}
        style={{ '--severity-color': severity?.color } as React.CSSProperties}
      >
        <CardContent className={compact ? 'p-3' : 'p-4'}>
          <div className="flex items-start gap-3">
            {/* Hazard icon */}
            <div
              className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg cursor-pointer"
              style={{ background: `${severity?.color}20` }}
              onClick={onClick}
            >
              {hazardType?.icon ?? '⚫'}
            </div>

            <div className="flex-1 min-w-0">
              {/* Title row with menu */}
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-sm leading-tight truncate cursor-pointer" onClick={onClick}>
                  {report.title}
                </h3>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex-shrink-0 h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onShowOnMap && report.lat != null && report.lng != null && (
                      <DropdownMenuItem onClick={() => onShowOnMap(report.lat!, report.lng!)}>
                        <Map className="h-4 w-4 mr-2" /> Show on Map
                      </DropdownMenuItem>
                    )}
                    {isOwner && onEdit && (
                      <DropdownMenuItem onClick={() => onEdit(report)}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit
                      </DropdownMenuItem>
                    )}
                    {isOwner && onDelete && (
                      <DropdownMenuItem onClick={() => onDelete(report)} className="text-red-600 focus:text-red-600">
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setShowRawEvent(true)}>
                      <Code className="h-4 w-4 mr-2" /> Raw Event
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleCopyId}>
                      <Copy className="h-4 w-4 mr-2" /> Copy Event ID
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Meta info */}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge
                  variant="secondary"
                  className={`text-[10px] px-2 py-0 h-5 font-medium ${statusColors[report.status] || ''}`}
                >
                  {report.status}
                </Badge>
                <Badge variant="outline" className="text-[10px] px-2 py-0 h-5">
                  {hazardType?.label ?? report.type}
                </Badge>
                {report.images.length > 0 && (
                  <button
                    onClick={() => setShowImage(true)}
                    className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Image className="h-3.5 w-3.5" />
                    <span className="text-[10px]">{report.images.length}</span>
                  </button>
                )}
              </div>

              {/* Location and time */}
              {!compact && (
                <>
                  <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    {report.lat != null && report.lng != null ? (
                      <span>{report.lat.toFixed(4)}, {report.lng.toFixed(4)}</span>
                    ) : null}
                    {(report.location || report.district) && (
                      <span className="truncate">
                        {report.lat != null && report.lng != null ? ' • ' : ''}
                        {report.location || report.district}
                      </span>
                    )}
                    {!report.lat && !report.location && !report.district && (
                      <span>No location</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(report.createdAt * 1000, { addSuffix: true })}
                    </div>
                    <ReporterInfo pubkey={report.event.pubkey} />
                  </div>
                </>
              )}
            </div>

            {/* Severity indicator */}
            <div className="flex-shrink-0">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: severity?.color }}
                title={severity?.label}
              />
            </div>
          </div>

          {/* Description preview */}
          {!compact && report.description && (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed cursor-pointer" onClick={onClick}>
              {report.description}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Raw Event Dialog */}
      <Dialog open={showRawEvent} onOpenChange={setShowRawEvent}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>Raw Event</DialogTitle>
          </DialogHeader>
          <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(report.event, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>

      {/* Image Dialog */}
      <Dialog open={showImage} onOpenChange={setShowImage}>
        <DialogContent className="max-w-lg p-2 rounded-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Image</DialogTitle>
          </DialogHeader>
          {report.images.map((url, i) => (
            <img key={i} src={url} alt="" className="w-full rounded-lg object-contain max-h-[70vh]" />
          ))}
        </DialogContent>
      </Dialog>
    </>
  );
}
