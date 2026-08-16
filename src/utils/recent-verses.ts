/**
 * Tracks which verses were inserted into a note recently (this session),
 * bounded like a small LRU. Deliberately in-memory only, not persisted -
 * see BibleSearchPlugin's use of it, and utils/verse-key.ts for the key
 * format keys are expected to be in.
 */
export class RecentVerseTracker {
	private keys: Set<string> = new Set();

	constructor(private readonly maxSize: number = 200) {}

	/**
	 * Whether this key was marked recently (and hasn't been evicted since)
	 */
	has(key: string): boolean {
		return this.keys.has(key);
	}

	/**
	 * Record a key as recently inserted. Re-marking an already-tracked key
	 * bumps it back to "most recent" (Set iteration order is insertion
	 * order, so delete+re-add moves it to the end), and the oldest key is
	 * evicted once the tracker is over capacity.
	 */
	mark(key: string): void {
		this.keys.delete(key);
		this.keys.add(key);

		if (this.keys.size > this.maxSize) {
			const oldest = this.keys.keys().next().value;
			if (oldest !== undefined) {
				this.keys.delete(oldest);
			}
		}
	}
}
