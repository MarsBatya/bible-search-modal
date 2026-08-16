import initSqlJs from 'sql.js';
import { Verse, BookMapping, DatabaseInstance } from '../types';
import { debug } from '../utils/logger';

/**
 * Database query functions for Bible content
 */

/**
 * Capitalize the first character of a string
 * Handles both Latin and Cyrillic characters
 */
function capitalizeFirst(str: string): string {
	if (str.length === 0) return str;
	return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Read the `russian_numbering` flag from a module's `info` table.
 * Used to detect whether this translation numbers Psalms/Job/Song of
 * Solomon using the Synodal (Orthodox) tradition instead of the standard
 * one - see utils/versification.ts. Defaults to false (standard numbering)
 * if the row is missing.
 */
export function getRussianNumbering(db: initSqlJs.Database): boolean {
	try {
		const stmt = db.prepare(`SELECT value FROM info WHERE name = 'russian_numbering'`);
		let result = false;
		if (stmt.step()) {
			const row = stmt.getAsObject() as Record<string, unknown>;
			result = row.value === 'true';
		}
		stmt.free();
		return result;
	} catch (error) {
		console.error('Error reading russian_numbering flag:', error);
		return false;
	}
}

/**
 * Map a raw verse+book joined row (from sql.js's getAsObject()) to a Verse object
 */
function mapRowToVerse(row: Record<string, unknown>, translation: DatabaseInstance['translation']): Verse {
	return {
		book_number: row.book_number as number,
		book_name_short: (row.short_name as string) || 'Unknown',
		book_name_long: (row.long_name as string) || 'Unknown Book',
		chapter: row.chapter as number,
		verse: row.verse as number,
		text: (row.text as string) || '',
		translation,
	};
}

const VERSE_SELECT = `
	SELECT
		v.book_number, b.short_name, b.long_name, v.chapter, v.verse, v.text
	FROM verses v
	JOIN books b ON v.book_number = b.book_number
`;

/**
 * Get all books from the database
 */
export function getBooks(dbInstance: DatabaseInstance): BookMapping[] {
	if (!dbInstance.isLoaded) {
		throw new Error('Database not loaded');
	}

	const books: BookMapping[] = [];

	try {
		const stmt = dbInstance.db.prepare(
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
		stmt.free();
	} catch (error) {
		console.error('Error fetching books:', error);
		throw new Error('Failed to fetch books from database');
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

	try {
		const stmt = dbInstance.db.prepare(
			`${VERSE_SELECT} WHERE v.book_number = ? AND v.chapter = ? AND v.verse = ?`
		);

		stmt.bind([bookNumber, chapter, verse]);

		if (stmt.step()) {
			const result = mapRowToVerse(stmt.getAsObject(), dbInstance.translation);
			stmt.free();
			debug(`[DB] Found verse: ${result.book_name_short} ${result.chapter}:${result.verse}`);
			return result;
		}

		debug(`[DB] Verse not found: Book#${bookNumber}, Ch${chapter}:V${verse}`);
		stmt.free();
		return null;
	} catch (error) {
		console.error('Error fetching verse:', error);
		return null;
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

	try {
		debug(`[DB] getChapter: Book#${bookNumber}, Chapter${chapter} from ${dbInstance.translation}`);
		const stmt = dbInstance.db.prepare(
			`${VERSE_SELECT} WHERE v.book_number = ? AND v.chapter = ? ORDER BY v.verse`
		);

		stmt.bind([bookNumber, chapter]);

		while (stmt.step()) {
			verses.push(mapRowToVerse(stmt.getAsObject(), dbInstance.translation));
		}

		debug(`[DB] getChapter found ${verses.length} verses`);
		stmt.free();
	} catch (error) {
		console.error('Error fetching chapter:', error);
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

	try {
		debug(`[DB] getVerseRange: Book#${bookNumber}, Ch${chapter}:${verseStart}-${verseEnd} from ${dbInstance.translation}`);

		const stmt = dbInstance.db.prepare(
			`${VERSE_SELECT} WHERE v.book_number = ? AND v.chapter = ? AND v.verse BETWEEN ? AND ? ORDER BY v.verse`
		);

		stmt.bind([bookNumber, chapter, verseStart, verseEnd]);

		while (stmt.step()) {
			verses.push(mapRowToVerse(stmt.getAsObject(), dbInstance.translation));
		}

		debug(`[DB] getVerseRange found ${verses.length} verses`);
		stmt.free();
	} catch (error) {
		console.error('Error fetching verse range:', error);
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

	try {
		const countStmt = dbInstance.db.prepare('SELECT COUNT(*) as count FROM verses');
		countStmt.step();
		const { count } = countStmt.getAsObject() as Record<string, number>;
		countStmt.free();

		if (!count || count <= 0) {
			return null;
		}

		const offset = Math.floor(Math.random() * count);

		const stmt = dbInstance.db.prepare(
			`${VERSE_SELECT} ORDER BY v.rowid LIMIT 1 OFFSET ?`
		);
		stmt.bind([offset]);

		let result: Verse | null = null;
		if (stmt.step()) {
			result = mapRowToVerse(stmt.getAsObject(), dbInstance.translation);
		}
		stmt.free();

		return result;
	} catch (error) {
		console.error('Error fetching random verse:', error);
		return null;
	}
}

/**
 * Search verses by keyword(s)
 * Multiple keywords use AND logic - all must be present
 */
export function searchVersesKeyword(
	dbInstance: DatabaseInstance,
	keywords: string[],
	limit: number = 100
): Verse[] {
	if (!dbInstance.isLoaded) {
		throw new Error('Database not loaded');
	}

	if (keywords.length === 0) {
		return [];
	}

	const verses: Verse[] = [];
	const startTime = performance.now();

	try {
		// Build WHERE clause with LIKE conditions for each keyword
		// Note: sql.js UPPER() doesn't work for Cyrillic, so we use case-insensitive approach
		// by searching for both original and capitalized versions of keywords
		const whereConditions = keywords
			.map((kw) => {
				// For Cyrillic text, capitalize the first letter to match database
				const capitalized = capitalizeFirst(kw);
				// Create OR condition: match either the keyword as-is or capitalized
				// This handles both "иаков" -> "Иаков" and "grace" searches
				if (capitalized !== kw) {
					return `(v.text LIKE ? OR v.text LIKE ?)`;
				}
				return `v.text LIKE ?`;
			})
			.join(' AND ');

		const query = `${VERSE_SELECT} WHERE ${whereConditions} LIMIT ?`;

		debug('[DB Query] Searching for keywords:', keywords);
		const stmt = dbInstance.db.prepare(query);

		// Bind keywords with wildcard matching (%keyword%)
		// For Cyrillic, add both lowercase and capitalized versions
		const params: (string | number)[] = [];
		for (const kw of keywords) {
			const capitalized = capitalizeFirst(kw);
			params.push(`%${kw}%`);
			if (capitalized !== kw) {
				params.push(`%${capitalized}%`);
			}
		}
		params.push(limit);

		stmt.bind(params);

		const rowStartTime = performance.now();
		while (stmt.step()) {
			verses.push(mapRowToVerse(stmt.getAsObject(), dbInstance.translation));
		}
		const rowTime = performance.now() - rowStartTime;

		stmt.free();
		const totalTime = performance.now() - startTime;
		debug(`[DB Query] Found ${verses.length} verses for keywords: ${keywords.join(', ')} (${totalTime.toFixed(2)}ms total, ${rowTime.toFixed(2)}ms rows)`);
	} catch (error) {
		console.error('Error searching verses:', error);
		console.error('Keywords:', keywords);
	}

	return verses;
}
