import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// --- Hoisted mocks ---

const mockUpload = vi.fn();

vi.mock('@nostrify/nostrify/uploaders', () => ({
  BlossomUploader: vi.fn(function (this: unknown) {
    // Use a regular function so it can be called with `new`
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    return { upload: mockUpload };
  }),
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: vi.fn(),
}));

// Imports must come after vi.mock calls
import { useUploadFile } from '@/hooks/useUploadFile';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { BlossomUploader } from '@nostrify/nostrify/uploaders';

// --- Helpers ---

/** Creates a fresh QueryClientProvider wrapper. Disables retries so errors surface immediately. */
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

/** Creates a minimal File for testing. */
function makeFile(name = 'test.jpg', type = 'image/jpeg'): File {
  return new File(['hello'], name, { type });
}

// --- Tests ---

describe('useUploadFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock: user is logged in with a signer
    vi.mocked(useCurrentUser).mockReturnValue({
      user: { signer: {} } as ReturnType<typeof useCurrentUser>['user'],
    });
  });

  // ---------------------------------------------------------------
  // 1. Throws "Must be logged in" when no user
  // ---------------------------------------------------------------
  it('throws "Must be logged in to upload files" when no user', async () => {
    vi.mocked(useCurrentUser).mockReturnValueOnce({ user: undefined } as ReturnType<typeof useCurrentUser>);

    const { result } = renderHook(() => useUploadFile(), {
      wrapper: createWrapper(),
    });

    const file = makeFile();

    // mutateAsync rejects so we await it inside act and catch the rejection
    await act(async () => {
      await expect(result.current.mutateAsync(file)).rejects.toThrow(
        'Must be logged in to upload files',
      );
    });

    // BlossomUploader should not have been instantiated
    expect(BlossomUploader).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------
  // 2. Creates BlossomUploader with correct servers and signer
  // ---------------------------------------------------------------
  it('creates BlossomUploader with correct servers and signer', async () => {
    const mockSigner = { signEvent: vi.fn() };
    vi.mocked(useCurrentUser).mockReturnValue({
      user: { signer: mockSigner } as ReturnType<typeof useCurrentUser>['user'],
    });

    const tags = [['url', 'https://example.com/file.jpg']];
    mockUpload.mockResolvedValue(tags);

    const { result } = renderHook(() => useUploadFile(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync(makeFile());
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // BlossomUploader was constructed with the expected config
    expect(BlossomUploader).toHaveBeenCalledOnce();
    expect(BlossomUploader).toHaveBeenCalledWith({
      servers: ['https://blossom.primal.net/'],
      signer: mockSigner,
    });
  });

  // ---------------------------------------------------------------
  // 3. Calls uploader.upload with the file
  // ---------------------------------------------------------------
  it('calls uploader.upload with the file', async () => {
    const tags = [['url', 'https://example.com/file.jpg']];
    mockUpload.mockResolvedValue(tags);

    const { result } = renderHook(() => useUploadFile(), {
      wrapper: createWrapper(),
    });

    const file = makeFile('photo.png', 'image/png');

    await act(async () => {
      await result.current.mutateAsync(file);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // upload was called with the exact file we passed
    expect(mockUpload).toHaveBeenCalledOnce();
    expect(mockUpload).toHaveBeenCalledWith(file);
  });

  // ---------------------------------------------------------------
  // 4. Returns upload tags on success
  // ---------------------------------------------------------------
  it('returns upload tags on success', async () => {
    const tags = [['url', 'https://example.com/file.jpg']];
    mockUpload.mockResolvedValue(tags);

    const { result } = renderHook(() => useUploadFile(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync(makeFile());
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // The mutation data is the tags array returned by uploader.upload
    expect(result.current.data).toEqual(tags);
  });
});
