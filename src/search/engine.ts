import { SearchResult, DatabaseInstance } from '../types';
import { detectLanguage } from '../utils/language';
import { parseReference, isKeywordSearch, splitKeywords } from './parser';
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
	let selectedLanguage = language;

	// If the selected database is not loaded, try the other one
	if (!selectedDb || !selectedDb.isLoaded) {
		const otherDb = language === 'KJV' ? rstDb : kjvDb;
		if (otherDb && otherDb.isLoaded) {
			console.warn(
				`[Search] ${language} database not loaded, falling back to ${language === 'KJV' ? 'RST' : 'KJV'}`
			);
			selectedDb = otherDb;
			selectedLanguage = language === 'KJV' ? 'RST' : 'KJV';
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

	console.log(`[Address Search] Query: "${query}", Book#: ${parsed.book_number}, Ch: ${parsed.chapter}, Verses: ${parsed.verseStart}-${parsed.verseEnd}`);

	const results: any[] = [];

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

	// Get parallel verses if enabled
	let parallelResults: any[] | undefined;
	console.log(`[Parallel] showParallel=${showParallel}, results.length=${results.length}, selectedDb=${selectedDb.translation}`);
	if (showParallel && results.length > 0) {
		// Try to get parallel from the other loaded database
		const otherDb = selectedDb.translation === 'KJV' ? rstDb : kjvDb;
		console.log(`[Parallel] Looking for parallel in: ${selectedDb.translation === 'KJV' ? 'RST' : 'KJV'}, loaded=${otherDb?.isLoaded}`);
		if (otherDb?.isLoaded) {
			if (parsed.verseStart !== undefined && parsed.verseEnd !== undefined) {
				parallelResults = getVerseRange(
					otherDb,
					parsed.book_number,
					parsed.chapter!,
					parsed.verseStart,
					parsed.verseEnd
				);
			} else if (parsed.verseStart !== undefined) {
				const verse = getVerse(
					otherDb,
					parsed.book_number,
					parsed.chapter!,
					parsed.verseStart
				);
				if (verse) {
					parallelResults = [verse];
				}
			} else if (parsed.chapter !== undefined) {
				parallelResults = getChapter(otherDb, parsed.book_number, parsed.chapter);
			}
		}
	}

	console.log(`[Address Search] Returning ${results.length} results, ${parallelResults?.length || 0} parallel`);
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

	// Get parallel results if enabled
	let parallelResults: any[] | undefined;
	if (showParallel && results.length > 0) {
		const otherDb = selectedDb.translation === 'KJV' ? rstDb : kjvDb;
		if (otherDb && otherDb.isLoaded) {
			// For keyword search parallel, just search the same keywords in other language
			parallelResults = searchVersesKeyword(otherDb, keywords);
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

/**
 * Clear search cache
 */
export function clearSearchCache(): void {
	searchCache.clear();
}

/**
 * Get search history (stored separately)
 */
let searchHistory: string[] = [];

export function addToSearchHistory(query: string): void {
	// Remove if already exists
	searchHistory = searchHistory.filter((q) => q !== query);
	// Add to front
	searchHistory.unshift(query);
	// Keep only last 50
	if (searchHistory.length > 50) {
		searchHistory = searchHistory.slice(0, 50);
	}
}

export function getSearchHistory(): string[] {
	return [...searchHistory];
}

export function clearSearchHistory(): void {
	searchHistory = [];
}
