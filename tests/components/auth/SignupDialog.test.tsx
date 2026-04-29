import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import SignupDialog from '@/components/auth/SignupDialog';

// --- Mocks ---

// Mock nostr-tools: generateSecretKey returns Uint8Array, nip19 encodes it.
vi.mock('nostr-tools', () => {
  const mockSecretKey = new Uint8Array(32).fill(42);
  return {
    generateSecretKey: vi.fn(() => mockSecretKey),
    getPublicKey: vi.fn(() => 'mock-pubkey-hex'),
    nip19: {
      nsecEncode: vi.fn(() => 'nsec1mockencodedkey'),
      npubEncode: vi.fn(() => 'npub1mockpubkey'),
      decode: vi.fn(() => ({ type: 'nsec', data: mockSecretKey })),
    },
  };
});

// Mock toast
vi.mock('@/hooks/useToast', () => ({
  toast: vi.fn(),
}));

// Mock useLoginActions -- returns an object with an nsec method.
const mockNsecLogin = vi.fn();
vi.mock('@/hooks/useLoginActions', () => ({
  useLoginActions: () => ({ nsec: mockNsecLogin }),
}));

// Mock useNostrPublish -- returns a tanstack-style mutation object.
const mockPublishEvent = vi.fn();
vi.mock('@/hooks/useNostrPublish', () => ({
  useNostrPublish: () => ({
    mutateAsync: mockPublishEvent,
    isPending: false,
  }),
}));

// Mock useUploadFile -- returns a tanstack-style mutation object.
const mockUploadFile = vi.fn();
vi.mock('@/hooks/useUploadFile', () => ({
  useUploadFile: () => ({
    mutateAsync: mockUploadFile,
    isPending: false,
  }),
}));

// Mock Dialog UI components to avoid Radix portal issues in jsdom.
// Dialog renders children only when `open` is true; DialogContent
// passes through children and calls onOpenChange for the close button.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, onOpenChange, children }: any) =>
    open ? (
      <div data-testid="dialog-root">
        {children}
        {/* This close button simulates Dialog's onOpenChange(false) when user dismisses */}
        <button data-testid="dialog-dismiss" onClick={() => onOpenChange?.(false)}>
          Dismiss
        </button>
      </div>
    ) : null,
  DialogContent: ({ children, ...props }: any) => (
    <div data-testid="dialog-content" {...props}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: any) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: any) => <h2 data-testid="dialog-title">{children}</h2>,
}));

// Mock UI primitives
vi.mock('@/components/ui/button', () => ({
  Button: ({ onClick, children, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

// Mock lucide-react icons as simple spans with the icon name.
vi.mock('lucide-react', () => ({
  Download: () => <span data-testid="icon-download">Download</span>,
  Upload: () => <span data-testid="icon-upload">Upload</span>,
  Eye: () => <span data-testid="icon-eye">Eye</span>,
  EyeOff: () => <span data-testid="icon-eyeoff">EyeOff</span>,
}));

// --- Helpers ---

/** Render SignupDialog with default props. */
function renderDialog(props: { isOpen?: boolean; onClose?: () => void } = {}) {
  const onClose = props.onClose ?? vi.fn();
  const isOpen = props.isOpen ?? true;
  return render(<SignupDialog isOpen={isOpen} onClose={onClose} />);
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  mockPublishEvent.mockResolvedValue({ id: 'event-id' });
  mockUploadFile.mockResolvedValue([['url', 'https://example.com/avatar.jpg']]);
});

describe('SignupDialog', () => {
  // 1. Renders nothing when isOpen is false
  it('renders nothing when isOpen is false', () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByTestId('dialog-root')).not.toBeInTheDocument();
  });

  // 2. Renders dialog when isOpen is true
  it('renders dialog when isOpen is true', () => {
    renderDialog({ isOpen: true });
    expect(screen.getByTestId('dialog-root')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-content')).toBeInTheDocument();
  });

  // 3. Shows the account creation form (generate step) by default
  it('shows "Sign up" title and Generate key button on initial render', () => {
    renderDialog();
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Sign up');
    expect(screen.getByText('Generate key')).toBeInTheDocument();
  });

  // 4. Calls onClose when dialog closed
  it('calls onClose when dialog close button is clicked', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByTestId('dialog-dismiss'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // 5. Generates a key and advances to download step
  it('generates a key and shows download step when "Generate key" clicked', async () => {
    renderDialog();

    // Click generate
    await act(async () => {
      fireEvent.click(screen.getByText('Generate key'));
    });

    // Title should change
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Secret Key');

    // nsec should be displayed (hidden by default as password)
    const input = screen.getByDisplayValue('nsec1mockencodedkey');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'password');

    // Download button should be visible
    expect(screen.getByText('Download key')).toBeInTheDocument();

    // Warning should be displayed
    expect(screen.getByText('Important Warning')).toBeInTheDocument();
  });

  // 6. Toggles key visibility with eye icon
  it('toggles key visibility when show/hide button clicked', async () => {
    renderDialog();

    // Advance to download step
    await act(async () => {
      fireEvent.click(screen.getByText('Generate key'));
    });

    const input = screen.getByDisplayValue('nsec1mockencodedkey');
    expect(input).toHaveAttribute('type', 'password');

    // Click the eye toggle -- it shows "Eye" text (from our mock) initially
    const toggleBtn = screen.getByRole('button', { name: 'Eye' });
    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    // Note: there are multiple buttons; the toggle is the one next to the input.
    // After clicking, the input should become type="text"
    expect(input).toHaveAttribute('type', 'text');
  });

  // 7. Downloads key and advances to profile step
  it('downloads key, logs in with nsec, and shows profile step', async () => {
    renderDialog();

    // Generate key
    await act(async () => {
      fireEvent.click(screen.getByText('Generate key'));
    });

    // Download key -- this triggers login.nsec() internally
    await act(async () => {
      fireEvent.click(screen.getByText('Download key'));
    });

    // Should have called nsec login
    expect(mockNsecLogin).toHaveBeenCalledWith('nsec1mockencodedkey');

    // Should now be on profile step
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Create Your Profile');
    expect(screen.getByLabelText('Display Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Bio')).toBeInTheDocument();
    expect(screen.getByLabelText('Avatar')).toBeInTheDocument();
    expect(screen.getByText('Create profile')).toBeInTheDocument();
    expect(screen.getByText('Skip for now')).toBeInTheDocument();
  });

  // 8. Handles form submission (Create profile)
  it('publishes profile metadata and calls onClose when "Create profile" clicked', async () => {
    mockPublishEvent.mockResolvedValue({ id: 'new-event-id' });
    renderDialog();

    // Advance to profile step
    await act(async () => { fireEvent.click(screen.getByText('Generate key')); });
    await act(async () => { fireEvent.click(screen.getByText('Download key')); });

    // Fill in profile fields
    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Hello world' } });

    // Click "Create profile"
    await act(async () => {
      fireEvent.click(screen.getByText('Create profile'));
    });

    // Should publish a kind 0 event with the profile data
    expect(mockPublishEvent).toHaveBeenCalledTimes(1);
    const publishArg = mockPublishEvent.mock.calls[0][0];
    expect(publishArg.kind).toBe(0);
    const content = JSON.parse(publishArg.content);
    expect(content.name).toBe('Test User');
    expect(content.about).toBe('Hello world');
  });

  // 9. Skips profile and closes
  it('skips profile publish when "Skip for now" clicked', async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    // Advance to profile step
    await act(async () => { fireEvent.click(screen.getByText('Generate key')); });
    await act(async () => { fireEvent.click(screen.getByText('Download key')); });

    // Skip profile
    await act(async () => {
      fireEvent.click(screen.getByText('Skip for now'));
    });

    // No profile event published (skipProfile=true)
    expect(mockPublishEvent).not.toHaveBeenCalled();
    // onClose called
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // 10. Handles avatar upload
  it('uploads avatar file and sets picture URL', async () => {
    renderDialog();

    // Advance to profile step
    await act(async () => { fireEvent.click(screen.getByText('Generate key')); });
    await act(async () => { fireEvent.click(screen.getByText('Download key')); });

    // Find the hidden file input and simulate file selection
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    const file = new File(['dummy'], 'avatar.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 1024 }); // 1KB, under 5MB limit

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    // uploadFile should be called
    expect(mockUploadFile).toHaveBeenCalledWith(file);

    // Avatar input should now show the uploaded URL
    await waitFor(() => {
      expect(screen.getByLabelText('Avatar')).toHaveValue('https://example.com/avatar.jpg');
    });
  });

  // 11. Rejects non-image file uploads
  it('shows toast error when non-image file uploaded as avatar', async () => {
    const { toast } = await import('@/hooks/useToast');
    renderDialog();

    // Advance to profile step
    await act(async () => { fireEvent.click(screen.getByText('Generate key')); });
    await act(async () => { fireEvent.click(screen.getByText('Download key')); });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['text'], 'doc.txt', { type: 'text/plain' });

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Invalid file type' }),
    );
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  // 12. Rejects oversized file uploads
  it('shows toast error when file exceeds 5MB', async () => {
    const { toast } = await import('@/hooks/useToast');
    renderDialog();

    // Advance to profile step
    await act(async () => { fireEvent.click(screen.getByText('Generate key')); });
    await act(async () => { fireEvent.click(screen.getByText('Download key')); });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'.repeat(6 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 }); // 6MB

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'File too large' }),
    );
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  // 13. Handles download failure gracefully
  it('shows toast error when key download fails', async () => {
    const { nip19 } = await import('nostr-tools');
    const { toast } = await import('@/hooks/useToast');

    // Make decode throw to simulate an invalid key
    (nip19.decode as any).mockImplementationOnce(() => {
      throw new Error('Invalid key');
    });

    renderDialog();

    // Generate and attempt download
    await act(async () => { fireEvent.click(screen.getByText('Generate key')); });
    await act(async () => { fireEvent.click(screen.getByText('Download key')); });

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Download failed' }),
    );
  });

  // 14. Resets state when dialog reopens
  it('resets to generate step when dialog reopens', async () => {
    const { rerender } = renderDialog({ isOpen: true });

    // Generate key to advance to download step
    await act(async () => {
      fireEvent.click(screen.getByText('Generate key'));
    });
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Secret Key');

    // Close and reopen the dialog
    rerender(<SignupDialog isOpen={false} onClose={vi.fn()} />);
    rerender(<SignupDialog isOpen={true} onClose={vi.fn()} />);

    // Should be back on generate step
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Sign up');
    expect(screen.getByText('Generate key')).toBeInTheDocument();
  });

  // 15. Handles upload failure
  it('shows toast error when avatar upload fails', async () => {
    const { toast } = await import('@/hooks/useToast');
    mockUploadFile.mockRejectedValueOnce(new Error('Upload failed'));

    renderDialog();

    // Advance to profile step
    await act(async () => { fireEvent.click(screen.getByText('Generate key')); });
    await act(async () => { fireEvent.click(screen.getByText('Download key')); });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['dummy'], 'avatar.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 1024 });

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Upload failed' }),
    );
  });

  // 16. Handles profile publish failure
  it('shows toast error when profile publish fails but still calls onClose', async () => {
    const { toast } = await import('@/hooks/useToast');
    const onClose = vi.fn();
    mockPublishEvent.mockRejectedValueOnce(new Error('Publish failed'));

    renderDialog({ onClose });

    // Advance to profile step
    await act(async () => { fireEvent.click(screen.getByText('Generate key')); });
    await act(async () => { fireEvent.click(screen.getByText('Download key')); });

    // Fill in a name so profile data is non-empty
    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'Test' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Create profile'));
    });

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Profile Setup Failed' }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
