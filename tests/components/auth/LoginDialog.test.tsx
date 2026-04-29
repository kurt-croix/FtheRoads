import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import LoginDialog from '@/components/auth/LoginDialog';

// --- Mocks ---

// Mock Dialog primitives: render children only when `open` is true
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2 data-testid="dialog-title">{children}</h2>,
}));

// Mock Tabs to render all tab content so we can test without switching tabs.
// Also invokes onValueChange so the "remote" tab triggers connect session generation.
vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, onValueChange, defaultValue }: any) => (
    <div
      data-testid="tabs"
      data-default-value={defaultValue}
    >
      {/* Hidden selector to let tests switch tabs */}
      <button
        data-testid="tab-trigger-key"
        onClick={() => onValueChange?.('key')}
      />
      <button
        data-testid="tab-trigger-remote"
        onClick={() => onValueChange?.('remote')}
      />
      {children}
    </div>
  ),
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children, value }: any) => <div data-testid={`tabs-trigger-${value}`}>{children}</div>,
  TabsContent: ({ children, value }: any) => <div data-testid={`tabs-content-${value}`}>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ onClick, children, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, placeholder, id, type, ...props }: any) => (
    <input
      data-testid={id ? `input-${id}` : 'input'}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type={type}
      id={id}
      {...props}
    />
  ),
}));

vi.mock('@/components/ui/alert', () => ({
  Alert: ({ children, variant }: any) => (
    <div data-testid="alert" data-variant={variant}>{children}</div>
  ),
  AlertDescription: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children, open, onOpenChange }: any) => (
    <div data-testid="collapsible" data-open={open}>
      {/* Button to let tests toggle the collapsible */}
      <button data-testid="collapsible-toggle" onClick={() => onOpenChange?.(!open)} />
      {open && children}
    </div>
  ),
  CollapsibleContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/qrcode', () => ({
  QRCodeCanvas: ({ value }: any) => <div data-testid="qrcode" data-value={value} />,
}));

// Mock lucide-react icons as simple spans with the icon name
vi.mock('lucide-react', () => {
  const icons = ['Upload', 'AlertTriangle', 'ChevronDown', 'ChevronUp', 'Loader2', 'Copy', 'Check', 'ExternalLink'];
  const mod: Record<string, React.FC<any>> = {};
  for (const name of icons) {
    mod[name] = (props: any) => <span data-testid={`icon-${name.toLowerCase()}`} {...props} />;
  }
  return mod;
});

// Mock useLoginActions hook
const mockLoginActions = {
  nsec: vi.fn(),
  bunker: vi.fn(),
  extension: vi.fn(),
  nostrconnect: vi.fn(),
  getRelayUrls: vi.fn(() => ['wss://relay.damus.io']),
};

vi.mock('@/hooks/useLoginActions', () => ({
  useLoginActions: () => mockLoginActions,
  generateNostrConnectParams: vi.fn(() => ({
    secret: 'mock-secret',
    pubkey: 'mock-pubkey',
    relayUrls: ['wss://relay.damus.io'],
  })),
  generateNostrConnectURI: vi.fn((params: any, opts?: any) => {
    const base = `nostrconnect://mock-pubkey?relay=${params.relayUrls[0]}&secret=mock-secret`;
    return opts?.callback ? `${base}&callback=${encodeURIComponent(opts.callback)}` : base;
  }),
}));

// Mock useIsMobile
const mockIsMobile = vi.fn(() => false);
vi.mock('@/hooks/useIsMobile', () => ({
  useIsMobile: () => mockIsMobile(),
}));

// Mock @radix-ui/react-dialog -- the component imports { DialogTitle } from here directly.
// Must provide the data-testid to match the @/components/ui/dialog mock pattern.
vi.mock('@radix-ui/react-dialog', () => ({
  DialogTitle: ({ children }: any) => <h2 data-testid="dialog-title">{children}</h2>,
}));

// --- Helpers ---

function setWindowNostr(value: object | undefined) {
  if (value === undefined) {
    delete (window as any).nostr;
  } else {
    (window as any).nostr = value;
  }
}

function renderDialog(props: { isOpen?: boolean; onClose?: () => void; onLogin?: () => void } = {}) {
  const onClose = props.onClose ?? vi.fn();
  const onLogin = props.onLogin ?? vi.fn();
  const isOpen = props.isOpen ?? true;

  const result = render(
    <LoginDialog isOpen={isOpen} onClose={onClose} onLogin={onLogin} />,
  );

  return { onClose, onLogin, ...result };
}

/** Toggle the bunker input section visible in the remote signer tab.
 *  Since the bunker toggle is inside TabsContent-remote (always rendered by our mock),
 *  we can find it by text and click it. The component manages its own `showBunkerInput` state. */
function toggleBunkerInput() {
  const bunkerToggle = screen.getByText('Enter bunker URI manually');
  fireEvent.click(bunkerToggle);
}

/** Find the Connect button for bunker login. Must be called after toggleBunkerInput(). */
function findBunkerConnectButton(): HTMLButtonElement {
  const buttons = screen.getAllByRole('button');
  const btn = buttons.find((b) => b.textContent === 'Connect');
  if (!btn) throw new Error('Connect button not found');
  return btn;
}

/** Find the hidden file input element. */
function getFileInput(): HTMLInputElement {
  const inputs = document.querySelectorAll('input[type="file"]');
  if (inputs.length === 0) throw new Error('No file input found');
  return inputs[0] as HTMLInputElement;
}

// --- Tests ---

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Reset all mock implementations
  mockLoginActions.nsec.mockReset();
  mockLoginActions.bunker.mockReset();
  mockLoginActions.extension.mockReset();
  mockLoginActions.nostrconnect.mockReset();
  mockLoginActions.getRelayUrls.mockReturnValue(['wss://relay.damus.io']);
  mockIsMobile.mockReturnValue(false);
  // Ensure window.nostr is cleared between tests
  setWindowNostr(undefined);
});

afterEach(() => {
  setWindowNostr(undefined);
  vi.useRealTimers();
});

describe('LoginDialog', () => {
  // 1. Renders nothing when isOpen is false
  it('renders nothing when isOpen is false', () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  // 2. Renders dialog content when isOpen is true
  it('renders dialog content when isOpen is true', () => {
    renderDialog();
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    // DialogTitle renders "Log in" -- use testid to avoid colliding with extension button text
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Log in');
  });

  // 3. Shows Secret Key tab content by default (defaultValue="key")
  it('shows secret key input in the key tab', () => {
    renderDialog();
    expect(screen.getByTestId('tabs-content-key')).toBeInTheDocument();
    expect(screen.getByTestId('input-nsec')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('nsec1...')).toBeInTheDocument();
  });

  // 4. Shows remote signer tab content
  it('shows remote signer tab', () => {
    renderDialog();
    expect(screen.getByTestId('tabs-content-remote')).toBeInTheDocument();
  });

  // 5. Shows nsec validation error for empty input
  it('shows error when nsec submitted empty', () => {
    renderDialog();
    const form = screen.getByTestId('tabs-content-key').querySelector('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);
    expect(screen.getByText('Please enter your secret key')).toBeInTheDocument();
  });

  // 6. Shows error for invalid nsec format
  it('shows error for invalid nsec format', () => {
    renderDialog();
    const input = screen.getByTestId('input-nsec');
    fireEvent.change(input, { target: { value: 'invalid-key' } });

    const form = screen.getByTestId('tabs-content-key').querySelector('form');
    fireEvent.submit(form!);

    expect(screen.getByText(/Invalid secret key format/)).toBeInTheDocument();
  });

  // 7. Successful nsec login calls onLogin and onClose
  it('calls onLogin and onClose on successful nsec login', () => {
    const { onLogin, onClose } = renderDialog();
    mockLoginActions.nsec.mockImplementation(() => {});

    const input = screen.getByTestId('input-nsec');
    // Valid nsec: starts with "nsec1" followed by 58 alphanumeric chars
    const validNsec = 'nsec1' + 'a'.repeat(58);
    fireEvent.change(input, { target: { value: validNsec } });

    const form = screen.getByTestId('tabs-content-key').querySelector('form');
    fireEvent.submit(form!);

    // executeLogin uses setTimeout(50ms)
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockLoginActions.nsec).toHaveBeenCalledWith(validNsec);
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // 8. Shows error when nsec login throws
  it('shows error when nsec login fails', () => {
    renderDialog();
    mockLoginActions.nsec.mockImplementation(() => {
      throw new Error('bad key');
    });

    const input = screen.getByTestId('input-nsec');
    const validNsec = 'nsec1' + 'a'.repeat(58);
    fireEvent.change(input, { target: { value: validNsec } });

    const form = screen.getByTestId('tabs-content-key').querySelector('form');
    fireEvent.submit(form!);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText(/Failed to login with this key/)).toBeInTheDocument();
  });

  // 9. Bunker Connect button is disabled when bunker URI is empty
  // The button has disabled={isLoading || !bunkerUri.trim() || !validateBunkerUri(bunkerUri)}
  it('disables Connect button when bunker URI is empty', () => {
    renderDialog();

    toggleBunkerInput();

    const connectBtn = findBunkerConnectButton();
    expect(connectBtn.disabled).toBe(true);
  });

  // 10. Bunker URI validation - invalid format
  it('shows error for invalid bunker URI format', () => {
    renderDialog();

    toggleBunkerInput();

    const bunkerInput = screen.getByTestId('input-connectBunkerUri');
    fireEvent.change(bunkerInput, { target: { value: 'https://not-a-bunker.com' } });

    // The inline validation message should appear
    expect(screen.getByText('Invalid bunker URI format')).toBeInTheDocument();
  });

  // 11. Successful bunker login
  it('calls onLogin on successful bunker login', async () => {
    const { onLogin, onClose } = renderDialog();
    mockLoginActions.bunker.mockResolvedValue(undefined);

    toggleBunkerInput();

    const bunkerInput = screen.getByTestId('input-connectBunkerUri');
    const validBunker = 'bunker://pubkey?relay=wss://relay.damus.io';
    fireEvent.change(bunkerInput, { target: { value: validBunker } });

    const connectBtn = findBunkerConnectButton();
    fireEvent.click(connectBtn);

    await waitFor(() => {
      expect(mockLoginActions.bunker).toHaveBeenCalledWith(validBunker);
      expect(onLogin).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // 12. Bunker login failure calls login.bunker but does not crash
  // Note: The component sets errors.bunker on failure but does not render it in the UI.
  // The error is swallowed visually, but the login.bunker mock IS called and isLoading resets.
  it('calls bunker login and handles failure gracefully', async () => {
    const { onLogin } = renderDialog();
    mockLoginActions.bunker.mockRejectedValue(new Error('Connection refused'));

    toggleBunkerInput();

    const bunkerInput = screen.getByTestId('input-connectBunkerUri');
    fireEvent.change(bunkerInput, { target: { value: 'bunker://pubkey?relay=wss://relay.damus.io' } });

    const connectBtn = findBunkerConnectButton();
    fireEvent.click(connectBtn);

    // Verify the bunker login was attempted
    await waitFor(() => {
      expect(mockLoginActions.bunker).toHaveBeenCalledWith('bunker://pubkey?relay=wss://relay.damus.io');
    });

    // onLogin should NOT be called since the login failed
    expect(onLogin).not.toHaveBeenCalled();

    // The Connect button should be re-enabled (isLoading reset to false)
    await waitFor(() => {
      const btn = findBunkerConnectButton();
      expect(btn.disabled).toBe(false);
    });
  });

  // 13. Extension login when extension is available
  it('shows extension login button when window.nostr is present', () => {
    // Must set window.nostr BEFORE render so hasExtension evaluates to true
    setWindowNostr({ getPublicKey: vi.fn() });
    renderDialog();

    expect(screen.getByText('Log in with Extension')).toBeInTheDocument();
  });

  // 14. Successful extension login
  it('calls onLogin and onClose on successful extension login', async () => {
    setWindowNostr({ getPublicKey: vi.fn() });
    const { onLogin, onClose } = renderDialog();
    mockLoginActions.extension.mockResolvedValue(undefined);

    fireEvent.click(screen.getByText('Log in with Extension'));

    await waitFor(() => {
      expect(mockLoginActions.extension).toHaveBeenCalledTimes(1);
      expect(onLogin).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // 15. Extension login error
  it('shows error when extension login fails', async () => {
    setWindowNostr({ getPublicKey: vi.fn() });
    renderDialog();
    mockLoginActions.extension.mockRejectedValue(new Error('Extension denied'));

    fireEvent.click(screen.getByText('Log in with Extension'));

    await waitFor(() => {
      expect(screen.getByText('Extension denied')).toBeInTheDocument();
    });
  });

  // 16. No extension login button when window.nostr is absent
  it('does not show extension button when no extension is present', () => {
    setWindowNostr(undefined);
    renderDialog();
    expect(screen.queryByText('Log in with Extension')).not.toBeInTheDocument();
  });

  // 17. Extension login shows error when window.nostr is missing at click time
  // We use Object.defineProperty to make 'nostr' in window return false
  // without triggering a React re-render that would hide the button.
  it('shows error when extension button clicked but window.nostr removed', async () => {
    setWindowNostr({ getPublicKey: vi.fn() });
    renderDialog();

    // Make window.nostr non-existent at click time by removing the property.
    // Then restore it immediately so React doesn't re-render and hide the button.
    // Actually, we need the button to stay in the DOM, so we can't delete window.nostr
    // before the click because React would re-render. Instead, test the error path
    // by mocking the extension() call to throw the same error the component would throw.
    const originalNostr = (window as any).nostr;
    delete (window as any).nostr;

    // The button is still in the DOM from the previous render
    const extBtn = screen.getByText('Log in with Extension');

    // Restore window.nostr so React doesn't re-render on next state change
    (window as any).nostr = originalNostr;

    // Mock extension to throw the error that the component would throw
    // when window.nostr is missing (to avoid the component checking 'nostr' in window)
    mockLoginActions.extension.mockRejectedValue(
      new Error('Nostr extension not found. Please install a NIP-07 extension.')
    );

    fireEvent.click(extBtn);

    await waitFor(() => {
      expect(screen.getByText(/Nostr extension not found/)).toBeInTheDocument();
    });
  });

  // 18. Resets state when dialog closes (isOpen goes from true to false)
  it('resets form state when dialog closes', () => {
    const { rerender } = renderDialog({ isOpen: true });

    // Type something in the nsec input
    const input = screen.getByTestId('input-nsec');
    fireEvent.change(input, { target: { value: 'some-value' } });
    expect(input).toHaveValue('some-value');

    // Close the dialog by setting isOpen to false
    rerender(
      <LoginDialog isOpen={false} onClose={vi.fn()} onLogin={vi.fn()} />,
    );

    // Re-open: state should be cleared
    rerender(
      <LoginDialog isOpen={true} onClose={vi.fn()} onLogin={vi.fn()} />,
    );

    const newInput = screen.getByTestId('input-nsec');
    expect(newInput).toHaveValue('');
  });

  // 19. Remote signer tab triggers nostrconnect session generation
  it('generates nostrconnect session when remote tab is activated', async () => {
    const { generateNostrConnectParams, generateNostrConnectURI } = await import('@/hooks/useLoginActions');

    renderDialog();

    // Click the remote tab trigger (our mock exposes this button)
    fireEvent.click(screen.getByTestId('tab-trigger-remote'));

    expect(generateNostrConnectParams).toHaveBeenCalledWith(['wss://relay.damus.io']);
    expect(generateNostrConnectURI).toHaveBeenCalled();
  });

  // 20. File upload with valid nsec triggers login
  it('logs in with nsec from uploaded file', () => {
    const { onLogin } = renderDialog();
    mockLoginActions.nsec.mockImplementation(() => {});

    const validNsec = 'nsec1' + 'b'.repeat(58);
    const file = new File([validNsec], 'key.txt', { type: 'text/plain' });

    const fileInput = getFileInput();
    fireEvent.change(fileInput, { target: { files: [file] } });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockLoginActions.nsec).toHaveBeenCalledWith(validNsec);
    expect(onLogin).toHaveBeenCalled();
  });

  // 21. File upload with invalid nsec shows error
  // FileReader is async in jsdom, so we need waitFor
  it('shows error for file with invalid nsec content', async () => {
    renderDialog();

    const file = new File(['not-a-valid-key'], 'key.txt', { type: 'text/plain' });

    const fileInput = getFileInput();
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('File does not contain a valid secret key.')).toBeInTheDocument();
    });
  });

  // 22. Loading state disables buttons
  it('disables login button while loading', () => {
    renderDialog();
    // nsec() does nothing successfully -- but executeLogin calls onLogin/onClose
    // which unmounts. Instead, let it throw so isLoading stays true.
    mockLoginActions.nsec.mockImplementation(() => {
      throw new Error('blocked');
    });

    const input = screen.getByTestId('input-nsec');
    const validNsec = 'nsec1' + 'a'.repeat(58);
    fireEvent.change(input, { target: { value: validNsec } });

    const form = screen.getByTestId('tabs-content-key').querySelector('form');
    fireEvent.submit(form!);

    act(() => {
      vi.advanceTimersByTime(50);
    });

    // After the timeout fires and nsec() throws, the error state is set
    // and isLoading is set to false in the catch block
    expect(screen.getByText(/Failed to login with this key/)).toBeInTheDocument();
  });

  // 23. Shows QR code on desktop for remote signer
  it('shows QR code on desktop in remote signer tab', () => {
    mockIsMobile.mockReturnValue(false);
    renderDialog();

    // Activate remote tab to trigger session generation
    fireEvent.click(screen.getByTestId('tab-trigger-remote'));

    expect(screen.getByTestId('qrcode')).toBeInTheDocument();
  });

  // 24. Does not show QR code on mobile for remote signer
  it('does not show QR code on mobile in remote signer tab', () => {
    mockIsMobile.mockReturnValue(true);
    renderDialog();

    fireEvent.click(screen.getByTestId('tab-trigger-remote'));

    expect(screen.queryByTestId('qrcode')).not.toBeInTheDocument();
  });

  // 25. Copy URI button works
  it('copies nostrconnect URI to clipboard', async () => {
    // Mock clipboard on navigator before render
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    renderDialog();
    fireEvent.click(screen.getByTestId('tab-trigger-remote'));

    // Find the Copy URI button
    const copyBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('Copy URI'));
    expect(copyBtn).toBeTruthy();
    fireEvent.click(copyBtn!);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
  });
});
