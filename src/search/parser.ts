import { ParsedReference } from '../types';
import { BIBLE_BOOKS, REFERENCE_PATTERN } from '../utils/constants';
import { findBestMatch } from '../utils/fuzz';

interface BookCandidateEntry {
	name: string;
	book_number: number;
}

const LATIN_BOOK_ENTRIES: BookCandidateEntry[] = [];
const CYRILLIC_BOOK_ENTRIES: BookCandidateEntry[] = [];

for (const book of BIBLE_BOOKS) {
	LATIN_BOOK_ENTRIES.push({ name: book.long_name, book_number: book.book_number });
	LATIN_BOOK_ENTRIES.push({ name: book.short_name, book_number: book.book_number });

	for (const abbr of book.abbreviations) {
		if (/[а-яёА-ЯЁ]/.test(abbr)) {
			CYRILLIC_BOOK_ENTRIES.push({ name: abbr, book_number: book.book_number });
		} else {
			LATIN_BOOK_ENTRIES.push({ name: abbr, book_number: book.book_number });
		}
	}
}

const LATIN_CANDIDATE_NAMES = Array.from(new Set(LATIN_BOOK_ENTRIES.map((e) => e.name)));
const CYRILLIC_CANDIDATE_NAMES = Array.from(new Set(CYRILLIC_BOOK_ENTRIES.map((e) => e.name)));

/**
 * Bible reference parser
 * Parses addresses like "John 3:16", "jn 3 16", "Gen 1:4-5", "Rom 8", "3Цар 4", "Ин. 3:16"
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
 * Find book number by book name (with exact matching and script-isolated fuzzy matching)
 */
function findBookNumber(bookName: string): number | null {
	const cleaned = bookName.trim().replace(/\.+$/, '').toLowerCase();
	if (!cleaned) return null;

	// Step 1: Exact match against short/long names and abbreviations
	for (const book of BIBLE_BOOKS) {
		if (book.short_name.toLowerCase() === cleaned || book.long_name.toLowerCase() === cleaned) {
			return book.book_number;
		}
		for (const abbr of book.abbreviations) {
			const cleanAbbr = abbr.trim().replace(/\.+$/, '').toLowerCase();
			if (cleanAbbr === cleaned) {
				return book.book_number;
			}
		}
	}

	// Step 2: Fuzzy matching scoped to matching script (Cyrillic vs Latin)
	const isCyrillic = /[а-яёА-ЯЁ]/.test(cleaned);
	const candidates = isCyrillic ? CYRILLIC_CANDIDATE_NAMES : LATIN_CANDIDATE_NAMES;
	const entries = isCyrillic ? CYRILLIC_BOOK_ENTRIES : LATIN_BOOK_ENTRIES;

	const match = findBestMatch(cleaned, candidates);
	if (!match) {
		return null;
	}

	const entry = entries.find((e) => e.name.toLowerCase() === match.toLowerCase());
	return entry?.book_number ?? null;
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
