import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReportCard } from '@/components/ReportCard';
import type { RoadReport } from '@/hooks/useRoadReports';

// Fix ResizeObserver mock for floating-ui (used by Radix dropdown).
// The global mock in setup.ts uses vi.fn() which breaks floating-ui's autoUpdate
// because it needs a proper class constructor. Override with a real class.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// --- Mocks ---

vi.mock('nostr-tools', () => ({
  nip19: {
    npubEncode: vi.fn((pubkey: string) => `npub1${pubkey}`),
    neventEncode: vi.fn(() => 'nevent1mockencoded'),
  },
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const mockUseCurrentUser = vi.fn();
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}));

vi.mock('date-fns', () => ({
  formatDistanceToNow: vi.fn(() => 'about 1 hour ago'),
}));

// --- Helpers ---

/** Build a fully-populated RoadReport. Spread `overrides` last so callers
 *  can replace any field (or nest a different `event`). */
const makeReport = (overrides: Partial<RoadReport> = {}): RoadReport => ({
  event: {
    id: 'test-event-id',
    kind: 1031,
    pubkey: 'test-pubkey',
    created_at: Math.floor(Date.now() / 1000) - 3600,
    tags: [
      ['d', 'test-d'],
      ['g', '9zn'],
      ['type', 'pothole'],
      ['severity', 'high'],
      ['alt', 'Road hazard report'],
    ],
    content: 'Test report description',
    sig: 'test-sig',
  },
  id: 'test-event-id',
  title: 'Test Report',
  type: 'pothole',
  severity: 'high',
  geohash: '9zn',
  location: 'Test Location',
  description: 'Test report description',
  images: [],
  district: 'Richmond',
  status: 'open',
  lat: 39.28,
  lng: -93.98,
  createdAt: Math.floor(Date.now() / 1000) - 3600,
  ...overrides,
});

/** Default user-return for "not logged in / non-owner" scenarios. */
const noUser = { user: undefined, users: [], data: undefined };

/** User whose pubkey matches the default report -- i.e. the owner. */
const ownerUser = { user: { pubkey: 'test-pubkey' }, users: [], data: undefined };

/** User with a different pubkey -- non-owner. */
const otherUser = { user: { pubkey: 'different-pubkey' }, users: [], data: undefined };

/** Render ReportCard inside a MemoryRouter so react-router context is available. */
function renderCard(
  overrides: Partial<RoadReport> = {},
  props: { compact?: boolean; onClick?: () => void; onEdit?: () => void; onDelete?: () => void } = {},
) {
  const report = makeReport(overrides);
  return render(
    <MemoryRouter>
      <ReportCard report={report} {...props} />
    </MemoryRouter>,
  );
}

/** Open the Radix dropdown menu. Radix uses pointer events internally, so
 *  we must use userEvent (not fireEvent.click) to trigger it in jsdom. */
async function openDropdown() {
  const user = userEvent.setup();
  const trigger = document.querySelector('[aria-haspopup="menu"]') as HTMLElement;
  if (!trigger) throw new Error('Dropdown trigger not found');
  await user.click(trigger);
}

// --- Tests ---

beforeEach(() => {
  // Default to "not logged in" for every test; individual tests override as needed.
  mockUseCurrentUser.mockReturnValue(noUser);
});

describe('ReportCard', () => {
  // 1. Renders report title
  it('renders report title', () => {
    renderCard({ title: 'Big Pothole on Main' });
    expect(screen.getByText('Big Pothole on Main')).toBeInTheDocument();
  });

  // 2. Renders status badge
  it('renders status badge', () => {
    renderCard({ status: 'open' });
    expect(screen.getByText('open')).toBeInTheDocument();
  });

  // 3. Renders type badge
  it('renders type badge', () => {
    renderCard({ type: 'pothole' });
    // HAZARD_TYPES maps 'pothole' -> label 'Pothole'
    expect(screen.getByText('Pothole')).toBeInTheDocument();
  });

  // 4. Compact layout hides location/time/description
  it('shows compact layout when compact=true', () => {
    renderCard({}, { compact: true });
    expect(screen.queryByText('Test Location')).not.toBeInTheDocument();
    expect(screen.queryByText('about 1 hour ago')).not.toBeInTheDocument();
    expect(screen.queryByText('Test report description')).not.toBeInTheDocument();
  });

  // 5. Full layout shows location, time, and description
  it('shows full layout when compact=false', () => {
    renderCard();
    expect(screen.getByText('about 1 hour ago')).toBeInTheDocument();
    expect(screen.getByText('Test report description')).toBeInTheDocument();
    // Coordinates rendered via toFixed(4)
    expect(screen.getByText(/39\.2800/)).toBeInTheDocument();
  });

  // 6. Image button shown when report has images
  it('shows image button when report has images', () => {
    renderCard({ images: ['https://example.com/img.jpg'] });
    // The image count (1) is rendered next to the image icon
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  // 7. No image button when images array is empty
  it('does not show image button when no images', () => {
    renderCard({ images: [] });
    // No image count element should be present
    expect(screen.queryAllByRole('button', { name: /image/i })).toHaveLength(0);
  });

  // 8. onClick fires when title is clicked
  it('calls onClick when title clicked', () => {
    const onClick = vi.fn();
    renderCard({}, { onClick });
    fireEvent.click(screen.getByText('Test Report'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // 9. "No location" when lat/location/district are all absent
  it('shows "No location" when no lat/location/district', () => {
    renderCard({ lat: undefined, lng: undefined, location: '', district: '' });
    expect(screen.getByText('No location')).toBeInTheDocument();
  });

  // 10. Edit/delete options visible for owner
  it('shows edit/delete options for owner', async () => {
    mockUseCurrentUser.mockReturnValue(ownerUser);
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    renderCard({}, { onEdit, onDelete });

    await openDropdown();

    expect(await screen.findByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  // 11. Edit/delete hidden for non-owner
  it('does not show edit/delete for non-owner', async () => {
    mockUseCurrentUser.mockReturnValue(otherUser);
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    renderCard({}, { onEdit, onDelete });

    await openDropdown();

    // Wait for the dropdown to render a known item ("Raw Event"),
    // then assert Edit and Delete are absent.
    expect(await screen.findByText('Raw Event')).toBeInTheDocument();
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });
});
