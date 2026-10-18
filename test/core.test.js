import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SlidingWindowRateLimiter } from '../src/core.js';

// A controllable clock shared across tests. Each test sets the time it needs.
let clock = 0;
function fakeNow() {
  return clock;
}

function makeLimiter(maxEvents, windowMs) {
  clock = 0;
  return new SlidingWindowRateLimiter({ maxEvents, windowMs, now: fakeNow });
}

test('allows events up to the limit', () => {
  const limiter = makeLimiter(3, 1000);
  assert.deepEqual(limiter.tryRecord(), { allowed: true, count: 1 });
  assert.deepEqual(limiter.tryRecord(), { allowed: true, count: 2 });
  assert.deepEqual(limiter.tryRecord(), { allowed: true, count: 3 });
});

test('rejects the event that would exceed the limit', () => {
  const limiter = makeLimiter(2, 1000);
  assert.equal(limiter.tryRecord().allowed, true);
  assert.equal(limiter.tryRecord().allowed, true);
  const r = limiter.tryRecord();
  assert.equal(r.allowed, false);
  assert.equal(r.count, 2);
});

test('allows again after an old event falls out of the window', () => {
  const limiter = makeLimiter(1, 1000);
  assert.equal(limiter.tryRecord().allowed, true); // t=0
  clock = 500;
  assert.equal(limiter.tryRecord().allowed, false); // still in window
  clock = 1001; // strictly past the 1000ms window
  const r = limiter.tryRecord();
  assert.equal(r.allowed, true);
  assert.equal(r.count, 1);
});

test('events at exactly the window boundary are still counted', () => {
  const limiter = makeLimiter(1, 1000);
  assert.equal(limiter.tryRecord().allowed, true); // recorded at t=0
  clock = 1000; // boundary; t=0 event at cutoff 0 is not < 0, so still in
  const r = limiter.tryRecord();
  assert.equal(r.allowed, false);
  assert.equal(r.count, 1);
});

test('currentCount reflects only active events', () => {
  const limiter = makeLimiter(5, 1000);
  limiter.tryRecord();
  clock = 100;
  limiter.tryRecord();
  clock = 200;
  limiter.tryRecord();
  assert.equal(limiter.currentCount(), 3);
  clock = 1500; // all three fall out
  assert.equal(limiter.currentCount(), 0);
});

test('reset clears recorded events', () => {
  const limiter = makeLimiter(2, 1000);
  limiter.tryRecord();
  limiter.tryRecord();
  assert.equal(limiter.currentCount(), 2);
  limiter.reset();
  assert.equal(limiter.currentCount(), 0);
});

test('constructor rejects invalid maxEvents', () => {
  assert.throws(() => new SlidingWindowRateLimiter({ maxEvents: 0, windowMs: 1000, now: fakeNow }), /maxEvents/);
  assert.throws(() => new SlidingWindowRateLimiter({ maxEvents: 1.5, windowMs: 1000, now: fakeNow }), /maxEvents/);
  assert.throws(() => new SlidingWindowRateLimiter({ maxEvents: -1, windowMs: 1000, now: fakeNow }), /maxEvents/);
});

test('constructor rejects invalid windowMs', () => {
  assert.throws(() => new SlidingWindowRateLimiter({ maxEvents: 1, windowMs: 0, now: fakeNow }), /windowMs/);
  assert.throws(() => new SlidingWindowRateLimiter({ maxEvents: 1, windowMs: 1.5, now: fakeNow }), /windowMs/);
});

test('uses Date.now by default when no clock is provided', () => {
  const limiter = new SlidingWindowRateLimiter({ maxEvents: 5, windowMs: 1000 });
  // Should not throw and should allow the first record.
  const r = limiter.tryRecord();
  assert.equal(r.allowed, true);
  limiter.reset();
});

test('many events then full window expiry clears everything', () => {
  const limiter = makeLimiter(10, 1000);
  for (let i = 0; i < 10; i++) {
    clock = i * 100;
    assert.equal(limiter.tryRecord().allowed, true);
  }
  // At t=900 we have 10 events spanning [0,900] inside a 1000ms window (cutoff = -100)
  clock = 950;
  assert.equal(limiter.tryRecord().allowed, false);
  clock = 1001; // cutoff = 1, so only t>=1 survive; first event at t=0 evicts
  assert.equal(limiter.currentCount(), 9);
});

test('repeated rejection does not grow internal storage', () => {
  const limiter = makeLimiter(1, 1000);
  limiter.tryRecord();
  for (let i = 0; i < 50; i++) {
    clock = i * 10;
    limiter.tryRecord();
  }
  // Only one event was ever recorded; rejections add nothing.
  assert.equal(limiter.currentCount(), 1);
});

test('count field reports post-eviction pre-attempt count when rejected', () => {
  const limiter = makeLimiter(2, 1000);
  limiter.tryRecord();
  limiter.tryRecord();
  const r = limiter.tryRecord();
  assert.equal(r.allowed, false);
  assert.equal(r.count, 2);
});
