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
		it('should serve an identical repeated query from cache without touching the databases', async () => {
			const first = await search('John 3:102', kjvDb, rstDb, false);
			// Same query + same showParallel flag => same cache key.
			// Passing undefined DBs proves the second call never re-queried.
			const second = await search('John 3:102', undefined, undefined, false);
			expect(second).toEqual(first);
		});

		it('should treat different showParallel flags as different cache entries', async () => {
			const withoutParallel = await search('John 4:3', kjvDb, rstDb, false);
			const withParallel = await search('John 4:3', kjvDb, rstDb, true);
			expect(withoutParallel.parallelResults).toBeUndefined();
			expect(withParallel.parallelResults).toBeDefined();
		});
	});
});
