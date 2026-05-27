import assert from 'node:assert/strict';
import { buildSections } from '../src/lib/userIousGrouping.js';
import { SAMPLE_ADDRESS, SAMPLE_ROWS, SAMPLE_ENRICHED } from './user-ious-grouping.sample.js';

function tokenIds(items) {
  return items.map((item) => item.tokenId).sort((a, b) => a - b);
}

function run() {
  const sections = buildSections(SAMPLE_ROWS, SAMPLE_ENRICHED, SAMPLE_ADDRESS);

  const selfMintedSelfOwned = SAMPLE_ROWS.find((row) => row.token_id === 1);
  const historical = SAMPLE_ROWS.find((row) => row.token_id === 2);
  const pureFulfiller = SAMPLE_ROWS.find((row) => row.token_id === 3);

  assert.deepEqual(tokenIds(sections.created), [1], 'self-minted active token should appear in Created by me');
  assert.deepEqual(tokenIds(sections.owedToMe), [1], 'self-owned active token should appear in Owed to me');
  assert.deepEqual(tokenIds(sections.owedByMe), [3], 'pure fulfiller active token should appear only in Owed by me');
  assert.deepEqual(tokenIds(sections.history), [2], 'settled token should appear only in History');

  assert.ok(sections.created.some((item) => item.tokenId === 1), 'token 1 should be in Created by me');
  assert.ok(sections.owedToMe.some((item) => item.tokenId === 1), 'token 1 should be in Owed to me');
  assert.ok(!sections.owedToMe.some((item) => item.tokenId === 2), 'historical settled token should not be in Owed to me');
  assert.ok(!sections.created.some((item) => item.tokenId === 2), 'historical settled token should not be in Created by me');
  assert.ok(!sections.owedByMe.some((item) => item.tokenId === 2), 'historical settled token should not be in Owed by me');
  assert.ok(sections.history.some((item) => item.tokenId === 2), 'token 2 should be in History');
  assert.ok(sections.owedByMe.some((item) => item.tokenId === 3), 'token 3 should be in Owed by me');
  assert.ok(!sections.created.some((item) => item.tokenId === 3), 'pure fulfiller should not be in Created by me');
  assert.ok(!sections.owedToMe.some((item) => item.tokenId === 3), 'pure fulfiller should not be in Owed to me');
  assert.ok(!sections.history.some((item) => item.tokenId === 3), 'active fulfiller should not be in History');

  assert.equal(selfMintedSelfOwned.state, 1);
  assert.equal(historical.state, 2);
  assert.equal(pureFulfiller.state, 1);

  console.log('Grouping harness passed.');
  console.log('Created by me:', tokenIds(sections.created).join(', '));
  console.log('Owed to me:', tokenIds(sections.owedToMe).join(', '));
  console.log('Owed by me:', tokenIds(sections.owedByMe).join(', '));
  console.log('History:', tokenIds(sections.history).join(', '));
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
