import initSqlJs from 'sql.js';
import { Verse, BookMapping, DatabaseInstance } from '../types';
import { debug } from '../utils/logger';
import { VERSE_SELECT, mapRowToVerse } from './rows';
import {
	getSearchCorpusSync,
	prepareSearchCorpus,
	searchCorpus,
} from './corpus';

/**
 * Database query functions for Bible content
 */

/**
 * Read the `russian_numbering` flag from a module's `info` table.
 * Used to detect whether this translation numbers Psalms/Job/Song of
 * Solomon using the Synodal (Orthodox) tradition instead of the standard
 * one - see utils/versification.ts. Defaults to false (standard numbering)
 * if the row is missing.
 */
export function getRussianNumbering(db: initSqlJs.Database): boolean {
	let stmt;
	try {
		stmt = db.prepare(`SELECT value FROM info WHERE name = 'russian_numbering'`);
		let result = false;
		if (stmt.step()) {
			const row = stmt.getAsObject() as Record<string, unknown>;
			result = row.value === 'true';
		}
		return result;
	} catch (error) {
		console.error('Error reading russian_numbering flag:', error);
		return false;
	} finally {
		if (stmt) stmt.free();
	}
}

/** Maximum number of keyword matches returned to the search modal. */
export const KEYWORD_SEARCH_LIMIT = 100;

/**
 * Get all books from the database
 */
export function getBooks(dbInstance: DatabaseInstance): BookMapping[] {
	if (!dbInstance.isLoaded) {
		throw new Error('Database not loaded');
	}

	const books: BookMapping[] = [];

	let stmt;
	try {
		stmt = dbInstance.db.prepare(
			'SELECT book_number, short_name, long_name FROM books ORDER BY book_number'
		);

		while (stmt.step()) {
			const row = stmt.getAsObject() as Record<string, unknown>;
			books.push({
				book_number: row.book_number as number,
				short_name: row.short_name as string,
				long_name: row.long_name as string,
				abbreviations: [], // Will be populated by parser
			});
		}
	} catch (error) {
		console.error('Error fetching books:', error);
		throw new Error('Failed to fetch books from database');
	} finally {
		if (stmt) stmt.free();
	}

	return books;
}

/**
 * Get a single verse by reference
 */
export function getVerse(
	dbInstance: DatabaseInstance,
	bookNumber: number,
	chapter: number,
	verse: number
): Verse | null {
	if (!dbInstance.isLoaded) {
		throw new Error('Database not loaded');
	}

	let stmt;
	try {
		stmt = dbInstance.db.prepare(
			`${VERSE_SELECT} WHERE v.book_number = ? AND v.chapter = ? AND v.verse = ?`
		);

		stmt.bind([bookNumber, chapter, verse]);

		if (stmt.step()) {
			const result = mapRowToVerse(stmt.getAsObject(), dbInstance.translation);
			debug(`[DB] Found verse: ${result.book_name_short} ${result.chapter}:${result.verse}`);
			return result;
		}

		debug(`[DB] Verse not found: Book#${bookNumber}, Ch${chapter}:V${verse}`);
		return null;
	} catch (error) {
		console.error('Error fetching verse:', error);
		return null;
	} finally {
		if (stmt) stmt.free();
	}
}

/**
 * Get entire chapter
 */
export function getChapter(
	dbInstance: DatabaseInstance,
	bookNumber: number,
	chapter: number
): Verse[] {
	if (!dbInstance.isLoaded) {
		throw new Error('Database not loaded');
	}

	const verses: Verse[] = [];

	let stmt;
	try {
		debug(`[DB] getChapter: Book#${bookNumber}, Chapter${chapter} from ${dbInstance.translation}`);
		stmt = dbInstance.db.prepare(
			`${VERSE_SELECT} WHERE v.book_number = ? AND v.chapter = ? ORDER BY v.verse`
		);

		stmt.bind([bookNumber, chapter]);

		while (stmt.step()) {
			verses.push(mapRowToVerse(stmt.getAsObject(), dbInstance.translation));
		}

		debug(`[DB] getChapter found ${verses.length} verses`);
	} catch (error) {
		console.error('Error fetching chapter:', error);
	} finally {
		if (stmt) stmt.free();
	}

	return verses;
}

/**
 * Get verse range
 */
export function getVerseRange(
	dbInstance: DatabaseInstance,
	bookNumber: number,
	chapter: number,
	verseStart: number,
	verseEnd: number
): Verse[] {
	if (!dbInstance.isLoaded) {
		throw new Error('Database not loaded');
	}

	const verses: Verse[] = [];

	let stmt;
	try {
		debug(`[DB] getVerseRange: Book#${bookNumber}, Ch${chapter}:${verseStart}-${verseEnd} from ${dbInstance.translation}`);

		stmt = dbInstance.db.prepare(
			`${VERSE_SELECT} WHERE v.book_number = ? AND v.chapter = ? AND v.verse BETWEEN ? AND ? ORDER BY v.verse`
		);

		stmt.bind([bookNumber, chapter, verseStart, verseEnd]);

		while (stmt.step()) {
			verses.push(mapRowToVerse(stmt.getAsObject(), dbInstance.translation));
		}

		debug(`[DB] getVerseRange found ${verses.length} verses`);
	} catch (error) {
		console.error('Error fetching verse range:', error);
	} finally {
		if (stmt) stmt.free();
	}

	return verses;
}

/**
 * Get a uniformly random verse from the database.
 * Picks a random offset in [0, rowCount) and reads that row in rowid order -
 * cheap even for a ~31k row table (a full COUNT(*) plus an indexed offset
 * read, no need to materialize or shuffle anything).
 */
export function getRandomVerse(dbInstance: DatabaseInstance): Verse | null {
	if (!dbInstance.isLoaded) {
		throw new Error('Database not loaded');
	}

	let countStmt;
	let stmt;
	try {
		countStmt = dbInstance.db.prepare('SELECT COUNT(*) as count FROM verses');
		countStmt.step();
		const { count } = countStmt.getAsObject() as Record<string, number>;
		countStmt.free();
		countStmt = undefined;

		if (!count || count <= 0) {
			return null;
		}

		const offset = Math.floor(Math.random() * count);

		stmt = dbInstance.db.prepare(
			`${VERSE_SELECT} ORDER BY v.rowid LIMIT 1 OFFSET ?`
		);
		stmt.bind([offset]);

		let result: Verse | null = null;
		if (stmt.step()) {
			result = mapRowToVerse(stmt.getAsObject(), dbInstance.translation);
		}

		return result;
	} catch (error) {
		console.error('Error fetching random verse:', error);
		return null;
	} finally {
		if (countStmt) countStmt.free();
		if (stmt) stmt.free();
	}
}

/**
 * Search verses by keyword(s)
 * Multiple keywords use AND logic - all must be present
 *
 * Matching runs over the lazily built, normalized in-memory corpus (see
 * database/corpus.ts), so it matches visible verse text rather than hidden
 * markup or Strong's numbers. This synchronous variant lazily builds the
 * corpus on first use, for callers such as the CLI that cannot await.
 */
export function searchVersesKeyword(
	dbInstance: DatabaseInstance,
	keywords: string[],
	limit: number = KEYWORD_SEARCH_LIMIT,
	offset: number = 0
): Verse[] {
	if (!dbInstance.isLoaded) {
		throw new Error('Database not loaded');
	}

	if (keywords.length === 0) {
		return [];
	}

	const startTime = performance.now();
	try {
		const corpus = getSearchCorpusSync(dbInstance);
		const verses = searchCorpus(corpus, keywords, limit, offset);
		debug(
			`[DB Query] Found ${verses.length} verses for keywords: ${keywords.join(', ')} (${(performance.now() - startTime).toFixed(2)}ms)`
		);
		return verses;
	} catch (error) {
		console.error('Error searching verses:', error);
		console.error('Keywords:', keywords);
		return [];
	}
}

/**
 * Async keyword search for the plugin: prepares the corpus in batches that
 * yield to the event loop instead of blocking the UI on first use.
 */
export async function searchVersesKeywordAsync(
	dbInstance: DatabaseInstance,
	keywords: string[],
	limit: number = KEYWORD_SEARCH_LIMIT,
	offset: number = 0
): Promise<Verse[]> {
	if (!dbInstance.isLoaded) {
		throw new Error('Database not loaded');
	}

	if (keywords.length === 0) {
		return [];
	}

	const corpus = await prepareSearchCorpus(dbInstance);
	const verses = searchCorpus(corpus, keywords, limit, offset);
	debug(
		`[DB Query] Found ${verses.length} verses for keywords: ${keywords.join(', ')} (corpus warm)`
	);
	return verses;
}

/**
 * A reusable prepared lookup for single verses by reference. Used for
 * parallel-translation lookups so a whole batch shares one compiled
 * statement instead of compiling one per verse. Callers must free() it.
 */
export interface VerseLookup {
	get(bookNumber: number, chapter: number, verse: number): Verse | undefined;
	free(): void;
}

export function createVerseLookup(dbInstance: DatabaseInstance): VerseLookup {
	if (!dbInstance.isLoaded) {
		throw new Error('Database not loaded');
	}

	const stmt = dbInstance.db.prepare(
		`${VERSE_SELECT} WHERE v.book_number = ? AND v.chapter = ? AND v.verse = ?`
	);
	let freed = false;

	return {
		get(bookNumber: number, chapter: number, verse: number): Verse | undefined {
			if (freed) throw new Error('Verse lookup already freed');
			stmt.bind([bookNumber, chapter, verse]);
			let result: Verse | undefined;
			if (stmt.step()) {
				result = mapRowToVerse(stmt.getAsObject(), dbInstance.translation);
			}
			stmt.reset();
			return result;
		},
		free(): void {
			if (freed) return;
			freed = true;
			stmt.free();
		},
	};
}
