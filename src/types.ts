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
	parallelResults?: Verse[];
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
}
