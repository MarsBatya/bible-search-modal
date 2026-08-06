/**
 * Tests for database/queries.ts
 * Tests all query functions without needing Obsidian
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getBooks, getVerse, getChapter, getVerseRange, searchVersesKeyword } from '../src/database/queries';
import { DatabaseInstance } from '../src/types';
import { initializeSQL, loadTestDatabase, getDbPath, closeDatabase } from './setup';
import { isValidVerse, isValidBook } from './test-utils';
import { BOOK_MAPPINGS } from '../src/utils/book-mappings';

describe('Database Queries', () => {
	let kjvDb: DatabaseInstance;
	let rstDb: DatabaseInstance;

	beforeAll(async () => {
		console.log('Initializing test databases...');
		await initializeSQL();
		kjvDb = await loadTestDatabase(getDbPath('KJV'), 'KJV');
		rstDb = await loadTestDatabase(getDbPath('RST'), 'RST');
		console.log('✓ Test databases loaded');
	});

	afterAll(() => {
		closeDatabase(kjvDb);
		closeDatabase(rstDb);
	});

	describe('getBooks()', () => {
		it('should return all books from KJV database', () => {
			const books = getBooks(kjvDb);
			expect(books).toBeDefined();
			expect(books.length).toBe(66);
		});

		it('should return all books from RST database', () => {
			const books = getBooks(rstDb);
			expect(books).toBeDefined();
			expect(books.length).toBe(66);
		});

		it('should have valid book structure', () => {
			const books = getBooks(kjvDb);
			books.forEach((book) => {
				expect(isValidBook(book)).toBe(true);
				expect(book.book_number).toBeDefined();
				expect(book.short_name).toBeDefined();
				expect(book.long_name).toBeDefined();
			});
		});

		it('should have Genesis as first book (book_number 10)', () => {
			const books = getBooks(kjvDb);
			const genesis = books.find((b) => b.book_number === 10);
			expect(genesis).toBeDefined();
			expect(genesis?.short_name).toBe('Gen');
			expect(genesis?.long_name).toBe('Genesis');
		});

		it('should have Revelation as last book', () => {
			const books = getBooks(kjvDb);
			const revelation = books.find((b) => b.book_number === BOOK_MAPPINGS.REVELATION);
			expect(revelation).toBeDefined();
			expect(revelation?.short_name).toBe('Rev');
			expect(revelation?.long_name).toBe('Revelation');
		});

		it('should have matching book numbers in both translations', () => {
			const kjvBooks = getBooks(kjvDb);
			const rstBooks = getBooks(rstDb);
			expect(kjvBooks.length).toBe(rstBooks.length);

			for (let i = 0; i < kjvBooks.length; i++) {
				expect(kjvBooks[i].book_number).toBe(rstBooks[i].book_number);
			}
		});

		it('should have Russian names in RST translation', () => {
			const books = getBooks(rstDb);
			const genesis = books.find((b) => b.book_number === 10);
			expect(genesis?.short_name).toBe('Быт');
			expect(genesis?.long_name).toBe('Бытие');
		});
	});

	describe('getVerse()', () => {
		it('should return Genesis 1:1 from KJV', () => {
			const verse = getVerse(kjvDb, 10, 1, 1);
			expect(verse).toBeDefined();
			expect(verse?.book_number).toBe(10);
			expect(verse?.chapter).toBe(1);
			expect(verse?.verse).toBe(1);
			expect(verse?.book_name_short).toBe('Gen');
			expect(verse?.translation).toBe('KJV');
			expect(verse?.text).toBeDefined();
			expect(verse?.text.length).toBeGreaterThan(0);
		});

		it('should return Genesis 1:1 from RST', () => {
			const verse = getVerse(rstDb, 10, 1, 1);
			expect(verse).toBeDefined();
			expect(verse?.book_number).toBe(10);
			expect(verse?.chapter).toBe(1);
			expect(verse?.verse).toBe(1);
			expect(verse?.book_name_short).toBe('Быт');
			expect(verse?.translation).toBe('RST');
		});

		it('should return John 3:16 from KJV', () => {
			const verse = getVerse(kjvDb, BOOK_MAPPINGS.JOHN, 3, 16);
			expect(verse).toBeDefined();
			expect(verse?.book_number).toBe(BOOK_MAPPINGS.JOHN);
			expect(verse?.chapter).toBe(3);
			expect(verse?.verse).toBe(16);
			expect(verse?.book_name_long).toBe('John');
		});

		it('should return null for non-existent verse', () => {
			const verse = getVerse(kjvDb, 10, 50, 999);
			expect(verse).toBeNull();
		});

		it('should have verse text with markup', () => {
			const verse = getVerse(kjvDb, 10, 1, 1);
			expect(verse?.text).toContain('<');
			expect(verse?.text).toContain('>');
		});

		it('should return valid verse structure', () => {
			const verse = getVerse(kjvDb, 10, 1, 1);
			if (verse) {
				expect(isValidVerse(verse)).toBe(true);
			}
		});

		it('should handle verse 1 correctly', () => {
			const verse = getVerse(kjvDb, BOOK_MAPPINGS.JOHN, 1, 1);
			expect(verse).toBeDefined();
			expect(verse?.verse).toBe(1);
		});

		it('should handle last chapter in book', () => {
			// Genesis has 50 chapters
			const verse = getVerse(kjvDb, 10, 50, 26);
			expect(verse).toBeDefined();
		});
	});

	describe('getChapter()', () => {
		it('should return all verses from Genesis 1', () => {
			const verses = getChapter(kjvDb, 10, 1);
			expect(Array.isArray(verses)).toBe(true);
			expect(verses.length).toBeGreaterThan(0);
		});

		it('should have 31 verses in Genesis 1', () => {
			const verses = getChapter(kjvDb, 10, 1);
			expect(verses.length).toBe(31);
		});

		it('should have verses in correct order', () => {
			const verses = getChapter(kjvDb, 10, 1);
			for (let i = 0; i < verses.length; i++) {
				expect(verses[i].verse).toBe(i + 1);
				expect(verses[i].chapter).toBe(1);
				expect(verses[i].book_number).toBe(10);
			}
		});

		it('should return John 3 with multiple verses', () => {
			const verses = getChapter(kjvDb, BOOK_MAPPINGS.JOHN, 3);
			// Verify chapter returns verses (actual count may vary by translation)
			expect(verses.length).toBeGreaterThan(10);
		});

		it('should work for RST translation', () => {
			const verses = getChapter(rstDb, 10, 1);
			expect(verses.length).toBeGreaterThan(0);
			verses.forEach((v) => {
				expect(v.translation).toBe('RST');
			});
		});

		it('should return empty array for non-existent chapter', () => {
			const verses = getChapter(kjvDb, 10, 999);
			expect(Array.isArray(verses)).toBe(true);
			expect(verses.length).toBe(0);
		});

		it('should have all valid verses', () => {
			const verses = getChapter(kjvDb, 10, 1);
			verses.forEach((v) => {
				expect(isValidVerse(v)).toBe(true);
			});
		});
	});

	describe('getVerseRange()', () => {
		it('should return verses 1-5 from Genesis 1', () => {
			const verses = getVerseRange(kjvDb, 10, 1, 1, 5);
			expect(verses.length).toBe(5);
			expect(verses[0].verse).toBe(1);
			expect(verses[4].verse).toBe(5);
		});

		it('should return single verse when start equals end', () => {
			const verses = getVerseRange(kjvDb, 10, 1, 1, 1);
			expect(verses.length).toBe(1);
			expect(verses[0].verse).toBe(1);
		});

		it('should work for John 3:16-20', () => {
			const verses = getVerseRange(kjvDb, BOOK_MAPPINGS.JOHN, 3, 16, 20);
			expect(verses.length).toBe(5);
			expect(verses[0].verse).toBe(16);
			expect(verses[4].verse).toBe(20);
		});

		it('should work for RST translation', () => {
			const verses = getVerseRange(rstDb, 10, 1, 1, 5);
			expect(verses.length).toBe(5);
			verses.forEach((v) => {
				expect(v.translation).toBe('RST');
			});
		});

		it('should return empty for non-existent range', () => {
			const verses = getVerseRange(kjvDb, 10, 1, 100, 200);
			expect(Array.isArray(verses)).toBe(true);
			expect(verses.length).toBe(0);
		});

		it('should return verses in correct order', () => {
			const verses = getVerseRange(kjvDb, 10, 1, 5, 10);
			for (let i = 0; i < verses.length; i++) {
				expect(verses[i].verse).toBe(5 + i);
			}
		});

		it('should all have same book and chapter', () => {
			const verses = getVerseRange(kjvDb, BOOK_MAPPINGS.JOHN, 3, 10, 20);
			verses.forEach((v) => {
				expect(v.book_number).toBe(BOOK_MAPPINGS.JOHN);
				expect(v.chapter).toBe(3);
			});
		});

		it('should handle large ranges', () => {
			const verses = getVerseRange(kjvDb, 10, 1, 1, 31);
			expect(verses.length).toBe(31);
		});
	});

	describe('searchVersesKeyword()', () => {
		it('should find verses with "grace" keyword in KJV', () => {
			const verses = searchVersesKeyword(kjvDb, ['grace']);
			expect(Array.isArray(verses)).toBe(true);
			expect(verses.length).toBeGreaterThan(0);
			verses.forEach((v) => {
				expect(v.text.toLowerCase()).toContain('grace');
				expect(isValidVerse(v)).toBe(true);
			});
		});

		it('should find verses with "faith" keyword in KJV', () => {
			const verses = searchVersesKeyword(kjvDb, ['faith']);
			expect(verses.length).toBeGreaterThan(0);
			verses.forEach((v) => {
				expect(v.text.toLowerCase()).toContain('faith');
			});
		});

		it('should support multiple keywords with AND logic', () => {
			const verses = searchVersesKeyword(kjvDb, ['grace', 'faith']);
			expect(verses.length).toBeGreaterThan(0);
			verses.forEach((v) => {
				const lowerText = v.text.toLowerCase();
				expect(lowerText).toContain('grace');
				expect(lowerText).toContain('faith');
			});
		});

		it('should work with RST translation', () => {
			const verses = searchVersesKeyword(rstDb, ['благодать']); // "grace" in Russian
			expect(verses.length).toBeGreaterThan(0);
			verses.forEach((v) => {
				expect(v.translation).toBe('RST');
			});
		});

		it('should respect limit parameter', () => {
			const verses = searchVersesKeyword(kjvDb, ['God'], 10);
			expect(verses.length).toBeLessThanOrEqual(10);
		});

		it('should return empty array for non-existent keyword', () => {
			const verses = searchVersesKeyword(kjvDb, ['xyzxyzxyz123456']);
			expect(Array.isArray(verses)).toBe(true);
			expect(verses.length).toBe(0);
		});

		it('should handle case-insensitive search', () => {
			const verses1 = searchVersesKeyword(kjvDb, ['Grace']);
			const verses2 = searchVersesKeyword(kjvDb, ['grace']);
			expect(verses1.length).toBe(verses2.length);
		});

		it('should support partial word matching', () => {
			const verses = searchVersesKeyword(kjvDb, ['God']);
			// "God" appears many times, but default limit is 100
			expect(verses.length).toBeGreaterThan(50);
			expect(verses.length).toBeLessThanOrEqual(100);
		});

		it('should handle empty keywords array', () => {
			const verses = searchVersesKeyword(kjvDb, []);
			expect(Array.isArray(verses)).toBe(true);
			expect(verses.length).toBe(0);
		});

		it('should all have valid verse structure', () => {
			const verses = searchVersesKeyword(kjvDb, ['love']);
			verses.forEach((v) => {
				expect(isValidVerse(v)).toBe(true);
			});
		});
	});

	describe('Cross-database consistency', () => {
		it('should have same book count in both databases', () => {
			const kjvBooks = getBooks(kjvDb);
			const rstBooks = getBooks(rstDb);
			expect(kjvBooks.length).toBe(rstBooks.length);
		});

		it('should have same Genesis 1 verse count in both databases', () => {
			const kjvVerses = getChapter(kjvDb, 10, 1);
			const rstVerses = getChapter(rstDb, 10, 1);
			expect(kjvVerses.length).toBe(rstVerses.length);
		});

		it('should have same total verse count range', () => {
			// KJV has 31102 verses, RST has 31163
			// They should be close but might differ slightly
			const kjvTotalStmt = kjvDb.db.prepare('SELECT COUNT(*) as cnt FROM verses');
			let kjvCount = 0;
			if (kjvTotalStmt.step()) {
				kjvCount = kjvTotalStmt.getAsObject().cnt;
			}
			kjvTotalStmt.free();

			const rstTotalStmt = rstDb.db.prepare('SELECT COUNT(*) as cnt FROM verses');
			let rstCount = 0;
			if (rstTotalStmt.step()) {
				rstCount = rstTotalStmt.getAsObject().cnt;
			}
			rstTotalStmt.free();

			// Should be within 1% of each other
			expect(Math.abs(kjvCount - rstCount) / kjvCount).toBeLessThan(0.01);
		});
	});
});
