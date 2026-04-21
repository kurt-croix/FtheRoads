import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { KIND_ROAD_REPORT } from '@/lib/constants';
import { encodeGeohash } from '@/lib/geohash';
import type { RoadReport } from '@/hooks/useRoadReports';

export function useDeleteReport() {
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return async (report: RoadReport) => {
    await publishEvent({
      kind: 5,
      content: 'Deleted by author',
      tags: [['e', report.id]],
      created_at: Math.floor(Date.now() / 1000),
    });
    queryClient.invalidateQueries({ queryKey: ['road-reports'] });
    toast({ title: 'Report Deleted' });
  };
}

export function useEditReport() {
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return async (report: RoadReport, updates: Partial<{
    title: string;
    type: string;
    severity: string;
    description: string;
    location: string;
    status: string;
  }>) => {
    const getTag = (name: string) => report.event.tags.find(([n]) => n === name);

    const dTag = getTag('d')?.[1] ?? crypto.randomUUID();
    const gTag = getTag('g')?.[1] ?? '';
    const latTag = getTag('lat')?.[1];
    const lngTag = getTag('lng')?.[1];
    const imageTags = report.event.tags.filter(([n]) => n === 'image');
    const districtTag = getTag('district');

    const tags: string[][] = [
      ['d', dTag],
      ['g', gTag],
      ['title', updates.title ?? getTag('title')?.[1] ?? ''],
      ['type', updates.type ?? getTag('type')?.[1] ?? ''],
      ['severity', updates.severity ?? getTag('severity')?.[1] ?? ''],
      ['status', updates.status ?? getTag('status')?.[1] ?? 'open'],
      ['alt', 'Road hazard report'],
    ];

    if (latTag) tags.push(['lat', latTag]);
    if (lngTag) tags.push(['lng', lngTag]);
    if (updates.location ?? getTag('location')?.[1]) {
      tags.push(['location', updates.location ?? getTag('location')![1]]);
    }
    if (districtTag) tags.push(['district', districtTag[1]]);
    for (const [, url] of imageTags) {
      tags.push(['image', url]);
    }

    await publishEvent({
      kind: KIND_ROAD_REPORT,
      content: updates.description ?? report.description,
      tags,
      created_at: Math.floor(Date.now() / 1000),
    });

    // Also publish deletion for the old event
    await publishEvent({
      kind: 5,
      content: 'Replaced by edit',
      tags: [['e', report.id]],
      created_at: Math.floor(Date.now() / 1000),
    });

    queryClient.invalidateQueries({ queryKey: ['road-reports'] });
    toast({ title: 'Report Updated' });
  };
}
