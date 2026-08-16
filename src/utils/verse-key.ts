import { Verse } from '../types';

/**
 * Stable identity for a verse, since Verse objects aren't guaranteed to be
 * the same reference across re-renders or re-searches of "the same" verse
 * (e.g. a fresh search re-fetches from the database, or the same verse
 * shows up again as a keyword-search result and as an address-search
 * result). Used for multi-select picks and for tracking which verses were
 * recently inserted into a note this session.
 */
export function verseKey(verse: Verse): string {
	return `${verse.translation}|${verse.book_number}|${verse.chapter}|${verse.verse}`;
}
