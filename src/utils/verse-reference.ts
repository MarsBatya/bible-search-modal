import type { ChapterReference, Verse } from '../types';

/**
 * Capture a structured chapter reference from a rendered verse. Only the
 * numeric book number, chapter, and translation are used for lookups; the
 * short book name is kept solely so the search box can show a readable
 * query.
 */
export function chapterReferenceForVerse(verse: Verse): ChapterReference {
	return {
		book_number: verse.book_number,
		chapter: verse.chapter,
		translation: verse.translation,
		book_name_short: verse.book_name_short,
	};
}

/** Human-readable query text for a structured chapter reference. */
export function formatChapterQuery(reference: ChapterReference): string {
	return `${reference.book_name_short} ${reference.chapter}`;
}
