# sliding-window-rate-limiter-utils

Tracks event timestamps in a rolling time window and reports whether a new event exceeds a configured rate limit.

## Usage

```js
import { SlidingWindowRateLimiter } from 'sliding-window-rate-limiter-utils';

const limiter = new SlidingWindowRateLimiter({
  maxEvents: 100,
  windowMs: 60_000,
  now: Date.now,
});

const { allowed, count } = limiter.tryRecord();
if (!allowed) {
  // respond 429 here
}

// when you want to inspect the active count without recording:
limiter.currentCount();

// when you want to clear state:
limiter.reset();
```

## Why this exists

Most rate limiting in production is done at the gateway or by a Redis token bucket. This library is for the case in between — a single Node.js process that needs a quick, dependency-free guard against a caller hammering an internal function. The sliding window (as opposed to a fixed window) avoids the burst-at-boundary problem where two windows' worth of traffic fits into a single second at the seam.

The trade-off is memory: every event within the window is kept as a timestamp. If your window is long and your rate is high, that array grows. For tens of thousands of events per minute this is fine; for millions it is not — use a token bucket or a counter-based approximation instead.

## The awkward edge

The window is a **half-open interval** `[now - windowMs, now]`. An event recorded at `t=0` is still counted at `t=windowMs` exactly, and only falls out at `t=windowMs + 1` (the first tick strictly past the window). If you need `now - windowMs` to be an exclusive lower bound, adjust `windowMs` by one millisecond when you construct the limiter — the library will not silently shift boundaries for you.

Time is injected via the `now` constructor option. Default is `Date.now`. This exists so tests can be deterministic; pass your own clock in production only if you have a reason to.
