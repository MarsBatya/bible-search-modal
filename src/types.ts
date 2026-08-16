import initSqlJs from 'sql.js';

/**
 * Core types for Bible Search plugin
 */

/**
 * Represents a Bible verse
 */
export interface Verse {
	book_number: number;
	book_name_short: string;
	book_name_long: string;
	chapter: number;
	verse: number;
	text: string;
	translation: 'KJV' | 'RST';
}

/**
 * Parsed Bible reference (e.g., "John 3:16" or "Gen 1:4-5")
 */
export interface ParsedReference {
	book_number: number | null;
	bookName?: string;
	chapter?: number;
	verseStart?: number;
	verseEnd?: number;
	isRange: boolean;
}

/**
 * Search result containing verses and metadata
 */
export interface SearchResult {
	results: Verse[];
	sourceDb: 'KJV' | 'RST';
	// Index-aligned with `results`: parallelResults[i] is the counterpart of
	// results[i], or undefined if none was found (e.g. no verse exists at
	// that position after versification mapping). Not a separately-collected
	// array, so it can't be paired with `results` by coincidental
	// book/chapter/verse equality - that breaks for Psalms/Job/Song of
	// Solomon, where a correctly-matched pair can have different chapter or
	// verse numbers entirely (see utils/versification.ts).
	parallelResults?: (Verse | undefined)[];
	query: string;
	isAddressSearch: boolean;
}

/**
 * Book mapping for Bible book names
 */
export interface BookMapping {
	book_number: number;
	short_name: string;
	long_name: string;
	abbreviations: string[];
}

/**
 * Database instance wrapper
 */
export interface DatabaseInstance {
	db: initSqlJs.Database;
	translation: 'KJV' | 'RST';
	isLoaded: boolean;
	// From the module's `info` table (`russian_numbering`): true when this
	// translation numbers Psalms/Job/Song of Solomon chapters and verses
	// using the Orthodox/Synodal tradition instead of the standard/Western
	// one. See utils/versification.ts.
	russianNumbering: boolean;
}
