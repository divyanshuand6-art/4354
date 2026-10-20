import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPreliminary } from '../src/services/botRules.js';

test('known crawler user agents are not human-qualified', () => {
  const result = classifyPreliminary('facebookexternalhit/1.1');
  assert.equal(result.botClass, 'known_bot');
  assert.equal(result.isQualifiedClick, false);
  assert.ok(result.detectionReasons.includes('known_bot_user_agent'));
});

test('missing user agent stays unknown instead of being counted as human', () => {
  const result = classifyPreliminary('');
  assert.equal(result.botClass, 'unknown');
  assert.equal(result.isQualifiedClick, false);
});

test('ordinary browser signature waits for worker classification', () => {
  const result = classifyPreliminary('Mozilla/5.0 Chrome/125.0.0.0 Safari/537.36');
  assert.equal(result.botClass, 'unknown');
  assert.equal(result.isQualifiedClick, false);
});
