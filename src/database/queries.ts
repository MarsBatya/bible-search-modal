import { Verse, BookMapping, DatabaseInstance } from '../types';

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
			const row = stmt.getAsObject() as any;
			books.push({
				book_number: row.book_number,
				short_name: row.short_name,
				long_name: row.long_name,
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
			`SELECT
				v.book_number, b.short_name, b.long_name, v.chapter, v.verse, v.text
			FROM verses v
			JOIN books b ON v.book_number = b.book_number
			WHERE v.book_number = ? AND v.chapter = ? AND v.verse = ?`
		);

		stmt.bind([bookNumber, chapter, verse]);

		if (stmt.step()) {
			const row = stmt.getAsObject() as any;
			stmt.free();

			const result = {
				book_number: row.book_number,
				book_name_short: row.short_name,
				book_name_long: row.long_name,
				chapter: row.chapter,
				verse: row.verse,
				text: row.text,
				translation: dbInstance.translation,
			};
			console.log(`[DB] Found verse: ${result.book_name_short} ${result.chapter}:${result.verse}`);
			return result;
		}

		console.log(`[DB] Verse not found: Book#${bookNumber}, Ch${chapter}:V${verse}`);
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
		console.log(`[DB] getChapter: Book#${bookNumber}, Chapter${chapter} from ${dbInstance.translation}`);
		const stmt = dbInstance.db.prepare(
			`SELECT
				v.book_number, b.short_name, b.long_name, v.chapter, v.verse, v.text
			FROM verses v
			JOIN books b ON v.book_number = b.book_number
			WHERE v.book_number = ? AND v.chapter = ?
			ORDER BY v.verse`
		);

		stmt.bind([bookNumber, chapter]);

		while (stmt.step()) {
			const row = stmt.getAsObject() as any;
			verses.push({
				book_number: row.book_number,
				book_name_short: row.short_name,
				book_name_long: row.long_name,
				chapter: row.chapter,
				verse: row.verse,
				text: row.text,
				translation: dbInstance.translation,
			});
		}

		console.log(`[DB] getChapter found ${verses.length} verses`);
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
		console.log(`[DB] getVerseRange: Book#${bookNumber}, Ch${chapter}:${verseStart}-${verseEnd} from ${dbInstance.translation}`);
		console.log(`[DB] Query params: [${bookNumber}, ${chapter}, ${verseStart}, ${verseEnd}]`);

		const stmt = dbInstance.db.prepare(
			`SELECT
				v.book_number, b.short_name, b.long_name, v.chapter, v.verse, v.text
			FROM verses v
			JOIN books b ON v.book_number = b.book_number
			WHERE v.book_number = ? AND v.chapter = ? AND v.verse BETWEEN ? AND ?
			ORDER BY v.verse`
		);

		stmt.bind([bookNumber, chapter, verseStart, verseEnd]);

		while (stmt.step()) {
			const row = stmt.getAsObject() as any;
			verses.push({
				book_number: row.book_number,
				book_name_short: row.short_name,
				book_name_long: row.long_name,
				chapter: row.chapter,
				verse: row.verse,
				text: row.text,
				translation: dbInstance.translation,
			});
		}

		console.log(`[DB] getVerseRange found ${verses.length} verses`);
		stmt.free();
	} catch (error) {
		console.error('Error fetching verse range:', error);
	}

	return verses;
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

		const query = `
			SELECT
				v.book_number, b.short_name, b.long_name, v.chapter, v.verse, v.text
			FROM verses v
			JOIN books b ON v.book_number = b.book_number
			WHERE ${whereConditions}
			LIMIT ?
		`;

		console.log('[DB Query] Searching for keywords:', keywords);
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

		while (stmt.step()) {
			const row = stmt.getAsObject() as any;
			verses.push({
				book_number: row.book_number,
				book_name_short: row.short_name || 'Unknown',
				book_name_long: row.long_name || 'Unknown Book',
				chapter: row.chapter,
				verse: row.verse,
				text: row.text || '',
				translation: dbInstance.translation,
			});
		}

		stmt.free();
		console.log(`[DB Query] Found ${verses.length} verses for keywords: ${keywords.join(', ')}`);
	} catch (error) {
		console.error('Error searching verses:', error);
		console.error('Keywords:', keywords);
	}

	return verses;
}

/**
 * Get verse by ID (internal database ID)
 */
export function getVerseById(dbInstance: DatabaseInstance, id: number): Verse | null {
	if (!dbInstance.isLoaded) {
		throw new Error('Database not loaded');
	}

	try {
		const stmt = dbInstance.db.prepare(
			`SELECT
				v.book_number, b.short_name, b.long_name, v.chapter, v.verse, v.text
			FROM verses v
			JOIN books b ON v.book_number = b.book_number
			WHERE v.rowid = ?`
		);

		stmt.bind([id]);

		if (stmt.step()) {
			const row = stmt.getAsObject() as any;
			stmt.free();

			return {
				book_number: row.book_number,
				book_name_short: row.short_name,
				book_name_long: row.long_name,
				chapter: row.chapter,
				verse: row.verse,
				text: row.text,
				translation: dbInstance.translation,
			};
		}

		stmt.free();
		return null;
	} catch (error) {
		console.error('Error fetching verse by ID:', error);
		return null;
	}
}
