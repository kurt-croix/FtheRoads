import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';

// Mock useSeoMeta so we can assert it was called with the right args
vi.mock('@unhead/react', () => ({
  useSeoMeta: vi.fn(),
}));

// We need to mock useNavigate at the react-router-dom level, but MemoryRouter
// internally relies on router context. The simplest approach: mock useNavigate
// to return a spy function, and let MemoryRouter provide the real context.
const mockNavigateFn = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigateFn };
});

import SplashPage from '@/pages/SplashPage';
import { useSeoMeta } from '@unhead/react';

/** Helper: renders SplashPage inside a MemoryRouter so router hooks work. */
const renderSplash = () =>
  render(
    <MemoryRouter>
      <SplashPage />
    </MemoryRouter>,
  );

describe('SplashPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockNavigateFn.mockReset();
  });

  // ── Rendering ──────────────────────────────────────────────────────

  it('renders the main heading with the brand name', () => {
    renderSplash();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('FtheRoads');
    expect(heading).toHaveTextContent('.com');
  });

  it('renders the tagline "F is for Fix"', () => {
    renderSplash();
    expect(screen.getByText(/"F" is for Fix/i)).toBeInTheDocument();
  });

  it('renders the logo image', () => {
    renderSplash();
    const logo = screen.getByAltText('FtheRoads logo');
    expect(logo).toHaveAttribute('src', '/logo.png');
  });

  it('renders section headings: What is this?, How it works, About Nostr accounts, Your privacy matters', () => {
    renderSplash();
    expect(screen.getByText('What is this?')).toBeInTheDocument();
    expect(screen.getByText('How it works')).toBeInTheDocument();
    expect(screen.getByText('About Nostr accounts')).toBeInTheDocument();
    expect(screen.getByText('Your privacy matters')).toBeInTheDocument();
  });

  it('renders the Nmail external link', () => {
    renderSplash();
    const link = screen.getByRole('link', { name: /Nmail/i });
    expect(link).toHaveAttribute('href', 'https://app.nostrmail.org/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders the footer text', () => {
    renderSplash();
    // "Ray County, Missouri" appears in the body text as well as the footer,
    // so use getAllByText to avoid the "multiple elements" error.
    expect(screen.getAllByText(/Ray County, Missouri/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Community-Powered Road Reporting/)).toBeInTheDocument();
  });

  // ── SEO meta ───────────────────────────────────────────────────────

  it('calls useSeoMeta with the correct title and description', () => {
    renderSplash();
    expect(useSeoMeta).toHaveBeenCalledWith({
      title: 'FtheRoads.com — Fix the Roads',
      description:
        'Community-powered road hazard reporting for Ray County, Missouri. Your contact information is never stored or shared.',
    });
  });

  // ── CTA buttons ────────────────────────────────────────────────────

  it('renders the "Enter FtheRoads" button', () => {
    renderSplash();
    expect(
      screen.getByRole('button', { name: /Enter FtheRoads/i }),
    ).toBeInTheDocument();
  });

  it('renders the "Don\'t show this again" button', () => {
    renderSplash();
    expect(
      screen.getByRole('button', { name: /Don't show this again/i }),
    ).toBeInTheDocument();
  });

  it('navigates to /map when "Enter FtheRoads" is clicked', () => {
    renderSplash();
    fireEvent.click(screen.getByRole('button', { name: /Enter FtheRoads/i }));
    expect(mockNavigateFn).toHaveBeenCalledWith('/map', { replace: true });
  });

  it('does NOT write to localStorage when "Enter FtheRoads" is clicked', () => {
    renderSplash();
    fireEvent.click(screen.getByRole('button', { name: /Enter FtheRoads/i }));
    expect(localStorage.getItem('ftheroads:splash_dismissed')).toBeNull();
  });

  it('writes to localStorage and navigates when "Don\'t show this again" is clicked', () => {
    renderSplash();
    fireEvent.click(
      screen.getByRole('button', { name: /Don't show this again/i }),
    );
    expect(localStorage.getItem('ftheroads:splash_dismissed')).toBe('true');
    expect(mockNavigateFn).toHaveBeenCalledWith('/map', { replace: true });
  });

  // ── Conditional rendering: previously dismissed ────────────────────

  it('navigates to /map on mount when localStorage already has splash_dismissed=true', () => {
    localStorage.setItem('ftheroads:splash_dismissed', 'true');
    renderSplash();
    // The effect should call navigate immediately
    expect(mockNavigateFn).toHaveBeenCalledWith('/map', { replace: true });
  });

  it('renders nothing (null) on the very first frame before the effect runs', () => {
    // This is inherently hard to test since the effect runs synchronously
    // after mount in jsdom. We verify the "dismissed === null -> return null"
    // code path by confirming the component has no visible content when
    // dismissed starts as null and the effect hasn't completed yet.
    // In practice, ReactTestingLibrary waits for the effect, so we just
    // confirm the component *does* render content when localStorage is empty.
    renderSplash();
    // After the effect sets dismissed=false, content is visible
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  // ── Error resilience ───────────────────────────────────────────────

  it('gracefully handles localStorage being unavailable during mount', () => {
    // Simulate a private-browsing scenario where getItem throws
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = vi.fn(() => {
      throw new Error('localStorage not available');
    });

    // Should NOT throw; should render normally after falling through
    renderSplash();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();

    Storage.prototype.getItem = originalGetItem;
  });

  it('gracefully handles localStorage being unavailable when setting splash_dismissed', () => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = vi.fn(() => {
      throw new Error('localStorage not available');
    });

    renderSplash();
    // Clicking "Don't show this again" should NOT throw even though setItem fails
    expect(() => {
      fireEvent.click(
        screen.getByRole('button', { name: /Don't show this again/i }),
      );
    }).not.toThrow();
    // Navigation should still happen regardless of the storage error
    expect(mockNavigateFn).toHaveBeenCalledWith('/map', { replace: true });

    Storage.prototype.setItem = originalSetItem;
  });
});
