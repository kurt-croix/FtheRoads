import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { RoadReport } from '@/hooks/useRoadReports';

// --- Mocks ---

const mockUseRoadReport = vi.fn();
vi.mock('@/hooks/useRoadReports', () => ({
  useRoadReport: (...args: unknown[]) => mockUseRoadReport(...args),
}));

const mockUseAuthor = vi.fn();
vi.mock('@/hooks/useAuthor', () => ({
  useAuthor: (...args: unknown[]) => mockUseAuthor(...args),
}));

vi.mock('@/lib/constants', () => ({
  HAZARD_TYPES: [
    { value: 'pothole', label: 'Pothole', icon: '🔴' },
    { value: 'ditch', label: 'Ditch / Shoulder Damage', icon: '🟠' },
    { value: 'flooding', label: 'Flooding / Drainage', icon: '🔵' },
  ],
  SEVERITY_LEVELS: [
    { value: 'low', label: 'Low', color: '#22c55e' },
    { value: 'medium', label: 'Medium', color: '#f59e0b' },
    { value: 'high', label: 'High', color: '#f97316' },
    { value: 'critical', label: 'Critical', color: '#ef4444' },
  ],
  DEFAULT_NOTIFICATION_EMAIL: 'croix4clerk@pm.me',
  getDistrictEmail: vi.fn((district: string) => `${district.toLowerCase()}@example.com`),
}));

const mockDecodeGeohash = vi.fn();
vi.mock('@/lib/geohash', () => ({
  decodeGeohash: (...args: unknown[]) => mockDecodeGeohash(...args),
}));

vi.mock('@/components/NoteContent', () => ({
  NoteContent: ({ event }: { event: { id: string } }) => (
    <div data-testid="note-content">Content for {event.id}</div>
  ),
}));

vi.mock('@/components/ReportMap', () => ({
  ReportMap: ({ reports }: { reports: RoadReport[] }) => (
    <div data-testid="report-map">{reports.length} report(s)</div>
  ),
}));

const mockNavigate = vi.fn();
const mockUseParams = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockUseParams(),
  };
});

vi.mock('date-fns', () => ({
  formatDistanceToNow: vi.fn((_ts: number, _opts: { addSuffix: boolean }) => '2 hours ago'),
}));

vi.mock('@unhead/react', () => ({
  useSeoMeta: vi.fn(),
}));

// Mock lucide-react icons as simple spans
vi.mock('lucide-react', () => {
  const mockIcon = React.forwardRef<SVGSVGElement>(function MockIcon(_props, _ref) {
    return React.createElement('span', null);
  });
  return {
    ArrowLeft: mockIcon,
    MapPin: mockIcon,
    Clock: mockIcon,
    User: mockIcon,
    AlertTriangle: mockIcon,
    Mail: mockIcon,
    Loader2: mockIcon,
  };
});

vi.mock('@/lib/genUserName', () => ({
  genUserName: vi.fn((pubkey: string) => `user-${pubkey.slice(0, 6)}`),
}));

// Import the component under test AFTER mocks are set up.
import ReportDetail from '@/pages/ReportDetail';

// --- Helpers ---

/** Build a RoadReport with sensible defaults. Spread `overrides` last. */
const makeReport = (overrides: Partial<RoadReport> = {}): RoadReport => ({
  event: {
    id: 'evt-1',
    kind: 1031,
    pubkey: 'abc123def456',
    created_at: Math.floor(Date.now() / 1000) - 3600,
    tags: [
      ['d', 'd-1'],
      ['g', '9zn'],
      ['type', 'pothole'],
      ['severity', 'high'],
      ['alt', 'Road hazard report'],
    ],
    content: 'A pothole on main street',
    sig: 'sig-1',
  },
  id: 'report-1',
  title: 'Big Pothole',
  type: 'pothole',
  severity: 'high',
  geohash: '9zn',
  location: 'Main Street',
  description: 'A pothole on main street',
  images: [],
  district: 'Richmond',
  status: 'open',
  lat: 39.28,
  lng: -93.98,
  createdAt: Math.floor(Date.now() / 1000) - 3600,
  ...overrides,
});

/** Render ReportDetail inside a MemoryRouter that provides the `:id` param. */
function renderPage(id = 'report-1') {
  mockUseParams.mockReturnValue({ id });

  return render(
    <MemoryRouter initialEntries={[`/report/${id}`]}>
      <Routes>
        <Route path="/report/:id" element={<ReportDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  mockUseParams.mockReturnValue({ id: 'report-1' });
  mockUseAuthor.mockReturnValue({ data: { metadata: { name: 'TestUser', picture: 'https://example.com/pic.jpg' } } });
  mockDecodeGeohash.mockReturnValue({ lat: 39.5, lng: -93.5 });
});

describe('ReportDetail', () => {
  // 1. Loading state shows skeletons (no report content).
  it('shows loading skeletons when isLoading', () => {
    mockUseRoadReport.mockReturnValue({ data: undefined, isLoading: true });

    renderPage();

    // Skeleton renders as divs with animate-pulse. Verify report content is absent.
    expect(screen.queryByText('Big Pothole')).not.toBeInTheDocument();
    expect(screen.queryByTestId('report-map')).not.toBeInTheDocument();
    expect(screen.queryByText('Report Not Found')).not.toBeInTheDocument();
  });

  // 2. Null report shows "Report Not Found".
  it('shows "Report Not Found" when report is null', () => {
    mockUseRoadReport.mockReturnValue({ data: null, isLoading: false });

    renderPage();

    expect(screen.getByText('Report Not Found')).toBeInTheDocument();
    expect(screen.getByText(/may not exist or hasn't propagated/)).toBeInTheDocument();
  });

  // 3. Shows report title when loaded.
  it('shows report title when loaded', () => {
    mockUseRoadReport.mockReturnValue({ data: makeReport(), isLoading: false });

    renderPage();

    expect(screen.getByText('Big Pothole')).toBeInTheDocument();
  });

  // 4. Shows severity and type badges.
  it('shows severity and type badges', () => {
    mockUseRoadReport.mockReturnValue({ data: makeReport(), isLoading: false });

    renderPage();

    // Severity label from SEVERITY_LEVELS mock
    expect(screen.getByText('High')).toBeInTheDocument();
    // Type label from HAZARD_TYPES mock
    expect(screen.getByText('Pothole')).toBeInTheDocument();
  });

  // 5. Shows status badge.
  it('shows status badge', () => {
    mockUseRoadReport.mockReturnValue({ data: makeReport({ status: 'acknowledged' }), isLoading: false });

    renderPage();

    expect(screen.getByText('acknowledged')).toBeInTheDocument();
  });

  // 6. Shows description via NoteContent.
  it('shows description', () => {
    const report = makeReport();
    mockUseRoadReport.mockReturnValue({ data: report, isLoading: false });

    renderPage();

    // The "Details" heading and NoteContent mock
    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByTestId('note-content')).toBeInTheDocument();
  });

  // 7. Shows district info with email.
  it('shows district info with email', () => {
    const report = makeReport({ district: 'Richmond' });
    mockUseRoadReport.mockReturnValue({ data: report, isLoading: false });

    renderPage();

    expect(screen.getByText(/District: Richmond/)).toBeInTheDocument();
    expect(screen.getByText(/Notification sent to:/)).toBeInTheDocument();
  });

  // 8. Falls back to geohash decoded coordinates when no lat/lng.
  it('falls back to geohash decoded coordinates when no lat/lng', () => {
    const report = makeReport({ lat: undefined, lng: undefined, location: '' });
    mockUseRoadReport.mockReturnValue({ data: report, isLoading: false });

    renderPage();

    // decodeGeohash should have been called with the report's geohash
    expect(mockDecodeGeohash).toHaveBeenCalledWith('9zn');
    // Location display should show the decoded coordinates
    expect(screen.getByText(/39\.5.*-93\.5/)).toBeInTheDocument();
  });

  // 9. Shows reporter info.
  it('shows reporter info', () => {
    const report = makeReport();
    mockUseRoadReport.mockReturnValue({ data: report, isLoading: false });

    renderPage();

    expect(screen.getByText(/Reported by TestUser/)).toBeInTheDocument();
  });
});
