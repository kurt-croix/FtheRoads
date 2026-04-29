import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { NoteContent } from '@/components/NoteContent';
import type { NostrEvent } from '@nostrify/nostrify';

// --- Mocks ---

// Fake pubkey and npub for deterministic tests.
const FAKE_PUBKEY_HEX =
  '71cf6a28a82b7e701e5e6c7c4a4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d';
const FAKE_NPUB = 'npub1w88k52r9pt0uuv2cxfl62l5ka2k2k2k2k2k2k2k2k2k2k2k2ksg2m34g';

vi.mock('nostr-tools', () => ({
  nip19: {
    decode: vi.fn((id: string) => {
      // Return a mock decode result based on the prefix
      if (id.startsWith('npub1')) {
        return { type: 'npub', data: FAKE_PUBKEY_HEX };
      }
      if (id.startsWith('nprofile1')) {
        return { type: 'nprofile', data: { pubkey: FAKE_PUBKEY_HEX } };
      }
      if (id.startsWith('note1')) {
        return { type: 'note', data: 'fake-event-id' };
      }
      if (id.startsWith('nevent1')) {
        return { type: 'nevent', data: { id: 'fake-event-id' } };
      }
      throw new Error('Unknown nip19 type');
    }),
    npubEncode: vi.fn((_pubkey: string) => FAKE_NPUB),
  },
}));

const mockUseAuthor = vi.fn();
vi.mock('@/hooks/useAuthor', () => ({
  useAuthor: (...args: unknown[]) => mockUseAuthor(...args),
}));

vi.mock('@/lib/genUserName', () => ({
  genUserName: vi.fn((_seed: string) => 'GeneratedName'),
}));

// --- Helpers ---

/** Build a minimal NostrEvent with the given content. */
const makeEvent = (content: string, overrides: Partial<NostrEvent> = {}): NostrEvent => ({
  id: 'test-id',
  kind: 1,
  pubkey: 'test-pubkey',
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  content,
  sig: 'test-sig',
  ...overrides,
});

/** Render NoteContent inside a MemoryRouter so <Link> works. */
function renderNoteContent(content: string, className?: string) {
  const event = makeEvent(content);
  return render(
    <MemoryRouter>
      <NoteContent event={event} className={className} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: author hook returns no data (loading state).
  mockUseAuthor.mockReturnValue({ data: undefined });
});

// --- Tests ---

describe('NoteContent', () => {
  // 1. Renders plain text content as-is
  it('renders plain text content', () => {
    renderNoteContent('Hello, world!');
    expect(screen.getByText('Hello, world!')).toBeInTheDocument();
  });

  // 2. Handles empty content
  it('handles empty content', () => {
    renderNoteContent('');
    // The wrapper div should still render, but with no visible text nodes
    const container = document.querySelector('.whitespace-pre-wrap');
    expect(container).toBeInTheDocument();
    expect(container?.textContent).toBe('');
  });

  // 3. Renders multiple lines with whitespace preserved
  it('preserves whitespace via whitespace-pre-wrap class', () => {
    renderNoteContent('line one\nline two');
    const container = document.querySelector('.whitespace-pre-wrap');
    expect(container).toBeInTheDocument();
    // The text content should include both lines
    expect(container).toHaveTextContent('line one');
    expect(container).toHaveTextContent('line two');
  });

  // 4. Applies custom className
  it('applies custom className to wrapper', () => {
    renderNoteContent('text', 'my-custom-class');
    const container = document.querySelector('.whitespace-pre-wrap.my-custom-class');
    expect(container).toBeInTheDocument();
  });

  // 5. Linkifies URLs
  it('linkifies URLs', () => {
    renderNoteContent('Check out https://example.com for details');
    const link = screen.getByRole('link', { name: 'https://example.com' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  // 6. Renders surrounding text alongside a URL
  it('renders text before and after a URL', () => {
    renderNoteContent('before https://example.com after');
    // Text fragments are split across elements, so use getByText with exact: false
    expect(screen.getByText('before', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('after', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://example.com' })).toBeInTheDocument();
  });

  // 7. Linkifies hashtags
  it('linkifies hashtags', () => {
    renderNoteContent('check out #nostr and #bitcoin');
    const nostrLink = screen.getByRole('link', { name: '#nostr' });
    expect(nostrLink).toBeInTheDocument();
    expect(nostrLink).toHaveAttribute('href', '/t/nostr');

    const btcLink = screen.getByRole('link', { name: '#bitcoin' });
    expect(btcLink).toBeInTheDocument();
    expect(btcLink).toHaveAttribute('href', '/t/bitcoin');
  });

  // 8. Renders npub mentions via NostrMention component
  it('renders npub mentions with user display name', () => {
    // Simulate author data being loaded with a real name
    mockUseAuthor.mockReturnValue({
      data: { metadata: { name: 'Alice' } },
    });

    // Use a real-looking npub bech32 string (just needs the prefix for our mock)
    const npubBech32 = 'npub1w88k52r9pt0uuv2cxfl62l5ka2k2k2k2k2k2k2k2k2k2k2k2ksg2m34g';
    renderNoteContent(`hello nostr:${npubBech32} world`);

    // NostrMention should show @Alice and link to the npub profile
    const mentionLink = screen.getByRole('link', { name: '@Alice' });
    expect(mentionLink).toBeInTheDocument();
    expect(mentionLink).toHaveAttribute('href', `/${FAKE_NPUB}`);
  });

  // 9. Falls back to generated name when author has no real name
  it('renders npub mentions with generated name when no real name', () => {
    // Author loaded but no name in metadata
    mockUseAuthor.mockReturnValue({
      data: { metadata: {} },
    });

    const npubBech32 = 'npub1w88k52r9pt0uuv2cxfl62l5ka2k2k2k2k2k2k2k2k2k2k2k2ksg2m34g';
    renderNoteContent(`hello nostr:${npubBech32} world`);

    // Should use genUserName fallback
    const mentionLink = screen.getByRole('link', { name: '@GeneratedName' });
    expect(mentionLink).toBeInTheDocument();
  });

  // 10. Renders nprofile mentions (same as npub via NostrMention)
  it('renders nprofile mentions', () => {
    mockUseAuthor.mockReturnValue({
      data: { metadata: { name: 'Bob' } },
    });

    const nprofile = 'nprofile1qqwkjgn92dkk4m0x5s7x23m04p4yg0m0z2x0e0e0e0e0e0e0e0e0e0e0e0e0';
    renderNoteContent(`hello nostr:${nprofile} world`);

    const mentionLink = screen.getByRole('link', { name: '@Bob' });
    expect(mentionLink).toBeInTheDocument();
  });

  // 11. Renders note1 references as internal links
  it('renders note references as internal links', () => {
    const note = 'note1qqwkjgn92dkk4m0x5s7x23m04p4yg0m0z2x0e0e0e0e0e0e0e0e0e0e0e0e0';
    renderNoteContent(`see nostr:${note}`);

    // For note type (not npub/nprofile), it falls through to the generic Link
    const link = screen.getByRole('link', { name: `nostr:${note}` });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', `/${note}`);
  });

  // 12. Renders nevent references as internal links
  it('renders nevent references as internal links', () => {
    const nevent = 'nevent1qqwkjgn92dkk4m0x5s7x23m04p4yg0m0z2x0e0e0e0e0e0e0e0e0e0e0e0e0';
    renderNoteContent(`see nostr:${nevent}`);

    const link = screen.getByRole('link', { name: `nostr:${nevent}` });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', `/${nevent}`);
  });

  // 13. Gracefully handles nip19 decode failures (renders as plain text)
  it('renders nostr reference as text when decode fails', () => {
    vi.mocked(nip19.decode).mockImplementationOnce(() => {
      throw new Error('decode failed');
    });

    const badNpub = 'npub1baddata';
    renderNoteContent(`hello nostr:${badNpub} world`);

    // Should render as plain text, not a link
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  // 14. Handles mixed content (URLs, hashtags, and plain text)
  it('handles mixed content with URLs, hashtags, and text', () => {
    renderNoteContent('Check #nostr at https://example.com please!');

    const hashtagLink = screen.getByRole('link', { name: '#nostr' });
    expect(hashtagLink).toHaveAttribute('href', '/t/nostr');

    const urlLink = screen.getByRole('link', { name: 'https://example.com' });
    expect(urlLink).toHaveAttribute('href', 'https://example.com');

    // Text fragments are split across elements, so use exact: false
    expect(screen.getByText('Check', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(' at ', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('please', { exact: false })).toBeInTheDocument();
  });

  // 15. Renders multiple URLs in the same content
  it('renders multiple URLs', () => {
    renderNoteContent('Visit https://a.com and https://b.com');
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', 'https://a.com');
    expect(links[1]).toHaveAttribute('href', 'https://b.com');
  });
});
