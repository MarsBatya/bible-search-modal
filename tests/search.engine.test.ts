/**
 * Tests for search/engine.ts
 * Tests the top-level search orchestrator: address vs. keyword dispatch,
 * language-based database routing (with fallback), parallel-translation
 * lookup, and result caching. This is the function the search modal calls
 * directly, so it's the most critical integration point in the plugin.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { search } from '../src/search/engine';
import { DatabaseInstance } from '../src/types';
import { initializeSQL, loadTestDatabase, getDbPath, closeDatabase } from './setup';
import { BOOK_MAPPINGS } from '../src/utils/book-mappings';

describe('Search Engine', () => {
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

	describe('input validation', () => {
		it('should reject an empty query', async () => {
			await expect(search('', kjvDb, rstDb)).rejects.toThrow('Search query cannot be empty');
		});

		it('should reject a whitespace-only query', async () => {
			await expect(search('   ', kjvDb, rstDb)).rejects.toThrow('Search query cannot be empty');
		});
	});

	describe('address search', () => {
		it('should return a single verse for a verse reference', async () => {
			const result = await search('John 3:16', kjvDb, rstDb, false);
			expect(result.isAddressSearch).toBe(true);
			expect(result.sourceDb).toBe('KJV');
			expect(result.results.length).toBe(1);
			expect(result.results[0].book_number).toBe(BOOK_MAPPINGS.JOHN);
			expect(result.results[0].chapter).toBe(3);
			expect(result.results[0].verse).toBe(16);
			expect(result.parallelResults).toBeUndefined();
		});

		it('should return multiple verses for a verse range', async () => {
			const result = await search('Gen 1:4-5', kjvDb, rstDb, false);
			expect(result.results.length).toBe(2);
			expect(result.results[0].verse).toBe(4);
			expect(result.results[1].verse).toBe(5);
		});

		it('should return all verses for a chapter-only reference', async () => {
			const result = await search('Jude 1', kjvDb, rstDb, false);
			// Jude has a single, short chapter - a stable chapter to assert against
			expect(result.results.length).toBeGreaterThan(0);
			result.results.forEach((v) => {
				expect(v.book_number).toBe(BOOK_MAPPINGS.JUDE);
				expect(v.chapter).toBe(1);
			});
		});

		it.each(['Auto', 'KJV', 'RST'] as const)('pins a structured chapter despite %s selection and display text', async (translation) => {
			const result = await search('Ин 3', kjvDb, rstDb, false, 0, {
				translation,
				reference: {
					book_number: BOOK_MAPPINGS.JOHN,
					chapter: 3,
					translation: 'RST',
					book_name_short: 'Ин',
				},
			});
			expect(result.isAddressSearch).toBe(true);
			expect(result.sourceDb).toBe('RST');
			expect(result.results.length).toBeGreaterThan(0);
			result.results.forEach((verse) => {
				expect(verse.translation).toBe('RST');
				expect(verse.book_number).toBe(BOOK_MAPPINGS.JOHN);
				expect(verse.chapter).toBe(3);
			});
		});

		it('should populate parallel results from the other translation when enabled', async () => {
			const result = await search('John 3:16', kjvDb, rstDb, true);
			expect(result.parallelResults).toBeDefined();
			expect(result.parallelResults?.length).toBe(1);
			expect(result.parallelResults?.[0].translation).toBe('RST');
			expect(result.parallelResults?.[0].book_number).toBe(BOOK_MAPPINGS.JOHN);
			expect(result.parallelResults?.[0].chapter).toBe(3);
			expect(result.parallelResults?.[0].verse).toBe(16);
		});

		it('should not populate parallel results when disabled', async () => {
			const result = await search('Romans 8:28', kjvDb, rstDb, false);
			expect(result.parallelResults).toBeUndefined();
		});
	});

	describe('keyword search', () => {
		it('should return keyword results in non-overlapping pages and report when more remain', async () => {
			const first = await search('God', kjvDb, rstDb, false, 0);
			const second = await search('God', kjvDb, rstDb, false, first.results.length);
			const firstKeys = new Set(
				first.results.map((v) => `${v.book_number}:${v.chapter}:${v.verse}`)
			);

			expect(first.results).toHaveLength(100);
			expect(first.isTruncated).toBe(true);
			expect(second.results.length).toBeGreaterThan(0);
			second.results.forEach((v) => {
				expect(firstKeys.has(`${v.book_number}:${v.chapter}:${v.verse}`)).toBe(false);
			});
		});

		it('should route a Latin-text query to KJV and find matches', async () => {
			const result = await search('grace', kjvDb, rstDb, false);
			expect(result.isAddressSearch).toBe(false);
			expect(result.sourceDb).toBe('KJV');
			expect(result.results.length).toBeGreaterThan(0);
			result.results.forEach((v) => {
				expect(v.text.toLowerCase()).toContain('grace');
			});
		});

		it('should route a Cyrillic-text query to RST and find matches', async () => {
			const result = await search('благодать', kjvDb, rstDb, false);
			expect(result.sourceDb).toBe('RST');
			expect(result.results.length).toBeGreaterThan(0);
		});

		it('should apply AND logic across multiple keywords', async () => {
			const result = await search('grace faith', kjvDb, rstDb, false);
			result.results.forEach((v) => {
				const lower = v.text.toLowerCase();
				expect(lower).toContain('grace');
				expect(lower).toContain('faith');
			});
		});

		it('should populate parallel results by verse reference, not by keyword', async () => {
			const result = await search('grace faith', kjvDb, rstDb, true);
			expect(result.parallelResults).toBeDefined();
			expect(result.parallelResults!.length).toBeGreaterThan(0);
			expect(result.parallelResults!.length).toBeLessThanOrEqual(result.results.length);
			// Each parallel verse should correspond by reference to a KJV result
			const kjvRefs = new Set(
				result.results.map((v) => `${v.book_number}:${v.chapter}:${v.verse}`)
			);
			result.parallelResults!.forEach((v) => {
				expect(v.translation).toBe('RST');
				expect(kjvRefs.has(`${v.book_number}:${v.chapter}:${v.verse}`)).toBe(true);
			});
		});
	});

	describe('database fallback', () => {
		it('should fall back to the other database when the detected-language one is unavailable', async () => {
			// "John 3:100" is unique enough to avoid cache collisions with other tests,
			// and is a valid-looking (if nonexistent) address so it still routes as an address search
			const result = await search('John 3:100', undefined, rstDb, false);
			expect(result.sourceDb).toBe('RST');
		});

		it('should throw when no database is available at all', async () => {
			await expect(search('John 3:101', undefined, undefined, false)).rejects.toThrow(
				'No Bible database loaded'
			);
		});
	});

	describe('caching', () => {
		it('should serve an identical repeated query for the same database instances', async () => {
			const first = await search('John 3:102', kjvDb, rstDb, false);
			const second = await search('John 3:102', kjvDb, rstDb, false);
			expect(second).toBe(first);
			await expect(search('John 3:102', undefined, undefined, false)).rejects.toThrow('No Bible database loaded');
		});

		it('invalidates fallback results when the detected database becomes available', async () => {
			const fallback = await search('John 3:103', undefined, rstDb, false);
			const primary = await search('John 3:103', kjvDb, rstDb, false);
			expect(fallback.sourceDb).toBe('RST');
			expect(primary.sourceDb).toBe('KJV');
		});

		it('keeps explicit translation selection separate from Auto', async () => {
			const auto = await search('John 3:16', kjvDb, rstDb, false);
			const explicit = await search('John 3:16', kjvDb, rstDb, false, 0, { translation: 'RST' });
			expect(auto.sourceDb).toBe('KJV');
			expect(explicit.sourceDb).toBe('RST');
		});

		it('does not reuse results after a database instance is replaced', async () => {
			const replacement = await loadTestDatabase(getDbPath('RST'), 'RST');
			try {
				const original = await search('John 3:104', kjvDb, rstDb, true);
				const afterReplacement = await search('John 3:104', kjvDb, replacement, true);
				expect(afterReplacement).not.toBe(original);
			} finally {
				closeDatabase(replacement);
			}
		});

		it('should treat different showParallel flags as different cache entries', async () => {
			const withoutParallel = await search('John 4:3', kjvDb, rstDb, false);
			const withParallel = await search('John 4:3', kjvDb, rstDb, true);
			expect(withoutParallel.parallelResults).toBeUndefined();
			expect(withParallel.parallelResults).toBeDefined();
		});
	});
});
