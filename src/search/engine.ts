import { SearchResult, DatabaseInstance, Verse } from '../types';
import { detectLanguage } from '../utils/language';
import { parseReference, splitKeywords } from './parser';
import { convertVersification } from '../utils/versification';
import { debug } from '../utils/logger';
import {
	getVerse,
	getChapter,
	getVerseRange,
	searchVersesKeyword,
} from '../database/queries';

/**
 * Bible Search Engine
 * Orchestrates reference parsing, language detection, and database querying
 */

/**
 * Cache for recent searches to avoid re-querying
 */
class SearchCache {
	private cache: Map<string, SearchResult> = new Map();
	private maxSize: number = 100;

	get(key: string): SearchResult | undefined {
		return this.cache.get(key);
	}

	set(key: string, value: SearchResult): void {
		if (this.cache.size >= this.maxSize) {
			// Remove oldest entry
			const firstKey = this.cache.keys().next().value;
			if (firstKey) {
				this.cache.delete(firstKey);
			}
		}
		this.cache.set(key, value);
	}

	clear(): void {
		this.cache.clear();
	}
}

const searchCache = new SearchCache();

/**
 * Perform search on a query
 */
export async function search(
	query: string,
	kjvDb: DatabaseInstance | undefined,
	rstDb: DatabaseInstance | undefined,
	showParallel: boolean = false,
	stripMarkup: boolean = true
): Promise<SearchResult> {
	if (!query || !query.trim()) {
		throw new Error('Search query cannot be empty');
	}

	const trimmedQuery = query.trim();

	// Check cache
	const cacheKey = `${trimmedQuery}|${showParallel}`;
	const cached = searchCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	// Detect language
	const language = detectLanguage(trimmedQuery);

	// Select database - try the detected language first, then fallback to the other
	let selectedDb = language === 'KJV' ? kjvDb : rstDb;

	// If the selected database is not loaded, try the other one
	if (!selectedDb || !selectedDb.isLoaded) {
		const otherDb = language === 'KJV' ? rstDb : kjvDb;
		if (otherDb && otherDb.isLoaded) {
			console.warn(
				`[Search] ${language} database not loaded, falling back to ${language === 'KJV' ? 'RST' : 'KJV'}`
			);
			selectedDb = otherDb;
		} else {
			throw new Error(
				`No Bible database loaded. Please download KJV and/or RST databases in settings.`
			);
		}
	}

	let result: SearchResult;

	// Determine if this is address search or keyword search
	if (parseReference(trimmedQuery)) {
		// Address search - always try both databases for parallel
		result = addressSearch(trimmedQuery, selectedDb, rstDb, kjvDb, showParallel);
	} else {
		// Keyword search - always try both databases for parallel
		const keywords = splitKeywords(trimmedQuery);
		result = keywordSearch(trimmedQuery, keywords, selectedDb, rstDb, kjvDb, showParallel);
	}

	// Cache result
	searchCache.set(cacheKey, result);

	return result;
}

/**
 * Resolve the "other" translation's database, used for parallel-verse lookups
 */
function resolveOtherDb(
	selectedDb: DatabaseInstance,
	rstDb: DatabaseInstance | undefined,
	kjvDb: DatabaseInstance | undefined
): DatabaseInstance | undefined {
	return selectedDb.translation === 'KJV' ? rstDb : kjvDb;
}

/**
 * Find a verse's counterpart in the other translation, accounting for the
 * Psalms/Job/Song of Solomon numbering difference between the Western and
 * Synodal (Russian Orthodox) traditions (see utils/versification.ts).
 * Returns undefined if no counterpart verse exists.
 */
function getParallelVerse(verse: Verse, otherDb: DatabaseInstance): Verse | undefined {
	const mapped = convertVersification(
		verse.book_number,
		verse.chapter,
		verse.verse,
		verse.translation === 'RST',
		otherDb.russianNumbering
	);
	if (!mapped) {
		return undefined;
	}
	return getVerse(otherDb, verse.book_number, mapped.chapter, mapped.verse) ?? undefined;
}

/**
 * Find the counterpart of each verse in `verses` within `otherDb`, in the
 * same order - index-aligned with `verses` (see SearchResult.parallelResults)
 */
function getParallelVerses(verses: Verse[], otherDb: DatabaseInstance): (Verse | undefined)[] {
	return verses.map((verse) => getParallelVerse(verse, otherDb));
}

/**
 * Search by Bible address (e.g., "John 3:16")
 */
function addressSearch(
	query: string,
	selectedDb: DatabaseInstance,
	rstDb: DatabaseInstance | undefined,
	kjvDb: DatabaseInstance | undefined,
	showParallel: boolean
): SearchResult {
	const parsed = parseReference(query);
	if (!parsed || parsed.book_number === null) {
		throw new Error('Invalid Bible reference');
	}

	debug(`[Address Search] Query: "${query}", Book#: ${parsed.book_number}, Ch: ${parsed.chapter}, Verses: ${parsed.verseStart}-${parsed.verseEnd}`);

	const results: Verse[] = [];

	if (parsed.verseStart !== undefined && parsed.verseEnd !== undefined) {
		// Get verse range
		const verses = getVerseRange(
			selectedDb,
			parsed.book_number,
			parsed.chapter!,
			parsed.verseStart,
			parsed.verseEnd
		);
		results.push(...verses);
	} else if (parsed.verseStart !== undefined) {
		// Get single verse
		const verse = getVerse(
			selectedDb,
			parsed.book_number,
			parsed.chapter!,
			parsed.verseStart
		);
		if (verse) {
			results.push(verse);
		}
	} else if (parsed.chapter !== undefined) {
		// Get full chapter
		const verses = getChapter(selectedDb, parsed.book_number, parsed.chapter);
		results.push(...verses);
	}

	// Get parallel verses if enabled. Each verse is mapped individually
	// (rather than fetching a single target chapter/range) so that a source
	// chapter or range spanning a Psalms/Job merge-or-split boundary on the
	// other side still resolves correctly verse-by-verse.
	let parallelResults: (Verse | undefined)[] | undefined;
	debug(`[Parallel] showParallel=${showParallel}, results.length=${results.length}, selectedDb=${selectedDb.translation}`);
	if (showParallel && results.length > 0) {
		const otherDb = resolveOtherDb(selectedDb, rstDb, kjvDb);
		debug(`[Parallel] Looking for parallel in: ${selectedDb.translation === 'KJV' ? 'RST' : 'KJV'}, loaded=${otherDb?.isLoaded}`);
		if (otherDb?.isLoaded) {
			parallelResults = getParallelVerses(results, otherDb);
		}
	}

	debug(`[Address Search] Returning ${results.length} results, ${parallelResults?.filter(Boolean).length || 0} parallel`);
	return {
		results,
		sourceDb: selectedDb.translation,
		parallelResults,
		query,
		isAddressSearch: true,
	};
}

/**
 * Search by keywords
 */
function keywordSearch(
	query: string,
	keywords: string[],
	selectedDb: DatabaseInstance,
	rstDb: DatabaseInstance | undefined,
	kjvDb: DatabaseInstance | undefined,
	showParallel: boolean
): SearchResult {
	const results = searchVersesKeyword(selectedDb, keywords);

	// Get parallel results if enabled. For keyword search parallel, fetch by
	// reference (mapped through the versification table when needed) rather
	// than by keyword, since the keywords are in the source language.
	let parallelResults: (Verse | undefined)[] | undefined;
	if (showParallel && results.length > 0) {
		const otherDb = resolveOtherDb(selectedDb, rstDb, kjvDb);
		if (otherDb && otherDb.isLoaded) {
			parallelResults = getParallelVerses(results, otherDb);
		}
	}

	return {
		results,
		sourceDb: selectedDb.translation,
		parallelResults,
		query,
		isAddressSearch: false,
	};
}
