import { DatabaseInstance, Verse } from '../types';

/**
 * Shared row mapping for verse queries, used by both the query helpers and
 * the in-memory search corpus.
 */

export const VERSE_SELECT = `
	SELECT
		v.book_number, b.short_name, b.long_name, v.chapter, v.verse, v.text
	FROM verses v
	JOIN books b ON v.book_number = b.book_number
`;

/**
 * Map a raw verse+book joined row (from sql.js's getAsObject()) to a Verse object
 */
export function mapRowToVerse(
	row: Record<string, unknown>,
	translation: DatabaseInstance['translation']
): Verse {
	return {
		book_number: row.book_number as number,
		book_name_short: (row.short_name as string) || 'Unknown',
		book_name_long: (row.long_name as string) || 'Unknown Book',
		chapter: row.chapter as number,
		verse: row.verse as number,
		text: (row.text as string) || '',
		translation,
	};
}
