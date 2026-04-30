import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { RoadReport } from '@/hooks/useRoadReports';

// --- Mocks ---

const mockUseRoadReports = vi.fn();
vi.mock('@/hooks/useRoadReports', () => ({
  useRoadReports: (...args: unknown[]) => mockUseRoadReports(...args),
}));

vi.mock('@/components/ReportCard', () => ({
  ReportCard: ({ report }: { report: RoadReport }) => (
    <div data-testid="report-card">{report.title}</div>
  ),
}));

vi.mock('@/components/ReportForm', () => ({
  ReportForm: () => <div data-testid="report-form">Report Form</div>,
}));

vi.mock('@/components/ReportMap', () => ({
  ReportMap: () => <div data-testid="report-map">Map</div>,
}));

vi.mock('@/components/auth/LoginArea', () => ({
  LoginArea: () => <div data-testid="login-area">Login</div>,
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

// Mock UI primitives so they render real buttons/divs for querying
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button data-testid="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: any) => (
    <div data-testid="card" {...props}>
      {children}
    </div>
  ),
  CardContent: ({ children, ...props }: any) => (
    <div data-testid="card-content" {...props}>
      {children}
    </div>
  ),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: vi.fn(() => vi.fn()) };
});

vi.mock('@unhead/react', () => ({
  useSeoMeta: vi.fn(),
}));

vi.mock('lucide-react', () => {
  const icons = [
    'AlertCircle',
    'AlertTriangle',
    'List',
    'MapPin',
    'Menu',
    'X',
    'ChevronRight',
    'Plus',
  ];
  const mod: Record<string, React.FC> = {};
  icons.forEach((name) => {
    mod[name] = () => <span>{name}</span>;
  });
  return mod;
});

vi.mock('@/hooks/useIsMobile', () => ({
  useIsMobile: () => false, // Default to desktop in tests
}));

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open, onOpenChange }: any) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <div>{children}</div>,
}));

// Import component under test AFTER all mocks are set up
import Index from '@/pages/Index';

// --- Helpers ---

/** Build a RoadReport with sensible defaults. */
const makeReport = (overrides: Partial<RoadReport> = {}): RoadReport => ({
  event: {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    kind: 1031,
    pubkey: 'abc123def456',
    created_at: Math.floor(Date.now() / 1000) - 3600,
    tags: [
      ['d', 'd-1'],
      ['g', '9zn'],
      ['type', 'pothole'],
      ['severity', 'medium'],
      ['alt', 'Road hazard report'],
    ],
    content: 'A road hazard',
    sig: 'sig-1',
  },
  id: `report-${Math.random().toString(36).slice(2, 8)}`,
  title: 'Test Report',
  type: 'other',
  severity: 'medium',
  geohash: '9zn',
  location: 'Test Location',
  description: 'A road hazard',
  images: [],
  district: 'Richmond',
  status: 'open',
  createdAt: Math.floor(Date.now() / 1000) - 3600,
  ...overrides,
});

/** Create a set of mock reports with varied properties for stats testing. */
const mockReports: RoadReport[] = Array.from({ length: 5 }, (_, i) =>
  makeReport({
    id: `report-${i}`,
    title: `Report ${i}`,
    type: i === 0 ? 'pothole' : 'other',
    severity: i === 1 ? 'critical' : 'medium',
    status: i === 2 ? 'fixed' : 'open',
  }),
);

/** Render Index inside a MemoryRouter. */
function renderIndex() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/*" element={<Index />} />
      </Routes>
    </MemoryRouter>,
  );
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  // Default: reports loaded successfully
  mockUseRoadReports.mockReturnValue({
    data: mockReports,
    isLoading: false,
  });
});

describe('StatsBar', () => {
  it('shows correct total count', () => {
    renderIndex();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('shows correct open count', () => {
    // Reports 0,1,3,4 are open (report 2 is fixed)
    renderIndex();
    expect(screen.getByText('Open')).toBeInTheDocument();
    // All stat values are rendered as: <div class="text-xl font-bold ...">{value}</div>
    // Get the container holding the "Open" label, then find the value sibling
    const openLabel = screen.getByText('Open');
    // Walk up to the stat cell, then find the bold value within it
    const statCell = openLabel.parentElement!;
    expect(statCell.querySelector('.font-bold')?.textContent).toBe('4');
  });

  it('shows correct critical count', () => {
    // Only report 1 is critical
    renderIndex();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    const criticalLabel = screen.getByText('Critical');
    const statCell = criticalLabel.parentElement!;
    expect(statCell.querySelector('.font-bold')?.textContent).toBe('1');
  });

  it('shows correct pothole count', () => {
    // Only report 0 is a pothole
    renderIndex();
    expect(screen.getByText('Potholes')).toBeInTheDocument();
    const potholesLabel = screen.getByText('Potholes');
    const statCell = potholesLabel.parentElement!;
    expect(statCell.querySelector('.font-bold')?.textContent).toBe('1');
  });
});

describe('IndexContent', () => {
  it('renders "FtheRoads" heading', () => {
    renderIndex();
    // The h1 contains "F" + <span>the</span> + "Roads" — use getByRole to find the h1
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toContain('F');
    expect(heading.textContent).toContain('Roads');
  });

  it('renders report map', () => {
    renderIndex();
    expect(screen.getByTestId('report-map')).toBeInTheDocument();
  });

  it('renders report form in sidebar', () => {
    renderIndex();
    expect(screen.getByTestId('report-form')).toBeInTheDocument();
  });

  it('shows loading skeletons when reports are loading', () => {
    mockUseRoadReports.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    renderIndex();

    // Multiple skeletons rendered for loading state
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows "No reports yet" when reports empty', () => {
    mockUseRoadReports.mockReturnValue({
      data: [],
      isLoading: false,
    });

    renderIndex();

    expect(screen.getByText('No reports yet')).toBeInTheDocument();
  });

  it('shows recent report cards when reports loaded', () => {
    renderIndex();

    const cards = screen.getAllByTestId('report-card');
    // Index shows up to 8 recent reports; we have 5
    expect(cards).toHaveLength(5);
    expect(cards[0]).toHaveTextContent('Report 0');
    expect(cards[4]).toHaveTextContent('Report 4');
  });
});
