import { useState, useMemo, useRef } from 'react';
import { useRoadReports } from '@/hooks/useRoadReports';
import { useDeleteReport, useEditReport } from '@/hooks/useReportMutations';
import { ReportCard } from '@/components/ReportCard';
import { EditReportDialog, type EditFields } from '@/components/EditReportDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Search, Map, AlertCircle, ArrowLeft } from 'lucide-react';
import { HAZARD_TYPES, SEVERITY_LEVELS } from '@/lib/constants';
import { useNavigate } from 'react-router-dom';
import type { RoadReport } from '@/hooks/useRoadReports';

export function ReportListPage() {
  const navigate = useNavigate();
  const { data: reports, isLoading } = useRoadReports();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [editingReport, setEditingReport] = useState<RoadReport | null>(null);
  const [deletingReport, setDeletingReport] = useState<RoadReport | null>(null);

  const deleteReport = useDeleteReport();
  const editReport = useEditReport();

  // Ref to hold the report being deleted so we can fire-and-forget after dialog closes
  const pendingDeleteRef = useRef<RoadReport | null>(null);

  const filteredReports = useMemo(() => {
    if (!reports) return [];

    return reports.filter((report) => {
      // Search filter
      if (search) {
        const s = search.toLowerCase();
        const matchesSearch =
          report.title.toLowerCase().includes(s) ||
          report.description.toLowerCase().includes(s) ||
          report.location.toLowerCase().includes(s) ||
          report.district.toLowerCase().includes(s);
        if (!matchesSearch) return false;
      }

      // Type filter
      if (typeFilter !== 'all' && report.type !== typeFilter) return false;

      // Severity filter
      if (severityFilter !== 'all' && report.severity !== severityFilter) return false;

      // Status filter
      if (statusFilter !== 'all' && report.status !== statusFilter) return false;

      return true;
    });
  }, [reports, search, typeFilter, severityFilter, statusFilter]);

  // Stats
  const stats = useMemo(() => {
    if (!reports) return { total: 0, open: 0, critical: 0 };
    return {
      total: reports.length,
      open: reports.filter(r => r.status === 'open').length,
      critical: reports.filter(r => r.severity === 'critical').length,
    };
  }, [reports]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b">
        <div className="container max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/map')} className="h-8 w-8 p-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="font-bold text-lg">All Reports</h1>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate('/map')} className="h-8 text-xs">
                <Map className="h-4 w-4 mr-1" /> Map
              </Button>
            </div>
          </div>

          {/* Stats bar */}
          <div className="flex gap-4 mt-2">
            <div className="text-xs">
              <span className="text-muted-foreground">Total:</span>{' '}
              <span className="font-bold">{stats.total}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Open:</span>{' '}
              <span className="font-bold text-red-500">{stats.open}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Critical:</span>{' '}
              <span className="font-bold text-orange-500">{stats.critical}</span>
            </div>
          </div>

          {/* Search and filters */}
          <div className="flex gap-2 mt-3 overflow-x-auto">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search reports..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-28 shrink-0 h-9 text-xs">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {HAZARD_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.icon} {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-28 shrink-0 h-9 text-xs">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {SEVERITY_LEVELS.map(level => (
                  <SelectItem key={level.value} value={level.value}>
                    {level.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-24 shrink-0 h-9 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="acknowledged">Acknowledged</SelectItem>
                <SelectItem value="fixed">Fixed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Report list */}
      <div className="container max-w-4xl mx-auto px-4 py-4 space-y-3">
        {isLoading ? (
          // Loading skeletons
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="rounded-xl">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : filteredReports.length === 0 ? (
          // Empty state
          <Card className="border-dashed rounded-2xl">
            <CardContent className="py-16 text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
              <h3 className="font-semibold text-lg mb-1">No Reports Found</h3>
              <p className="text-muted-foreground text-sm">
                {reports?.length === 0
                  ? 'No road hazard reports have been submitted yet. Be the first!'
                  : 'Try adjusting your search or filters.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          // Report cards
          filteredReports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              onClick={() => navigate(`/report/${report.id}`)}
              onShowOnMap={(lat, lng) => navigate(`/?lat=${lat}&lng=${lng}`)}
              onEdit={(r) => setEditingReport(r)}
              onDelete={(r) => setDeletingReport(r)}
            />
          ))
        )}
      </div>

      {/* Edit Dialog */}
      <EditReportDialog
        report={editingReport}
        open={!!editingReport}
        onOpenChange={(open) => { if (!open) setEditingReport(null); }}
        onSave={editReport}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletingReport}
        onOpenChange={(open) => {
          if (!open) {
            // Dialog closed — fire-and-forget the delete if user confirmed
            const pending = pendingDeleteRef.current;
            pendingDeleteRef.current = null;
            setDeletingReport(null);
            if (pending) {
              deleteReport(pending).catch(console.error);
            }
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report</AlertDialogTitle>
            <AlertDialogDescription>
              This will publish a deletion request to Nostr. The report "{deletingReport?.title}" will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white"
              onPointerDown={() => {
                pendingDeleteRef.current = deletingReport;
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
