/**
 * Keyword-search corpus tests.
 *
 * The corpus is an optimization, so the important property is that it returns
 * exactly what a straightforward "visible text" matcher returns: markup
 * stripped, whitespace collapsed, Unicode-lowercased, literal substring
 * matching with AND logic, in canonical book/chapter/verse order.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
	prepareSearchCorpus,
	disposeSearchCorpus,
	normalizeSearchText,
} from '../src/database/corpus';
import {
	searchVersesKeyword,
	searchVersesKeywordAsync,
	KEYWORD_SEARCH_LIMIT,
} from '../src/database/queries';
import { mapRowToVerse, VERSE_SELECT } from '../src/database/rows';
import { search } from '../src/search/engine';
import { DatabaseInstance, Verse } from '../src/types';
import { stripMarkup } from '../src/utils/formatter';
import { initializeSQL, loadTestDatabase, getDbPath, closeDatabase } from './setup';

/** Deliberately naive reference implementation used to validate the corpus. */
function referenceSearch(
	dbInstance: DatabaseInstance,
	keywords: string[],
	limit: number,
	offset: number
): Verse[] {
	const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());
	const stmt = dbInstance.db.prepare(`${VERSE_SELECT} ORDER BY v.book_number, v.chapter, v.verse`);
	const results: Verse[] = [];
	let matched = 0;
	try {
		while (stmt.step()) {
			const verse = mapRowToVerse(stmt.getAsObject(), dbInstance.translation);
			const text = stripMarkup(verse.text).toLowerCase();
			if (!normalizedKeywords.every((keyword) => text.includes(keyword))) continue;
			if (matched < offset) {
				matched++;
				continue;
			}
			matched++;
			results.push(verse);
			if (results.length >= limit) break;
		}
	} finally {
		stmt.free();
	}
	return results;
}

function refs(verses: Verse[]): string[] {
	return verses.map((verse) => `${verse.book_number}:${verse.chapter}:${verse.verse}`);
}

describe('keyword search corpus', () => {
	let kjvDb: DatabaseInstance;
	let rstDb: DatabaseInstance;

	beforeAll(async () => {
		await initializeSQL();
		kjvDb = await loadTestDatabase(getDbPath('KJV'), 'KJV');
		rstDb = await loadTestDatabase(getDbPath('RST'), 'RST');
	});

	afterAll(() => {
		closeDatabase(kjvDb);
		closeDatabase(rstDb);
	});

	it('normalizes visible text only (markup stripped, whitespace collapsed, lowercased)', () => {
		expect(normalizeSearchText('<pb/><S>7225</S>In the <i>Beginning</i>  GOD')).toBe(
			'in the beginning god'
		);
		expect(normalizeSearchText('БЛАГОДАТЬ')).toBe('благодать');
	});

	it('matches the reference visible-text matcher for Latin keyword searches', () => {
		for (const keywords of [['grace'], ['grace', 'faith'], ['earth.'], ['love', 'god']]) {
			expect(refs(searchVersesKeyword(kjvDb, keywords))).toEqual(
				refs(referenceSearch(kjvDb, keywords, KEYWORD_SEARCH_LIMIT, 0))
			);
		}
	});

	it('matches the reference matcher for Cyrillic case and substring searches', () => {
		for (const keywords of [['Иаков'], ['иаков'], ['благодат'], ['господь', 'любовь']]) {
			expect(refs(searchVersesKeyword(rstDb, keywords))).toEqual(
				refs(referenceSearch(rstDb, keywords, KEYWORD_SEARCH_LIMIT, 0))
			);
		}
	});

	it('treats Cyrillic case-insensitively', () => {
		const upper = searchVersesKeyword(rstDb, ['Иаков']);
		const lower = searchVersesKeyword(rstDb, ['иаков']);
		expect(upper.length).toBeGreaterThan(0);
		expect(refs(upper)).toEqual(refs(lower));
	});

	it('treats % and _ as literal characters, not LIKE wildcards', () => {
		expect(searchVersesKeyword(kjvDb, ['%'])).toEqual([]);
		expect(searchVersesKeyword(kjvDb, ['_'])).toEqual([]);
		expect(searchVersesKeyword(rstDb, ['%'])).toEqual([]);
		expect(searchVersesKeyword(rstDb, ['_'])).toEqual([]);
	});

	it('preserves zero and unlimited SQL limits', async () => {
		expect(searchVersesKeyword(kjvDb, ['God'], 0)).toEqual([]);
		expect(await searchVersesKeywordAsync(kjvDb, ['God'], 0)).toEqual([]);
		const all = referenceSearch(kjvDb, ['God'], Number.MAX_SAFE_INTEGER, 0);
		expect(all.length).toBeGreaterThan(KEYWORD_SEARCH_LIMIT);
		expect(searchVersesKeyword(kjvDb, ['God'], -1)).toEqual(all);
		expect(await searchVersesKeywordAsync(kjvDb, ['God'], -1, 100)).toEqual(all.slice(100));
	});

	it('cancels a yielded preparation before touching a closed database', async () => {
		const fresh = await loadTestDatabase(getDbPath('KJV'), 'KJV');
		const callbacks: Array<() => void> = [];
		vi.stubGlobal('window', { setTimeout: (callback: () => void) => callbacks.push(callback) });
		try {
			const prepare = vi.spyOn(fresh.db, 'prepare');
			const pending = prepareSearchCorpus(fresh);
			const rejected = expect(pending).rejects.toThrow('disposed');
			expect(callbacks).toHaveLength(1);
			disposeSearchCorpus(fresh);
			fresh.isLoaded = false;
			fresh.db.close();
			const callsBeforeResume = prepare.mock.calls.length;
			callbacks[0]!();
			await rejected;
			expect(prepare).toHaveBeenCalledTimes(callsBeforeResume);
		} finally {
			vi.unstubAllGlobals();
			if (fresh.isLoaded) closeDatabase(fresh);
		}
	});

	it('does not match hidden Strong numbers or markup', () => {
		expect(refs(searchVersesKeyword(kjvDb, ['<S>']))).toEqual(
			refs(referenceSearch(kjvDb, ['<S>'], KEYWORD_SEARCH_LIMIT, 0))
		);
		expect(searchVersesKeyword(kjvDb, ['7225'])).toEqual(
			referenceSearch(kjvDb, ['7225'], KEYWORD_SEARCH_LIMIT, 0)
		);
	});

	it('paginates identically to the reference matcher without overlap', () => {
		const first = searchVersesKeyword(kjvDb, ['God'], KEYWORD_SEARCH_LIMIT, 0);
		const second = searchVersesKeyword(kjvDb, ['God'], KEYWORD_SEARCH_LIMIT, KEYWORD_SEARCH_LIMIT);

		expect(refs(first)).toEqual(refs(referenceSearch(kjvDb, ['God'], KEYWORD_SEARCH_LIMIT, 0)));
		expect(refs(second)).toEqual(
			refs(referenceSearch(kjvDb, ['God'], KEYWORD_SEARCH_LIMIT, KEYWORD_SEARCH_LIMIT))
		);

		const firstRefs = new Set(refs(first));
		second.forEach((verse) => {
			expect(firstRefs.has(`${verse.book_number}:${verse.chapter}:${verse.verse}`)).toBe(false);
		});
	});

	it('uses the same matching rules through the async engine path', async () => {
		const sync = searchVersesKeyword(kjvDb, ['grace', 'faith']);
		const async = await searchVersesKeywordAsync(kjvDb, ['grace', 'faith']);
		expect(refs(async)).toEqual(refs(sync));

		const engineResult = await search('grace faith', kjvDb, rstDb, false);
		expect(refs(engineResult.results)).toEqual(refs(sync));
	});

	it('deduplicates concurrent preparation and rebuilds after disposal', async () => {
		const fresh = await loadTestDatabase(getDbPath('KJV'), 'KJV');
		try {
			const first = prepareSearchCorpus(fresh);
			const second = prepareSearchCorpus(fresh);
			expect(second).toBe(first);
			await first;

			// Warm corpus is reused.
			expect(prepareSearchCorpus(fresh)).not.toBe(first);
			await expect(prepareSearchCorpus(fresh)).resolves.toBe(await first);

			disposeSearchCorpus(fresh);
			const rebuilt = await prepareSearchCorpus(fresh);
			expect(rebuilt).not.toBe(await first);
			expect(refs(searchVersesKeyword(fresh, ['grace']))).toEqual(
				refs(referenceSearch(fresh, ['grace'], KEYWORD_SEARCH_LIMIT, 0))
			);
		} finally {
			closeDatabase(fresh);
		}
	});

	it('keeps versification mapping intact for parallel lookups', async () => {
		const psalm = await search('Ps 23:1', kjvDb, rstDb, true);
		expect(psalm.parallelResults?.[0]?.chapter).toBe(22);
		expect(psalm.parallelResults?.[0]?.verse).toBe(1);

		const psalmTitle = await search('Ps 51:1', kjvDb, rstDb, true);
		expect(psalmTitle.parallelResults?.[0]?.chapter).toBe(50);
		expect(psalmTitle.parallelResults?.[0]?.verse).toBe(3);

		const job = await search('Job 40:1', kjvDb, rstDb, true);
		expect(job.parallelResults?.[0]?.chapter).toBe(39);
		expect(job.parallelResults?.[0]?.verse).toBe(31);

		const songStart = await search('Song 1:2', kjvDb, rstDb, true);
		expect(songStart.parallelResults?.[0]?.chapter).toBe(1);
		expect(songStart.parallelResults?.[0]?.verse).toBe(1);

		const songSplit = await search('Song 6:13', kjvDb, rstDb, true);
		expect(songSplit.parallelResults?.[0]?.chapter).toBe(7);
		expect(songSplit.parallelResults?.[0]?.verse).toBe(1);
	});
});
