/**
 * Bible Search Modal - Core Exports
 *
 * Exporting core search, versification mapping, database query,
 * and text formatting utilities for use in CLI, external scripts,
 * or standalone tools.
 */

// Types
export type {
	Verse,
	SearchResult,
	DatabaseInstance,
	ParsedReference,
	BookMapping,
	Translation,
	TranslationSelection,
} from './types';
export type { DatabaseStatus, DatabaseStatusState } from './database/status';

// Versification (KJV ⇄ RST mapping for Psalms, Job, Song of Solomon)
export { convertVersification } from './utils/versification';

// Search & Reference Parsing
export { search } from './search/engine';
export {
	parseReference,
	looksLikeReference,
	isKeywordSearch,
	splitKeywords,
} from './search/parser';

// Language Detection (Latin -> KJV, Cyrillic -> RST)
export { detectLanguage } from './utils/language';

// Constants & Book Mappings
export { BIBLE_BOOKS } from './utils/constants';
export { BOOK_MAPPINGS } from './utils/book-mappings';

// Formatting & Markup Stripping
export {
	stripMarkup,
	highlightKeywords,
	formatVerse,
	getDefaultVerseFormat,
	getVersePreview,
} from './utils/formatter';

// Database Queries
export {
	getVerse,
	getVerseRange,
	getChapter,
	getRandomVerse,
	searchVersesKeyword,
	searchVersesKeywordAsync,
	createVerseLookup,
	getRussianNumbering,
	getBooks,
} from './database/queries';

// Keyword search corpus (lazy per-database, derived only - never persisted)
export {
	prepareSearchCorpus,
	getSearchCorpusSync,
	disposeSearchCorpus,
	normalizeSearchText,
} from './database/corpus';
