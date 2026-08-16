/**
 * Tests for utils/recent-verses.ts and utils/verse-key.ts
 */

import { describe, it, expect } from 'vitest';
import { RecentVerseTracker } from '../src/utils/recent-verses';
import { verseKey } from '../src/utils/verse-key';
import { Verse } from '../src/types';

function makeVerse(overrides: Partial<Verse> = {}): Verse {
	return {
		book_number: 500,
		book_name_short: 'John',
		book_name_long: 'John',
		chapter: 3,
		verse: 16,
		text: 'For God so loved the world...',
		translation: 'KJV',
		...overrides,
	};
}

describe('verseKey()', () => {
	it('should produce the same key for two separately-fetched objects representing the same verse', () => {
		const a = makeVerse();
		const b = makeVerse({ text: 'a different object, same verse' });
		expect(verseKey(a)).toBe(verseKey(b));
	});

	it('should differ by translation, book, chapter, or verse', () => {
		const base = makeVerse();
		expect(verseKey(base)).not.toBe(verseKey({ ...base, translation: 'RST' }));
		expect(verseKey(base)).not.toBe(verseKey({ ...base, book_number: 220 }));
		expect(verseKey(base)).not.toBe(verseKey({ ...base, chapter: 4 }));
		expect(verseKey(base)).not.toBe(verseKey({ ...base, verse: 17 }));
	});
});

describe('RecentVerseTracker', () => {
	it('should report false for a key that was never marked', () => {
		const tracker = new RecentVerseTracker();
		expect(tracker.has('John|500|3|16')).toBe(false);
	});

	it('should report true for a marked key', () => {
		const tracker = new RecentVerseTracker();
		tracker.mark('John|500|3|16');
		expect(tracker.has('John|500|3|16')).toBe(true);
	});

	it('should not affect other keys', () => {
		const tracker = new RecentVerseTracker();
		tracker.mark('John|500|3|16');
		expect(tracker.has('John|500|3|17')).toBe(false);
	});

	it('should evict the oldest key once over capacity', () => {
		const tracker = new RecentVerseTracker(3);
		tracker.mark('a');
		tracker.mark('b');
		tracker.mark('c');
		expect(tracker.has('a')).toBe(true);

		// Pushes the tracker over capacity - "a" is the oldest, so it goes
		tracker.mark('d');
		expect(tracker.has('a')).toBe(false);
		expect(tracker.has('b')).toBe(true);
		expect(tracker.has('c')).toBe(true);
		expect(tracker.has('d')).toBe(true);
	});

	it('should bump a re-marked key back to "most recent", protecting it from eviction', () => {
		const tracker = new RecentVerseTracker(3);
		tracker.mark('a');
		tracker.mark('b');
		tracker.mark('c');

		// Re-mark "a" - it should now be the most recent, and "b" the oldest
		tracker.mark('a');
		tracker.mark('d');

		expect(tracker.has('a')).toBe(true);
		expect(tracker.has('b')).toBe(false);
		expect(tracker.has('c')).toBe(true);
		expect(tracker.has('d')).toBe(true);
	});

	it('should default to a generous capacity when none is given', () => {
		const tracker = new RecentVerseTracker();
		for (let i = 0; i < 150; i++) {
			tracker.mark(`verse-${i}`);
		}
		// Well under the default cap - nothing should have been evicted yet
		expect(tracker.has('verse-0')).toBe(true);
		expect(tracker.has('verse-149')).toBe(true);
	});
});
