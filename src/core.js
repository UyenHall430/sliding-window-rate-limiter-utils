/**
 * Tracks event timestamps in a rolling window and reports whether a new event
 * would exceed a configured rate limit.
 *
 * Why an explicit `now` function rather than `Date.now()` internally:
 * tests must be deterministic. Touching the wall clock inside the library
 * would make every test that exercises eviction depend on machine speed.
 * The caller owns time.
 */
export class SlidingWindowRateLimiter {
  #maxEvents;
  #windowMs;
  #now;
  /** @type {number[]} timestamps in ms, kept sorted ascending */
  #timestamps;

  /**
   * @param {object} opts
   * @param {number} opts.maxEvents   Maximum events permitted within any window.
   * @param {number} opts.windowMs    Window length in milliseconds.
   * @param {() => number} [opts.now]  Clock function returning ms; defaults to `Date.now`.
   */
  constructor({ maxEvents, windowMs, now }) {
    if (!Number.isInteger(maxEvents) || maxEvents <= 0) {
      throw new TypeError('maxEvents must be a positive integer');
    }
    if (!Number.isInteger(windowMs) || windowMs <= 0) {
      throw new TypeError('windowMs must be a positive integer');
    }
    this.#maxEvents = maxEvents;
    this.#windowMs = windowMs;
    this.#now = typeof now === 'function' ? now : Date.now;
    this.#timestamps = [];
  }

  /**
   * Remove timestamps that fall before the window's left edge.
   * Uses a two-pointer scan rather than `Array.prototype.filter` because this
   * runs on every `tryRecord` call; re-allocating the whole array each time
   * is wasteful when only a few elements typically drop off.
   */
  #evictExpired(currentTime) {
    const cutoff = currentTime - this.#windowMs;
    let firstValid = 0;
    const len = this.#timestamps.length;
    while (firstValid < len && this.#timestamps[firstValid] < cutoff) {
      firstValid++;
    }
    if (firstValid > 0) {
      if (firstValid === len) {
        this.#timestamps = [];
      } else {
        // Move surviving elements to the front and truncate.
        for (let i = 0; i < len - firstValid; i++) {
          this.#timestamps[i] = this.#timestamps[firstValid + i];
        }
        this.#timestamps.length = len - firstValid;
      }
    }
  }

  /**
   * Returns the count of events currently in the window WITHOUT recording a
   * new one. Useful for instrumentation.
   *
   * @returns {number}
   */
  currentCount() {
    this.#evictExpired(this.#now());
    return this.#timestamps.length;
  }

  /**
   * Attempts to record a new event at `now()`.
   *
   * Returns `{ allowed: boolean, count: number }`. `count` is the number of
   * events in the window *after* eviction but *before* this attempted event.
   *
   * The decision is strict: if `count === maxEvents`, we reject. We never
   * silently drop an old timestamp to make room for a new one — the window
   * boundary is the same for all events.
   *
   * @returns {{ allowed: boolean, count: number }}
   */
  tryRecord() {
    const currentTime = this.#now();
    this.#evictExpired(currentTime);
    const count = this.#timestamps.length;
    if (count >= this.#maxEvents) {
      return { allowed: false, count };
    }
    this.#timestamps.push(currentTime);
    return { allowed: true, count: count + 1 };
  }

  /**
   * Clears all recorded events.
   */
  reset() {
    this.#timestamps = [];
  }
}
