import { ParsedReference } from '../types';
import { BIBLE_BOOKS, REFERENCE_PATTERN } from '../utils/constants';
import { findBestMatch } from '../utils/fuzz';

// Precomputed once since BIBLE_BOOKS is static
const ALL_BOOK_NAMES = [
	...BIBLE_BOOKS.map((b) => b.long_name),
	...BIBLE_BOOKS.map((b) => b.short_name),
];

/**
 * Bible reference parser
 * Parses addresses like "John 3:16", "jn 3 16", "Gen 1:4-5", "Rom 8"
 */

/**
 * Parse a Bible reference string
 * Returns parsed components or null if invalid
 */
export function parseReference(input: string): ParsedReference | null {
	if (!input || typeof input !== 'string') {
		return null;
	}

	const trimmed = input.trim();
	if (trimmed.length === 0) {
		return null;
	}

	// Try to match the reference pattern
	const match = trimmed.match(REFERENCE_PATTERN);
	if (!match) {
		return null;
	}

	const [, bookPart, chapterStr, verseStr] = match;

	// Parse book name
	if (!bookPart) {
		return null;
	}
	const bookName = bookPart.trim();
	const bookNumber = findBookNumber(bookName);

	if (bookNumber === null) {
		return null;
	}

	// Parse chapter
	const chapter = parseInt(chapterStr ?? '', 10);
	if (isNaN(chapter) || chapter < 1 || chapter > 999) {
		return null;
	}

	// Parse verse (if present)
	if (!verseStr) {
		// Only chapter specified: return full chapter
		return {
			book_number: bookNumber,
			bookName: getBookName(bookNumber),
			chapter,
			isRange: false,
		};
	}

	// Parse verse/verse range
	const verseMatch = verseStr.match(/^(\d+)(?:-(\d+))?$/);
	if (!verseMatch) {
		return null;
	}

	const verseStart = parseInt(verseMatch[1] ?? '', 10);
	if (isNaN(verseStart) || verseStart < 1 || verseStart > 999) {
		return null;
	}

	const verseEnd = verseMatch[2] ? parseInt(verseMatch[2], 10) : verseStart;
	if (isNaN(verseEnd) || verseEnd < verseStart || verseEnd > 999) {
		return null;
	}

	return {
		book_number: bookNumber,
		bookName: getBookName(bookNumber),
		chapter,
		verseStart,
		verseEnd,
		isRange: verseStart !== verseEnd,
	};
}

/**
 * Find book number by book name (with fuzzy matching)
 */
function findBookNumber(bookName: string): number | null {
	// Try to find abbreviations in database
	for (const book of BIBLE_BOOKS) {
		for (const abbr of book.abbreviations) {
			if (abbr.toLowerCase() === bookName.toLowerCase()) {
				return book.book_number;
			}
		}
	}

	// Use fuzzy matching on all names
	const match = findBestMatch(bookName, ALL_BOOK_NAMES);
	if (!match) {
		return null;
	}

	// Find the book with this name
	const book = BIBLE_BOOKS.find(
		(b) => b.long_name === match || b.short_name === match
	);

	return book?.book_number ?? null;
}

/**
 * Get book name (long) by book number
 */
function getBookName(bookNumber: number): string {
	const book = BIBLE_BOOKS.find((b) => b.book_number === bookNumber);
	return book?.long_name ?? `Book ${bookNumber}`;
}

/**
 * Check if input looks like a reference (has numbers or known book names)
 */
export function looksLikeReference(input: string): boolean {
	// Must have at least one digit (chapter/verse number)
	if (!/\d/.test(input)) {
		return false;
	}

	// Try to parse it
	return parseReference(input) !== null;
}

/**
 * Check if input is a keyword search
 */
export function isKeywordSearch(input: string): boolean {
	return !looksLikeReference(input);
}

/**
 * Split keyword search into individual words
 */
export function splitKeywords(input: string): string[] {
	return input
		.toLowerCase()
		.trim()
		.split(/\s+/)
		.filter((word) => word.length > 0);
}
