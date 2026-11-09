import { DatabaseInstance, Verse } from '../types';
import { stripMarkup } from '../utils/formatter';
import { VERSE_SELECT, mapRowToVerse } from './rows';

/**
 * Lazily built, per-database in-memory search corpus.
 *
 * Keyword search used to issue a `LIKE '%kw%'` query over the raw verse text,
 * which cannot use an index and also matches inside Strong's numbers and
 * other markup. Building the corpus once per database instance lets every
 * later search be a plain substring scan over normalized, visible text while
 * keeping the original verse objects for formatting and raw output.
 *
 * The corpus is derived state only - it is never persisted and never touches
 * the supplied SQLite files.
 */

export interface CorpusEntry {
	verse: Verse;
	/** Visible text: markup stripped, whitespace collapsed, Unicode-lowercased. */
	normalized: string;
}

export interface SearchCorpus {
	entries: CorpusEntry[];
}

interface CorpusState {
	corpus: SearchCorpus | null;
	promise: Promise<SearchCorpus> | null;
	disposed: boolean;
}

/** Rows read per batch while building the corpus asynchronously. */
const CORPUS_BATCH_SIZE = 2000;

const CORPUS_ORDER = 'ORDER BY v.book_number, v.chapter, v.verse';

const states = new WeakMap<DatabaseInstance, CorpusState>();

function stateFor(dbInstance: DatabaseInstance): CorpusState {
	let state = states.get(dbInstance);
	if (!state) {
		state = { corpus: null, promise: null, disposed: false };
		states.set(dbInstance, state);
	}
	return state;
}

/**
 * Normalize text for matching: strip markup, collapse whitespace (stripMarkup
 * already does both) and Unicode-lowercase so Cyrillic casing matches too.
 */
export function normalizeSearchText(text: string | null | undefined): string {
	return stripMarkup(text).toLowerCase();
}

/**
 * Normalize a search keyword the same way as the corpus text. `%` and `_` are
 * left untouched - they are literal characters here, not LIKE wildcards.
 */
export function normalizeKeyword(keyword: string): string {
	return keyword.toLowerCase();
}

function toEntry(
	row: Record<string, unknown>,
	translation: DatabaseInstance['translation']
): CorpusEntry {
	const verse = mapRowToVerse(row, translation);
	return { verse, normalized: normalizeSearchText(verse.text) };
}

function buildCorpusSync(dbInstance: DatabaseInstance): SearchCorpus {
	const entries: CorpusEntry[] = [];
	let stmt;
	try {
		stmt = dbInstance.db.prepare(`${VERSE_SELECT} ${CORPUS_ORDER}`);
		while (stmt.step()) {
			entries.push(toEntry(stmt.getAsObject(), dbInstance.translation));
		}
	} finally {
		if (stmt) stmt.free();
	}
	return { entries };
}

/** Yield to the event loop so batched preparation doesn't block rendering. */
function yieldToEventLoop(): Promise<void> {
	return new Promise((resolve) => {
		// window timers in Obsidian (popout-window compatibility). Under Node
		// (CLI/tests) there is no window; callers there use the sync path, and
		// resolving immediately is still correct.
		if (typeof window !== 'undefined') {
			window.setTimeout(resolve, 0);
		} else {
			resolve();
		}
	});
}

async function buildCorpusBatched(
	dbInstance: DatabaseInstance,
	state: CorpusState
): Promise<SearchCorpus> {
	const entries: CorpusEntry[] = [];
	let offset = 0;

	for (;;) {
		if (state.disposed) throw new Error('Search corpus was disposed during preparation');
		const batch: CorpusEntry[] = [];
		let stmt;
		try {
			stmt = dbInstance.db.prepare(
				`${VERSE_SELECT} ${CORPUS_ORDER} LIMIT ? OFFSET ?`
			);
			stmt.bind([CORPUS_BATCH_SIZE, offset]);
			while (stmt.step()) {
				batch.push(toEntry(stmt.getAsObject(), dbInstance.translation));
			}
		} finally {
			if (stmt) stmt.free();
		}

		entries.push(...batch);
		offset += batch.length;
		if (batch.length < CORPUS_BATCH_SIZE) break;
		await yieldToEventLoop();
	}

	if (state.disposed) throw new Error('Search corpus was disposed during preparation');
	return { entries };
}

/**
 * Prepare (or reuse) the corpus for a database, yielding to the event loop
 * between batches. Concurrent callers share a single preparation.
 */
export function prepareSearchCorpus(dbInstance: DatabaseInstance): Promise<SearchCorpus> {
	const state = stateFor(dbInstance);
	if (state.corpus) return Promise.resolve(state.corpus);
	if (state.promise) return state.promise;
	if (!dbInstance.isLoaded) return Promise.reject(new Error('Database not loaded'));

	const promise = buildCorpusBatched(dbInstance, state).then(
		(corpus) => {
			if (state.disposed) throw new Error('Search corpus was disposed during preparation');
			// A synchronous caller may have built one in the meantime.
			if (state.corpus) return state.corpus;
			state.corpus = corpus;
			state.promise = null;
			return corpus;
		},
		(error) => {
			state.promise = null;
			throw error;
		}
	);

	state.promise = promise;
	return promise;
}

/**
 * Synchronous lazy preparation for callers that cannot await (the CLI query
 * helpers). Prefer prepareSearchCorpus() in the plugin.
 */
export function getSearchCorpusSync(dbInstance: DatabaseInstance): SearchCorpus {
	const state = stateFor(dbInstance);
	if (state.corpus) return state.corpus;
	if (!dbInstance.isLoaded) throw new Error('Database not loaded');

	const corpus = buildCorpusSync(dbInstance);
	state.corpus = corpus;
	return corpus;
}

/**
 * Release the corpus for a database instance. Called when an instance is
 * replaced or disposed so derived data never outlives its source.
 */
export function disposeSearchCorpus(dbInstance: DatabaseInstance): void {
	const state = states.get(dbInstance);
	if (!state) return;
	state.disposed = true;
	state.corpus = null;
	state.promise = null;
	states.delete(dbInstance);
}

/**
 * Match every keyword (AND logic, literal substring) against the normalized
 * corpus and return the requested page of original verse objects.
 */
export function searchCorpus(
	corpus: SearchCorpus,
	keywords: string[],
	limit: number,
	offset: number
): Verse[] {
	// Preserve SQLite LIMIT semantics used by the synchronous query API:
	// zero returns nothing, while a negative limit means no upper bound.
	if (limit === 0) return [];
	// Longer keywords are rarer, so checking them first short-circuits more.
	const normalizedKeywords = keywords
		.map(normalizeKeyword)
		.filter((keyword) => keyword.length > 0)
		.sort((a, b) => b.length - a.length);

	if (normalizedKeywords.length === 0) return [];

	const verses: Verse[] = [];
	let skipped = 0;

	for (const entry of corpus.entries) {
		if (!normalizedKeywords.every((keyword) => entry.normalized.includes(keyword))) {
			continue;
		}
		if (skipped < offset) {
			skipped++;
			continue;
		}
		verses.push(entry.verse);
		if (limit > 0 && verses.length >= limit) break;
	}

	return verses;
}
