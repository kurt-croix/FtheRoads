import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConversationMessages } from '@/hooks/useConversationMessages';

// Shared mock Map — mutated per test via helper functions
const mockMessages = new Map<string, any>();

vi.mock('@/hooks/useDMContext', () => ({
  useDMContext: () => ({ messages: mockMessages }),
}));

/** Build an array of mock messages with sequential ids. */
function makeMessages(count: number): Array<{ id: string }> {
  return Array.from({ length: count }, (_, i) => ({ id: `msg-${i + 1}` }));
}

/** Seed a conversation into the mock map. */
function seedConversation(
  conversationId: string,
  messageCount: number,
  extras?: { lastMessage?: any; lastActivity?: number },
) {
  mockMessages.set(conversationId, {
    messages: makeMessages(messageCount),
    lastMessage: extras?.lastMessage ?? null,
    lastActivity: extras?.lastActivity ?? 0,
  });
}

describe('useConversationMessages', () => {
  beforeEach(() => {
    mockMessages.clear();
  });

  // ---------------------------------------------------------------
  // 1. Empty result when conversation does not exist
  // ---------------------------------------------------------------
  it('returns empty messages when conversation not found', () => {
    const { result } = renderHook(() =>
      useConversationMessages('unknown-id'),
    );

    expect(result.current.messages).toEqual([]);
    expect(result.current.hasMoreMessages).toBe(false);
    expect(result.current.totalCount).toBe(0);
    expect(result.current.lastMessage).toBeNull();
    expect(result.current.lastActivity).toBe(0);
  });

  // ---------------------------------------------------------------
  // 2. Returns messages for an existing conversation
  // ---------------------------------------------------------------
  it('returns messages for existing conversation', () => {
    seedConversation('conv-1', 10);

    const { result } = renderHook(() =>
      useConversationMessages('conv-1'),
    );

    expect(result.current.messages).toHaveLength(10);
    expect(result.current.messages[0].id).toBe('msg-1');
    expect(result.current.messages[9].id).toBe('msg-10');
  });

  // ---------------------------------------------------------------
  // 3. Returns correct totalCount
  // ---------------------------------------------------------------
  it('returns correct totalCount', () => {
    seedConversation('conv-1', 35);

    const { result } = renderHook(() =>
      useConversationMessages('conv-1'),
    );

    // Even though only 25 are visible, totalCount reflects all messages
    expect(result.current.totalCount).toBe(35);
  });

  // ---------------------------------------------------------------
  // 4. hasMoreMessages = false when messages <= 25
  // ---------------------------------------------------------------
  it('returns hasMoreMessages false when messages <= 25', () => {
    // Exactly 25 — boundary
    seedConversation('conv-1', 25);
    const { result: r25 } = renderHook(() =>
      useConversationMessages('conv-1'),
    );
    expect(r25.current.hasMoreMessages).toBe(false);

    mockMessages.clear();

    // Fewer than 25
    seedConversation('conv-2', 10);
    const { result: r10 } = renderHook(() =>
      useConversationMessages('conv-2'),
    );
    expect(r10.current.hasMoreMessages).toBe(false);
  });

  // ---------------------------------------------------------------
  // 5. hasMoreMessages = true when messages > 25
  // ---------------------------------------------------------------
  it('returns hasMoreMessages true when messages > 25', () => {
    seedConversation('conv-1', 30);

    const { result } = renderHook(() =>
      useConversationMessages('conv-1'),
    );

    expect(result.current.hasMoreMessages).toBe(true);
  });

  // ---------------------------------------------------------------
  // 6. loadEarlierMessages increases visible count
  // ---------------------------------------------------------------
  it('loadEarlierMessages increases visible count by 25', () => {
    seedConversation('conv-1', 60);

    const { result } = renderHook(() =>
      useConversationMessages('conv-1'),
    );

    // Initial: 25 visible out of 60
    expect(result.current.messages).toHaveLength(25);
    expect(result.current.hasMoreMessages).toBe(true);

    // Load one more page
    act(() => {
      result.current.loadEarlierMessages();
    });

    // Now 50 visible out of 60
    expect(result.current.messages).toHaveLength(50);
    expect(result.current.hasMoreMessages).toBe(true);

    // Load another page
    act(() => {
      result.current.loadEarlierMessages();
    });

    // 75 > 60, so all 60 are visible
    expect(result.current.messages).toHaveLength(60);
    expect(result.current.hasMoreMessages).toBe(false);
  });

  // ---------------------------------------------------------------
  // 7. Resets visible count when conversationId changes
  // ---------------------------------------------------------------
  it('resets visible count when conversationId changes', () => {
    seedConversation('conv-1', 60);
    seedConversation('conv-2', 60);

    const { result, rerender } = renderHook(
      ({ id }) => useConversationMessages(id),
      { initialProps: { id: 'conv-1' } },
    );

    // Load earlier messages to expand beyond 25
    act(() => {
      result.current.loadEarlierMessages();
    });
    expect(result.current.messages).toHaveLength(50);

    // Switch conversation — visible count should reset to 25
    rerender({ id: 'conv-2' });
    expect(result.current.messages).toHaveLength(25);
    expect(result.current.hasMoreMessages).toBe(true);
  });

  // ---------------------------------------------------------------
  // 8. Returns lastMessage and lastActivity from conversation data
  // ---------------------------------------------------------------
  it('returns lastMessage and lastActivity from conversation data', () => {
    const mockLastMessage = { id: 'msg-35', decryptedContent: 'Hello' };
    const mockLastActivity = 1714000000;

    seedConversation('conv-1', 35, {
      lastMessage: mockLastMessage,
      lastActivity: mockLastActivity,
    });

    const { result } = renderHook(() =>
      useConversationMessages('conv-1'),
    );

    expect(result.current.lastMessage).toEqual(mockLastMessage);
    expect(result.current.lastActivity).toBe(mockLastActivity);
  });

  // ---------------------------------------------------------------
  // 9. Slices correctly — shows last N messages (most recent)
  // ---------------------------------------------------------------
  it('slices correctly — shows last N messages (most recent)', () => {
    // 30 messages: msg-1 through msg-30
    seedConversation('conv-1', 30);

    const { result } = renderHook(() =>
      useConversationMessages('conv-1'),
    );

    // Default page size is 25, so we should see msg-6 through msg-30
    expect(result.current.messages).toHaveLength(25);
    expect(result.current.messages[0].id).toBe('msg-6');
    expect(result.current.messages[24].id).toBe('msg-30');

    // After loading earlier, we should see msg-1 through msg-30 (all 30)
    act(() => {
      result.current.loadEarlierMessages();
    });

    expect(result.current.messages).toHaveLength(30);
    expect(result.current.messages[0].id).toBe('msg-1');
    expect(result.current.messages[29].id).toBe('msg-30');
  });
});
