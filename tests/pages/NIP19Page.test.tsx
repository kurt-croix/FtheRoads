import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NIP19Page } from '@/pages/NIP19Page';

// Mock nostr-tools nip19.decode
vi.mock('nostr-tools', () => ({
  nip19: {
    decode: vi.fn(),
  },
}));

// Mock NotFound to make it identifiable in assertions
vi.mock('@/pages/NotFound', () => ({
  default: () => <div data-testid="not-found">Not Found</div>,
}));

// Mock useParams so we can control the :nip19 param per test
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: vi.fn() };
});

// Import the mocked functions after vi.mock setup
import { useParams } from 'react-router-dom';
import { nip19 } from 'nostr-tools';

const mockUseParams = vi.mocked(useParams);
const mockDecode = vi.mocked(nip19.decode);

describe('NIP19Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. No identifier in URL params -> NotFound
  it('shows NotFound when no identifier in params', () => {
    mockUseParams.mockReturnValue({});
    render(<NIP19Page />);
    expect(screen.getByTestId('not-found')).toBeInTheDocument();
  });

  // 2. Decode throws -> NotFound
  it('shows NotFound when decode throws', () => {
    mockUseParams.mockReturnValue({ nip19: 'badvalue' });
    mockDecode.mockImplementation(() => {
      throw new Error('Invalid bech32');
    });
    render(<NIP19Page />);
    expect(screen.getByTestId('not-found')).toBeInTheDocument();
  });

  // 3. npub type -> Profile placeholder
  it('shows Profile placeholder for npub type', () => {
    mockUseParams.mockReturnValue({ nip19: 'npub1test' });
    mockDecode.mockReturnValue({
      type: 'npub',
      data: 'abc123',
    } as ReturnType<typeof nip19.decode>);
    render(<NIP19Page />);
    expect(screen.getByText('Profile placeholder')).toBeInTheDocument();
  });

  // 4. nprofile type -> Profile placeholder
  it('shows Profile placeholder for nprofile type', () => {
    mockUseParams.mockReturnValue({ nip19: 'nprofile1test' });
    mockDecode.mockReturnValue({
      type: 'nprofile',
      data: { pubkey: 'abc123', relays: [] },
    } as ReturnType<typeof nip19.decode>);
    render(<NIP19Page />);
    expect(screen.getByText('Profile placeholder')).toBeInTheDocument();
  });

  // 5. note type -> Note placeholder
  it('shows Note placeholder for note type', () => {
    mockUseParams.mockReturnValue({ nip19: 'note1test' });
    mockDecode.mockReturnValue({
      type: 'note',
      data: 'eventhex123',
    } as ReturnType<typeof nip19.decode>);
    render(<NIP19Page />);
    expect(screen.getByText('Note placeholder')).toBeInTheDocument();
  });

  // 6. nevent type -> Event placeholder
  it('shows Event placeholder for nevent type', () => {
    mockUseParams.mockReturnValue({ nip19: 'nevent1test' });
    mockDecode.mockReturnValue({
      type: 'nevent',
      data: { id: 'eventhex123', relays: [] },
    } as ReturnType<typeof nip19.decode>);
    render(<NIP19Page />);
    expect(screen.getByText('Event placeholder')).toBeInTheDocument();
  });

  // 7. naddr type -> Addressable event placeholder
  it('shows Addressable event placeholder for naddr type', () => {
    mockUseParams.mockReturnValue({ nip19: 'naddr1test' });
    mockDecode.mockReturnValue({
      type: 'naddr',
      data: { identifier: 'my-event', pubkey: 'abc123', kind: 30023, relays: [] },
    } as ReturnType<typeof nip19.decode>);
    render(<NIP19Page />);
    expect(screen.getByText('Addressable event placeholder')).toBeInTheDocument();
  });

  // 8. Unknown/unsupported type -> NotFound
  it('shows NotFound for unknown type', () => {
    mockUseParams.mockReturnValue({ nip19: 'nsec1test' });
    mockDecode.mockReturnValue({
      type: 'nsec',
      data: 'secretkeyhex',
    } as unknown as ReturnType<typeof nip19.decode>);
    render(<NIP19Page />);
    expect(screen.getByTestId('not-found')).toBeInTheDocument();
  });
});
