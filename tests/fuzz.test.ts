/**
 * Tests for utils/fuzz.ts
 * Tests Levenshtein distance, prefix matching, and best-match resolution
 * used for fuzzy Bible book name matching
 */

import { describe, it, expect } from 'vitest';
import { levenshteinDistance, isPrefix, findBestMatch } from '../src/utils/fuzz';

describe('Fuzzy Matching Utilities', () => {
	describe('levenshteinDistance()', () => {
		it('should return 0 for identical strings', () => {
			expect(levenshteinDistance('genesis', 'genesis')).toBe(0);
		});

		it('should return 0 for two empty strings', () => {
			expect(levenshteinDistance('', '')).toBe(0);
		});

		it('should return the length of the other string when one is empty', () => {
			expect(levenshteinDistance('', 'john')).toBe(4);
			expect(levenshteinDistance('john', '')).toBe(4);
		});

		it('should count a single substitution as distance 1', () => {
			expect(levenshteinDistance('john', 'john'.replace('j', 'k'))).toBe(1);
		});

		it('should count a single insertion as distance 1', () => {
			expect(levenshteinDistance('mathew', 'matthew')).toBe(1);
		});

		it('should count a single deletion as distance 1', () => {
			expect(levenshteinDistance('matthew', 'mathew')).toBe(1);
		});

		it('should be symmetric', () => {
			expect(levenshteinDistance('kitten', 'sitting')).toBe(
				levenshteinDistance('sitting', 'kitten')
			);
		});

		it('should compute known distance for "kitten" -> "sitting"', () => {
			expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
		});

		it('should be case-sensitive', () => {
			expect(levenshteinDistance('John', 'john')).toBe(1);
		});
	});

	describe('isPrefix()', () => {
		it('should return true when str1 is a prefix of str2', () => {
			expect(isPrefix('gen', 'genesis')).toBe(true);
		});

		it('should be case-insensitive', () => {
			expect(isPrefix('GEN', 'genesis')).toBe(true);
			expect(isPrefix('gen', 'GENESIS')).toBe(true);
		});

		it('should return false when str1 is not a prefix of str2', () => {
			expect(isPrefix('esis', 'genesis')).toBe(false);
		});

		it('should return true for equal strings', () => {
			expect(isPrefix('genesis', 'genesis')).toBe(true);
		});

		it('should return false when str1 is longer than str2', () => {
			expect(isPrefix('genesisx', 'genesis')).toBe(false);
		});

		it('should return true for an empty prefix', () => {
			expect(isPrefix('', 'genesis')).toBe(true);
		});
	});

	describe('findBestMatch()', () => {
		const candidates = ['Genesis', 'Gen', 'Exodus', 'Exo', 'Matthew', 'Mat', 'John', 'Joh'];

		it('should return null for empty candidate list', () => {
			expect(findBestMatch('gen', [])).toBeNull();
		});

		it('should find an exact match case-insensitively', () => {
			expect(findBestMatch('john', candidates)).toBe('John');
			expect(findBestMatch('JOHN', candidates)).toBe('John');
		});

		it('should prefer prefix matches over Levenshtein when no exact match exists', () => {
			// "Gen" and "Genesis" both start with "Gen" - exact match wins for "Gen"
			expect(findBestMatch('Gen', candidates)).toBe('Gen');
		});

		it('should return the shortest prefix match', () => {
			// "Ge" is a prefix of both "Gen" and "Genesis" - shortest wins
			expect(findBestMatch('Ge', candidates)).toBe('Gen');
		});

		it('should fall back to Levenshtein distance for typos', () => {
			// "Mathew" (missing a 't') is not a prefix of anything, but is 1 edit from "Matthew"
			expect(findBestMatch('Mathew', candidates)).toBe('Matthew');
		});

		it('should return null when nothing is within the distance threshold', () => {
			expect(findBestMatch('zzzzzzzzzzzz', candidates)).toBeNull();
		});

		it('should return null for completely unrelated short input beyond threshold', () => {
			expect(findBestMatch('xyz123!!!', candidates)).toBeNull();
		});
	});
});
