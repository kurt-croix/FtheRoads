import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { RoadReport } from '@/hooks/useRoadReports';

// --- Mocks ---

const mockUseRoadReports = vi.fn();
vi.mock('@/hooks/useRoadReports', () => ({
  useRoadReports: () => mockUseRoadReports(),
}));

const mockDeleteReport = vi.fn();
const mockEditReport = vi.fn();
vi.mock('@/hooks/useReportMutations', () => ({
  useDeleteReport: () => mockDeleteReport,
  useEditReport: () => mockEditReport,
}));

// Mock ReportCard — renders a div with data-testid and the report title so we
// can count cards and verify which reports rendered.
interface MockReportCardProps {
  report: RoadReport;
  onEdit: (r: RoadReport) => void;
  onDelete: (r: RoadReport) => void;
}

vi.mock('@/components/ReportCard', () => ({
  ReportCard: ({ report, onEdit, onDelete }: MockReportCardProps) => (
    <div data-testid="report-card" data-report-id={report.id}>
      <span>{report.title}</span>
      <button onClick={() => onEdit(report)}>edit</button>
      <button onClick={() => onDelete(report)}>delete</button>
    </div>
  ),
}));

interface MockEditDialogProps {
  report: RoadReport | null;
  open: boolean;
}

vi.mock('@/components/EditReportDialog', () => ({
  EditReportDialog: ({ report, open }: MockEditDialogProps) =>
    open ? <div data-testid="edit-dialog">Editing: {report?.title}</div> : null,
}));

// Mock lucide-react — the factory returns named exports for every icon used by
// the page and its child UI components (Radix Select uses Check, ChevronDown,
// ChevronUp). The mock component is defined inline because vi.mock is hoisted
// above all other statements.
vi.mock('lucide-react', () => {
  const mockIcon = React.forwardRef<SVGSVGElement>(function MockIcon(_props, _ref) {
    return React.createElement('span', null);
  });
  return {
    Search: mockIcon,
    Map: mockIcon,
    AlertCircle: mockIcon,
    ArrowLeft: mockIcon,
    ChevronDown: mockIcon,
    ChevronUp: mockIcon,
    Check: mockIcon,
  };
});

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
  KIND_ROAD_REPORT: 1031,
}));

// Mock react-router-dom useNavigate so we can assert navigation calls.
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Import the component under test AFTER mocks are set up.
import { ReportListPage } from '@/pages/ReportList';

// --- Helpers ---

/** Build a RoadReport with sensible defaults. Spread `overrides` last. */
const makeReport = (overrides: Partial<RoadReport> = {}): RoadReport => ({
  event: {
    id: 'evt-1',
    kind: 1031,
    pubkey: 'pubkey-1',
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

/** A set of reports with varied types, severities, and statuses for filtering tests. */
const mockReports: RoadReport[] = [
  makeReport({
    id: 'r1',
    title: 'Pothole on Elm',
    type: 'pothole',
    severity: 'high',
    status: 'open',
    location: 'Elm Street',
    district: 'Richmond',
    description: 'Large pothole near the intersection',
    event: { id: 'evt-r1', kind: 1031, pubkey: 'p1', created_at: 100, tags: [], content: '', sig: 's1' },
  }),
  makeReport({
    id: 'r2',
    title: 'Flooding at Creek',
    type: 'flooding',
    severity: 'critical',
    status: 'acknowledged',
    location: 'Creek Road',
    district: 'Floyd',
    description: 'Road flooded after heavy rain',
    event: { id: 'evt-r2', kind: 1031, pubkey: 'p2', created_at: 200, tags: [], content: '', sig: 's2' },
  }),
  makeReport({
    id: 'r3',
    title: 'Ditch on Highway',
    type: 'ditch',
    severity: 'low',
    status: 'fixed',
    location: 'Highway 42',
    district: 'Madison',
    description: 'Shoulder erosion creating a ditch',
    event: { id: 'evt-r3', kind: 1031, pubkey: 'p3', created_at: 300, tags: [], content: '', sig: 's3' },
  }),
];

/** Default return for useRoadReports — reports loaded, not loading. */
const loadedState = {
  data: mockReports,
  isLoading: false,
};

/** Render ReportListPage inside a MemoryRouter. */
function renderPage() {
  return render(
    <MemoryRouter>
      <ReportListPage />
    </MemoryRouter>,
  );
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  // Default: reports loaded successfully.
  mockUseRoadReports.mockReturnValue(loadedState);
});

describe('ReportListPage', () => {
  // 1. Loading state shows skeletons (no report cards).
  it('shows loading skeletons when isLoading is true', () => {
    mockUseRoadReports.mockReturnValue({ data: undefined, isLoading: true });

    renderPage();

    // Should NOT render any report cards while loading.
    expect(screen.queryByTestId('report-card')).not.toBeInTheDocument();
    // The page heading is always present.
    expect(screen.getByText('All Reports')).toBeInTheDocument();
  });

  // 2. Empty data array shows "No Reports Found" with the "be the first" message.
  it('shows "No Reports Found" when reports array is empty', () => {
    mockUseRoadReports.mockReturnValue({ data: [], isLoading: false });

    renderPage();

    expect(screen.getByText('No Reports Found')).toBeInTheDocument();
    expect(screen.getByText(/Be the first/)).toBeInTheDocument();
    // No report cards.
    expect(screen.queryByTestId('report-card')).not.toBeInTheDocument();
  });

  // 3. Filters yielding zero results show "Try adjusting your search" message.
  it('shows "Try adjusting your search" when filters yield no results', async () => {
    const user = userEvent.setup();
    renderPage();

    // Type a search term that matches none of the mock reports.
    const searchInput = screen.getByPlaceholderText('Search reports...');
    await user.type(searchInput, 'zzzzzzz');

    expect(screen.getByText('Try adjusting your search or filters.')).toBeInTheDocument();
    expect(screen.queryByTestId('report-card')).not.toBeInTheDocument();
  });

  // 4. Renders a ReportCard for each report.
  it('renders a report card for each report', () => {
    renderPage();

    const cards = screen.getAllByTestId('report-card');
    expect(cards).toHaveLength(mockReports.length);
    // Verify each report title is present.
    expect(screen.getByText('Pothole on Elm')).toBeInTheDocument();
    expect(screen.getByText('Flooding at Creek')).toBeInTheDocument();
    expect(screen.getByText('Ditch on Highway')).toBeInTheDocument();
  });

  // 5. Search filter matches title, description, location, and district.
  it('filters reports by search text across title/description/location/district', async () => {
    const user = userEvent.setup();
    renderPage();

    const searchInput = screen.getByPlaceholderText('Search reports...');

    // Filter by title
    await user.type(searchInput, 'Pothole on Elm');
    expect(screen.getAllByTestId('report-card')).toHaveLength(1);
    expect(screen.getByText('Pothole on Elm')).toBeInTheDocument();

    // Clear and search by description content
    await user.clear(searchInput);
    await user.type(searchInput, 'flooded after');
    expect(screen.getAllByTestId('report-card')).toHaveLength(1);
    expect(screen.getByText('Flooding at Creek')).toBeInTheDocument();

    // Clear and search by location
    await user.clear(searchInput);
    await user.type(searchInput, 'Highway 42');
    expect(screen.getAllByTestId('report-card')).toHaveLength(1);
    expect(screen.getByText('Ditch on Highway')).toBeInTheDocument();

    // Clear and search by district
    await user.clear(searchInput);
    await user.type(searchInput, 'Floyd');
    expect(screen.getAllByTestId('report-card')).toHaveLength(1);
    expect(screen.getByText('Flooding at Creek')).toBeInTheDocument();
  });

  // 6. Search filter is case-insensitive.
  it('search filter is case-insensitive', async () => {
    const user = userEvent.setup();
    renderPage();

    const searchInput = screen.getByPlaceholderText('Search reports...');

    await user.type(searchInput, 'flooding at creek');
    let cards = screen.getAllByTestId('report-card');
    expect(cards).toHaveLength(1);

    await user.clear(searchInput);
    await user.type(searchInput, 'FLOODING AT CREEK');
    cards = screen.getAllByTestId('report-card');
    expect(cards).toHaveLength(1);
  });

  // 7. Stats bar shows correct counts from the raw (unfiltered) data.
  it('displays correct total/open/critical stats', () => {
    renderPage();

    // mockReports: total=3, open=1 (r1), critical=1 (r2)
    expect(screen.getByText('All Reports')).toBeInTheDocument();
    // Stats are rendered in the header bar. We check the parent containers
    // by looking for the stat numbers next to their labels.
    const totalLabel = screen.getByText('Total:');
    expect(totalLabel.parentElement).toBeInTheDocument();
    // The bold number after "Total: " — we check the text of the container.
    expect(totalLabel.parentElement!.textContent).toContain('3');

    const openLabel = screen.getByText('Open:');
    expect(openLabel.parentElement!.textContent).toContain('1');

    const criticalLabel = screen.getByText('Critical:');
    expect(criticalLabel.parentElement!.textContent).toContain('1');
  });

  // 8. Partial search term matches.
  it('partial search term matches reports', async () => {
    const user = userEvent.setup();
    renderPage();

    const searchInput = screen.getByPlaceholderText('Search reports...');
    // "poth" matches "Pothole on Elm" (title) only
    await user.type(searchInput, 'poth');
    const cards = screen.getAllByTestId('report-card');
    expect(cards).toHaveLength(1);
    expect(screen.getByText('Pothole on Elm')).toBeInTheDocument();
  });
});
