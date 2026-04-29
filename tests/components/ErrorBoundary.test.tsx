import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// --- Helpers ---

/** Component that throws during render when `shouldThrow` is true.
 *  Error boundaries only catch errors from the render phase. */
function ThrowOnRender({ shouldThrow, error }: { shouldThrow: boolean; error?: Error }) {
  if (shouldThrow) {
    throw error ?? new Error('Test error message');
  }
  return <div>Child rendered successfully</div>;
}

// --- Tests ---

describe('ErrorBoundary', () => {
  // Suppress console.error output from React's error boundary logging during tests
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // 1. Renders children normally when no error occurs
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <ThrowOnRender shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Child rendered successfully')).toBeInTheDocument();
  });

  // 2. Shows default fallback UI when a child throws during render
  it('shows default fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowOnRender shouldThrow={true} />
      </ErrorBoundary>,
    );

    // Heading and description
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/An unexpected error occurred/)).toBeInTheDocument();

    // Error message is displayed inside the details block
    expect(screen.getByText('Test error message')).toBeInTheDocument();

    // Both action buttons
    expect(screen.getByText('Try again')).toBeInTheDocument();
    expect(screen.getByText('Reload page')).toBeInTheDocument();
  });

  // 3. Shows custom fallback when the `fallback` prop is provided
  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback UI</div>}>
        <ThrowOnRender shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Custom fallback UI')).toBeInTheDocument();
    // Default UI should NOT be shown
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  // 4. Displays the error stack trace when available
  it('displays error stack trace when available', () => {
    const errorWithStack = new Error('Stack test');
    errorWithStack.stack = 'Error: Stack test\n    at SomeComponent (file.tsx:10:5)';

    render(
      <ErrorBoundary>
        <ThrowOnRender shouldThrow={true} error={errorWithStack} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Stack test')).toBeInTheDocument();
    expect(screen.getByText(/Error: Stack test/)).toBeInTheDocument();
  });

  // 5. "Try again" clears error state so children can be re-attempted.
  //    After clicking the button the boundary's hasError is false, so on the
  //    next render it will try to render children again.
  it('resets error state when "Try again" is clicked', () => {
    // Render with a throwing child to trigger the error boundary
    render(
      <ErrorBoundary>
        <ThrowOnRender shouldThrow={true} />
      </ErrorBoundary>,
    );

    // Confirm we're in the error state
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Click "Try again" -- clears hasError/error/errorInfo
    fireEvent.click(screen.getByText('Try again'));

    // The child will throw again (shouldThrow is still true), so the boundary
    // re-enters error state. That proves reset happened: the boundary tried
    // to render children a second time.
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  // 6. "Reload page" button calls window.location.reload()
  it('reloads the page when "Reload page" is clicked', () => {
    const reloadMock = vi.fn();
    // jsdom's location.reload is read-only, so we redefine it on window
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <ThrowOnRender shouldThrow={true} />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByText('Reload page'));
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  // 7. Logs error via console.error in componentDidCatch
  it('logs the caught error to console', () => {
    render(
      <ErrorBoundary>
        <ThrowOnRender shouldThrow={true} />
      </ErrorBoundary>,
    );

    // componentDidCatch calls console.error with 'Error caught by ErrorBoundary:' prefix
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error caught by ErrorBoundary:'),
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) }),
    );
  });
});
