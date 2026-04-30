import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock useSeoMeta so we can assert it was called with the right args
vi.mock('@unhead/react', () => ({
  useSeoMeta: vi.fn(),
}));

import NotFound from '@/pages/NotFound';
import { useSeoMeta } from '@unhead/react';

// Helper to render the component inside a MemoryRouter
const renderNotFound = (initialPath = '/some/nonexistent/path') => {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <NotFound />
    </MemoryRouter>,
  );
};

describe('NotFound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the 404 heading', () => {
    renderNotFound();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('404');
  });

  it('renders the "Oops! Page not found" text', () => {
    renderNotFound();
    expect(screen.getByText('Oops! Page not found')).toBeInTheDocument();
  });

  it('renders a link to the home page', () => {
    renderNotFound();
    const link = screen.getByRole('link', { name: /return to home/i });
    expect(link).toHaveAttribute('href', '/');
  });

  it('calls useSeoMeta with the correct title and description', () => {
    renderNotFound();
    expect(useSeoMeta).toHaveBeenCalledWith({
      title: '404 - Page Not Found',
      description: 'The page you are looking for could not be found. Return to the home page to continue browsing.',
    });
  });

  it('logs a 404 error with the current pathname to console.error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const testPath = '/some/nonexistent/path';

    renderNotFound(testPath);

    expect(consoleSpy).toHaveBeenCalledWith(
      '404 Error: User attempted to access non-existent route:',
      testPath,
    );

    consoleSpy.mockRestore();
  });
});
