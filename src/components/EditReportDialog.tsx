import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { HAZARD_TYPES, SEVERITY_LEVELS, REPORT_STATUSES } from '@/lib/constants';
import type { RoadReport } from '@/hooks/useRoadReports';

interface EditReportDialogProps {
  report: RoadReport | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (report: RoadReport, updates: EditFields) => Promise<void>;
}

export interface EditFields {
  title: string;
  type: string;
  severity: string;
  status: string;
  location: string;
  description: string;
}

export function EditReportDialog({ report, open, onOpenChange, onSave }: EditReportDialogProps) {
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<EditFields>({
    title: '', type: '', severity: '', status: '', location: '', description: '',
  });

  useEffect(() => {
    if (report && open) {
      const getTag = (name: string) => report.event.tags.find(([n]) => n === name)?.[1] ?? '';
      setFields({
        title: getTag('title'),
        type: getTag('type'),
        severity: getTag('severity'),
        status: getTag('status') || 'open',
        location: getTag('location'),
        description: report.description,
      });
    }
  }, [report, open]);

  const handleSave = async () => {
    if (!report) return;
    setSaving(true);
    try {
      await onSave(report, fields);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>Edit Report</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium">Title</Label>
            <Input value={fields.title} onChange={e => setFields(f => ({ ...f, title: e.target.value }))} className="mt-1" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-sm font-medium">Type</Label>
              <Select value={fields.type} onValueChange={v => setFields(f => ({ ...f, type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HAZARD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium">Severity</Label>
              <Select value={fields.severity} onValueChange={v => setFields(f => ({ ...f, severity: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITY_LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium">Status</Label>
              <Select value={fields.status} onValueChange={v => setFields(f => ({ ...f, status: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium">Location</Label>
            <Input value={fields.location} onChange={e => setFields(f => ({ ...f, location: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm font-medium">Details</Label>
            <Textarea value={fields.description} onChange={e => setFields(f => ({ ...f, description: e.target.value }))} rows={3} className="mt-1" />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
