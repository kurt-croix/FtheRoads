/**
 * Decrypt and inspect nostr-mail events from relays.
 * Compares our format to nmail's format to find the bridge processing issue.
 *
 * 1. Query gift wraps to bridge and to self from yakihonne
 * 2. Decrypt self-copies using our test key
 * 3. Dump inner event structure for analysis
 */

import { test } from '@playwright/test';
import { WebSocket } from 'ws';
import { nip19 } from 'nostr-tools';
import { getPublicKey } from 'nostr-tools/pure';
import { unwrapEvent } from 'nostr-tools/nip59';

const TEST_NSEC = 'nsec1g6wq6h5lgraqgqkp3v9quy7hlufkgcqj5vxjhjysggw7mx4mczssgwg850';
const BRIDGE_PUBKEY = '0d365385f474d4b025377b4ade6ad241f847d514a9e9b475069f69a20f886c68';

function queryRelay(url: string, filters: Record<string, unknown>, timeout = 15000): Promise<any[]> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const events: any[] = [];
    const subId = `q${Date.now()}`;
    const timer = setTimeout(() => { try { ws.close(); } catch {} resolve(events); }, timeout);
    ws.on('open', () => ws.send(JSON.stringify(['REQ', subId, { ...filters, limit: 50 }])));
    ws.on('message', (data: any) => {
      const msg = JSON.parse(data.toString());
      if (msg[0] === 'EVENT' && msg[1] === subId) events.push(msg[2]);
      else if ((msg[0] === 'EOSE' || msg[0] === 'CLOSED') && msg[1] === subId) {
        clearTimeout(timer);
        try { ws.close(); } catch {}
        resolve(events);
      }
    });
    ws.on('error', () => { clearTimeout(timer); resolve([]); });
  });
}

test('decrypt and compare event formats', async () => {
  test.setTimeout(60000);

  const decoded = nip19.decode(TEST_NSEC);
  const secretKey = decoded.data as Uint8Array;
  const pubkey = getPublicKey(secretKey);
  console.log('[test] Test pubkey:', pubkey);

  // Query gift wraps to bridge (outer layer only — can't decrypt)
  const bridgeEvents = await queryRelay('wss://nostr-01.yakihonne.com', {
    kinds: [1059],
    '#p': [BRIDGE_PUBKEY],
    limit: 10,
  });
  console.log(`\n=== GIFT WRAPS TO BRIDGE (${bridgeEvents.length}) ===`);
  bridgeEvents.slice(0, 5).forEach((e, i) => {
    console.log(`\n[${i}] id: ${e.id}`);
    console.log(`    pubkey (ephemeral): ${e.pubkey.slice(0, 20)}...`);
    console.log(`    created_at: ${new Date(e.created_at * 1000).toISOString()}`);
    console.log(`    tags: ${JSON.stringify(e.tags)}`);
    console.log(`    content length: ${e.content.length}`);
    console.log(`    content (first 100): ${e.content.slice(0, 100)}...`);
  });

  // Query gift wraps to OUR pubkey (self-copies — we CAN decrypt these)
  const selfEvents = await queryRelay('wss://nostr-01.yakihonne.com', {
    kinds: [1059],
    '#p': [pubkey],
    limit: 10,
  });
  console.log(`\n=== SELF-COPY GIFT WRAPS (${selfEvents.length}) ===`);

  // Also check damus and uid.ovh for self-copies
  const selfDamus = await queryRelay('wss://relay.damus.io', {
    kinds: [1059],
    '#p': [pubkey],
    limit: 10,
  });
  console.log(`[test] Self-copies on damus: ${selfDamus.length}`);

  const allSelf = [...selfEvents, ...selfDamus];
  // Deduplicate
  const seen = new Set<string>();
  const uniqueSelf = allSelf.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
  console.log(`[test] Total unique self-copies: ${uniqueSelf.length}`);

  // Try to decrypt each self-copy
  let decryptedCount = 0;
  for (const giftWrap of uniqueSelf) {
    try {
      // NIP-59 unwrap: gift wrap → inner rumor (unwraps + unseals in one step)
      const rumor = unwrapEvent(giftWrap, secretKey);
      console.log(`\n=== DECRYPTED INNER EVENT (RUMOR) ===`);
      console.log(`  kind: ${rumor.kind}`);
      console.log(`  pubkey: ${rumor.pubkey.slice(0, 20)}...`);
      console.log(`  created_at: ${new Date(rumor.created_at * 1000).toISOString()}`);
      console.log(`  tags: ${JSON.stringify(rumor.tags)}`);
      console.log(`  content length: ${rumor.content?.length ?? 0}`);
      if (rumor.content) {
        console.log(`  content (first 500):`);
        console.log(rumor.content.slice(0, 500));
      }
      decryptedCount++;
    } catch (err: any) {
      console.log(`  Failed to decrypt ${giftWrap.id.slice(0, 16)}: ${err.message}`);
    }
  }

  console.log(`\n[test] Decrypted ${decryptedCount}/${uniqueSelf.length} self-copies`);

  // Now query for events that the bridge has processed (kind 1985 labels)
  const processedEvents = await queryRelay('wss://nostr-01.yakihonne.com', {
    kinds: [1985],
    authors: [BRIDGE_PUBKEY],
    '#L': ['mail'],
    limit: 10,
  });
  console.log(`\n=== BRIDGE PROCESSED LABELS (${processedEvents.length}) ===`);
  processedEvents.forEach((e, i) => {
    console.log(`\n[${i}] id: ${e.id}`);
    console.log(`    created_at: ${new Date(e.created_at * 1000).toISOString()}`);
    console.log(`    tags: ${JSON.stringify(e.tags)}`);
  });
});
