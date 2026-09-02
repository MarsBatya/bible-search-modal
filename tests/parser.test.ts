/**
 * Tests for search/parser.ts
 * Tests Bible reference parsing (addresses like "John 3:16"), fuzzy book
 * name resolution, and keyword-vs-address classification
 */

import { describe, it, expect } from 'vitest';
import {
	parseReference,
	looksLikeReference,
	isKeywordSearch,
	splitKeywords,
} from '../src/search/parser';
import { BOOK_MAPPINGS } from '../src/utils/book-mappings';

describe('Bible Reference Parser', () => {
	describe('parseReference()', () => {
		it('should parse a single verse reference', () => {
			const result = parseReference('John 3:16');
			expect(result).not.toBeNull();
			expect(result?.book_number).toBe(BOOK_MAPPINGS.JOHN);
			expect(result?.bookName).toBe('John');
			expect(result?.chapter).toBe(3);
			expect(result?.verseStart).toBe(16);
			expect(result?.verseEnd).toBe(16);
			expect(result?.isRange).toBe(false);
		});

		it('should parse an abbreviated reference with space-separated verse', () => {
			const result = parseReference('jn 3 16');
			expect(result).not.toBeNull();
			expect(result?.book_number).toBe(BOOK_MAPPINGS.JOHN);
			expect(result?.chapter).toBe(3);
			expect(result?.verseStart).toBe(16);
		});

		it('should parse a verse range', () => {
			const result = parseReference('Gen 1:4-5');
			expect(result).not.toBeNull();
			expect(result?.book_number).toBe(BOOK_MAPPINGS.GENESIS);
			expect(result?.chapter).toBe(1);
			expect(result?.verseStart).toBe(4);
			expect(result?.verseEnd).toBe(5);
			expect(result?.isRange).toBe(true);
		});

		it('should parse a chapter-only reference', () => {
			const result = parseReference('Rom 8');
			expect(result).not.toBeNull();
			expect(result?.book_number).toBe(BOOK_MAPPINGS.ROMANS);
			expect(result?.chapter).toBe(8);
			expect(result?.verseStart).toBeUndefined();
			expect(result?.verseEnd).toBeUndefined();
			expect(result?.isRange).toBe(false);
		});

		it('should parse a single-word short book name', () => {
			const result = parseReference('Eccl 1:4');
			expect(result).not.toBeNull();
			expect(result?.book_number).toBe(BOOK_MAPPINGS.ECCLESIASTES);
			expect(result?.chapter).toBe(1);
			expect(result?.verseStart).toBe(4);
		});

		it('should parse a numbered multi-word book with a space', () => {
			const result = parseReference('1 Peter 1:1');
			expect(result).not.toBeNull();
			expect(result?.book_number).toBe(BOOK_MAPPINGS.FIRST_PETER);
			expect(result?.chapter).toBe(1);
			expect(result?.verseStart).toBe(1);
		});

		it('should parse a numbered book with no space before the name', () => {
			const result = parseReference('1john 1 1');
			expect(result).not.toBeNull();
			expect(result?.book_number).toBe(BOOK_MAPPINGS.FIRST_JOHN);
		});

		it('should parse a Cyrillic reference', () => {
			const result = parseReference('Ин 3:16');
			expect(result).not.toBeNull();
			expect(result?.book_number).toBe(BOOK_MAPPINGS.JOHN);
			expect(result?.chapter).toBe(3);
			expect(result?.verseStart).toBe(16);
		});

		it('should parse 3Цар (1 Kings in Russian tradition)', () => {
			const result1 = parseReference('3Цар 4');
			expect(result1).not.toBeNull();
			expect(result1?.book_number).toBe(BOOK_MAPPINGS.FIRST_KINGS);
			expect(result1?.chapter).toBe(4);

			const result2 = parseReference('3 Цар 4');
			expect(result2).not.toBeNull();
			expect(result2?.book_number).toBe(BOOK_MAPPINGS.FIRST_KINGS);
			expect(result2?.chapter).toBe(4);

			const result3 = parseReference('3 Цар. 4');
			expect(result3).not.toBeNull();
			expect(result3?.book_number).toBe(BOOK_MAPPINGS.FIRST_KINGS);
			expect(result3?.chapter).toBe(4);
		});

		it('should parse 4Цар (2 Kings in Russian tradition)', () => {
			const result = parseReference('4Цар 2:1');
			expect(result).not.toBeNull();
			expect(result?.book_number).toBe(BOOK_MAPPINGS.SECOND_KINGS);
			expect(result?.chapter).toBe(2);
			expect(result?.verseStart).toBe(1);
		});

		it('should correctly distinguish Ион (Jonah) and Иов (Job)', () => {
			const jonah = parseReference('Ион 3');
			expect(jonah).not.toBeNull();
			expect(jonah?.book_number).toBe(BOOK_MAPPINGS.JONAH);
			expect(jonah?.chapter).toBe(3);

			const job = parseReference('Иов 3');
			expect(job).not.toBeNull();
			expect(job?.book_number).toBe(BOOK_MAPPINGS.JOB);
			expect(job?.chapter).toBe(3);
		});

		it('should parse Russian references with ordinal prefixes and dots', () => {
			const samuel = parseReference('1-я Царств 3:1');
			expect(samuel).not.toBeNull();
			expect(samuel?.book_number).toBe(BOOK_MAPPINGS.FIRST_SAMUEL);
			expect(samuel?.chapter).toBe(3);
			expect(samuel?.verseStart).toBe(1);

			const matthew = parseReference('Мф. 5:3');
			expect(matthew).not.toBeNull();
			expect(matthew?.book_number).toBe(BOOK_MAPPINGS.MATTHEW);
			expect(matthew?.chapter).toBe(5);
			expect(matthew?.verseStart).toBe(3);
		});

		it('should resolve a book name with a typo via fuzzy matching', () => {
			// Missing the second "t" in "Matthew"
			const result = parseReference('Mathew 5:3');
			expect(result).not.toBeNull();
			expect(result?.book_number).toBe(BOOK_MAPPINGS.MATTHEW);
		});

		it('should return the book number for the last book (Revelation)', () => {
			const result = parseReference('Revelation 22:21');
			expect(result?.book_number).toBe(BOOK_MAPPINGS.REVELATION);
		});

		it('should return the book number for the first book (Genesis)', () => {
			const result = parseReference('Genesis 1:1');
			expect(result?.book_number).toBe(BOOK_MAPPINGS.GENESIS);
		});

		it('should return null for empty input', () => {
			expect(parseReference('')).toBeNull();
			expect(parseReference('   ')).toBeNull();
		});

		it('should return null for non-string input', () => {
			// @ts-expect-error testing runtime guard against non-string input
			expect(parseReference(null)).toBeNull();
			// @ts-expect-error testing runtime guard against non-string input
			expect(parseReference(undefined)).toBeNull();
		});

		it('should return null for plain keyword text with no numbers', () => {
			expect(parseReference('grace faith')).toBeNull();
		});

		it('should return null for an unrecognized book name', () => {
			expect(parseReference('Xyzzy 3:16')).toBeNull();
		});

		it('should return null for chapter 0', () => {
			expect(parseReference('John 0:1')).toBeNull();
		});

		it('should return null for a chapter number above the max', () => {
			expect(parseReference('John 1000:1')).toBeNull();
		});

		it('should return null for verse 0', () => {
			expect(parseReference('John 3:0')).toBeNull();
		});

		it('should return null for a reversed verse range', () => {
			expect(parseReference('John 3:16-10')).toBeNull();
		});

		it('should treat equal start/end range as a single (non-range) verse', () => {
			const result = parseReference('John 3:16-16');
			expect(result?.isRange).toBe(false);
			expect(result?.verseStart).toBe(16);
			expect(result?.verseEnd).toBe(16);
		});
	});

	describe('looksLikeReference()', () => {
		it('should return true for a valid address', () => {
			expect(looksLikeReference('John 3:16')).toBe(true);
		});

		it('should return false for text with no digits', () => {
			expect(looksLikeReference('grace faith')).toBe(false);
		});

		it('should return false for digits that do not form a valid address', () => {
			expect(looksLikeReference('123 grace')).toBe(false);
		});
	});

	describe('isKeywordSearch()', () => {
		it('should return true for plain keyword text', () => {
			expect(isKeywordSearch('grace faith')).toBe(true);
		});

		it('should return false for a valid Bible address', () => {
			expect(isKeywordSearch('John 3:16')).toBe(false);
		});
	});

	describe('splitKeywords()', () => {
		it('should split on whitespace and lowercase', () => {
			expect(splitKeywords('Grace FAITH')).toEqual(['grace', 'faith']);
		});

		it('should collapse multiple spaces', () => {
			expect(splitKeywords('grace    faith')).toEqual(['grace', 'faith']);
		});

		it('should trim leading/trailing whitespace', () => {
			expect(splitKeywords('  grace faith  ')).toEqual(['grace', 'faith']);
		});

		it('should return an empty array for empty input', () => {
			expect(splitKeywords('')).toEqual([]);
			expect(splitKeywords('   ')).toEqual([]);
		});

		it('should return a single-element array for a single word', () => {
			expect(splitKeywords('grace')).toEqual(['grace']);
		});
	});
});
