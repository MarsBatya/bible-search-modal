/**
 * Tests for utils/versification.ts
 * Tests the Psalms/Job/Song of Solomon numbering conversion between the
 * Western (KJV) and Synodal/Russian Orthodox (RST) traditions
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { convertVersification } from '../src/utils/versification';
import { getVerse } from '../src/database/queries';
import { DatabaseInstance } from '../src/types';
import { initializeSQL, loadTestDatabase, getDbPath, closeDatabase } from './setup';
import { BOOK_MAPPINGS } from '../src/utils/book-mappings';

describe('convertVersification()', () => {
	describe('books unaffected by russian_numbering', () => {
		it('should pass a reference through unchanged for John', () => {
			const result = convertVersification(BOOK_MAPPINGS.JOHN, 3, 16, false, true);
			expect(result).toEqual({ chapter: 3, verse: 16 });
		});

		it('should pass a reference through unchanged when both sides use the same numbering', () => {
			const result = convertVersification(BOOK_MAPPINGS.PSALMS, 23, 1, false, false);
			expect(result).toEqual({ chapter: 23, verse: 1 });
		});
	});

	describe('Psalms - known correspondence points', () => {
		it('should map KJV Psalm 23 (Shepherd psalm) to RST Psalm 22', () => {
			const result = convertVersification(BOOK_MAPPINGS.PSALMS, 23, 1, false, true);
			expect(result).toEqual({ chapter: 22, verse: 1 });
		});

		it('should map RST Psalm 22 back to KJV Psalm 23', () => {
			const result = convertVersification(BOOK_MAPPINGS.PSALMS, 22, 1, true, false);
			expect(result).toEqual({ chapter: 23, verse: 1 });
		});

		it('should map KJV Psalm 51:1 (Miserere) to RST Psalm 50:3', () => {
			// RST 50:1-2 are two separate superscription verses (choir
			// instruction + the Nathan/Bathsheba backstory) that KJV folds
			// into verse 1 alongside the actual "Have mercy..." content -
			// verified against real text: RST 50:3 = "Помилуй меня, Боже"
			// = KJV 51:1's "Have mercy upon me, O God"
			const result = convertVersification(BOOK_MAPPINGS.PSALMS, 51, 1, false, true);
			expect(result).toEqual({ chapter: 50, verse: 3 });
		});

		it('should leave chapters 1-8 numbered the same in both directions', () => {
			for (let chapter = 1; chapter <= 8; chapter++) {
				const result = convertVersification(BOOK_MAPPINGS.PSALMS, chapter, 1, false, true);
				expect(result?.chapter).toBe(chapter);
			}
		});

		it('should merge KJV Psalms 9-10 into RST Psalm 9', () => {
			// RST Psalm 9 has one extra (superscription) verse at the start,
			// so KJV 9:1 lands at RST 9:2, not 9:1
			const fromPs9 = convertVersification(BOOK_MAPPINGS.PSALMS, 9, 1, false, true);
			expect(fromPs9).toEqual({ chapter: 9, verse: 2 });

			// KJV Psalm 9 has 20 verses; with the +1 superscription offset,
			// KJV Psalm 10 verse 1 continues right after at RST 9:22
			const fromPs10 = convertVersification(BOOK_MAPPINGS.PSALMS, 10, 1, false, true);
			expect(fromPs10).toEqual({ chapter: 9, verse: 22 });
		});

		it('should converge back to the same numbering from Psalm 148 onward', () => {
			for (const chapter of [148, 149, 150]) {
				const result = convertVersification(BOOK_MAPPINGS.PSALMS, chapter, 1, false, true);
				expect(result).toEqual({ chapter, verse: 1 });
			}
		});

		it('should return null past the end of the book', () => {
			const result = convertVersification(BOOK_MAPPINGS.PSALMS, 150, 999, false, true);
			expect(result).toBeNull();
		});

		it('should handle Psalm 13 (RST 12), where a title split is compensated by a merge later in the chapter', () => {
			// RST 12:1 is title-only; KJV 13:1 folds the title together with
			// the first line of content, which is separately RST 12:2 -
			// verified against content: RST 12:2 "Доколе, Господи, будешь
			// забывать меня..." = KJV 13:1's "How long wilt thou forget
			// me...". Both totals are 6, because RST 12:6 then merges what
			// KJV counts as two verses (13:5 and 13:6) back into one - so a
			// single offset for the whole chapter (which would compute to 0
			// here) can't represent this; it needs the explicit override.
			expect(convertVersification(BOOK_MAPPINGS.PSALMS, 13, 1, false, true)).toEqual({ chapter: 12, verse: 2 });
			expect(convertVersification(BOOK_MAPPINGS.PSALMS, 13, 4, false, true)).toEqual({ chapter: 12, verse: 5 });
			expect(convertVersification(BOOK_MAPPINGS.PSALMS, 13, 5, false, true)).toEqual({ chapter: 12, verse: 6 });
			expect(convertVersification(BOOK_MAPPINGS.PSALMS, 13, 6, false, true)).toEqual({ chapter: 12, verse: 6 });

			// Reverse: RST 12:1 (the title) has no KJV counterpart
			expect(convertVersification(BOOK_MAPPINGS.PSALMS, 12, 1, true, false)).toBeNull();
			expect(convertVersification(BOOK_MAPPINGS.PSALMS, 12, 2, true, false)).toEqual({ chapter: 13, verse: 1 });
		});

		it('should handle Psalm 90 (RST 89) the same way, but only for verses 1-6 - the rest of the chapter already lines up 1:1', () => {
			// Same shape as Psalm 13: RST 89:1 is title-only, and RST 89:6
			// merges KJV 90:5 and 90:6 ("as with a flood...like grass" +
			// "in the morning it flourisheth..."). Verified against content.
			expect(convertVersification(BOOK_MAPPINGS.PSALMS, 90, 1, false, true)).toEqual({ chapter: 89, verse: 2 });
			expect(convertVersification(BOOK_MAPPINGS.PSALMS, 90, 5, false, true)).toEqual({ chapter: 89, verse: 6 });
			expect(convertVersification(BOOK_MAPPINGS.PSALMS, 90, 6, false, true)).toEqual({ chapter: 89, verse: 6 });

			// From verse 7 onward, both chapters already line up 1:1 with no
			// offset - the general algorithm handles these correctly
			expect(convertVersification(BOOK_MAPPINGS.PSALMS, 90, 7, false, true)).toEqual({ chapter: 89, verse: 7 });
			expect(convertVersification(BOOK_MAPPINGS.PSALMS, 90, 17, false, true)).toEqual({ chapter: 89, verse: 17 });
		});
	});

	describe('Job - known correspondence points', () => {
		it('should leave chapters 1-38 numbered the same', () => {
			for (const chapter of [1, 10, 20, 38]) {
				const result = convertVersification(BOOK_MAPPINGS.JOB, chapter, 1, false, true);
				expect(result).toEqual({ chapter, verse: 1 });
			}
		});

		it('should re-chapter the whirlwind-speech section (39-41) differently', () => {
			// KJV Job 39 has 30 verses, RST Job 39 has 35 - the chapter
			// boundary in that section falls at a different verse
			const result = convertVersification(BOOK_MAPPINGS.JOB, 40, 1, false, true);
			expect(result).toEqual({ chapter: 39, verse: 31 });
		});

		it('should leave chapter 42 numbered the same again', () => {
			const result = convertVersification(BOOK_MAPPINGS.JOB, 42, 1, false, true);
			expect(result).toEqual({ chapter: 42, verse: 1 });
		});
	});

	describe('Song of Solomon', () => {
		it('should have no RST counterpart for KJV\'s opening title verse', () => {
			// KJV 1:1 "The song of songs, which is Solomon's" isn't numbered
			// as its own verse in RST - verified against content: RST 1:1
			// ("Да лобзает он меня...") = KJV 1:2 ("Let him kiss me...")
			const result = convertVersification(BOOK_MAPPINGS.SONG_OF_SOLOMON, 1, 1, false, true);
			expect(result).toBeNull();
		});

		it('should map KJV 1:2 to RST 1:1', () => {
			const result = convertVersification(BOOK_MAPPINGS.SONG_OF_SOLOMON, 1, 2, false, true);
			expect(result).toEqual({ chapter: 1, verse: 1 });
		});

		it('should move the verse KJV counts as the last of chapter 6 to the start of RST chapter 7', () => {
			// Verified against content: KJV 6:13 "Return, return, O
			// Shulamite" = RST 7:1 "Оглянись, оглянись..."
			const result = convertVersification(BOOK_MAPPINGS.SONG_OF_SOLOMON, 6, 13, false, true);
			expect(result).toEqual({ chapter: 7, verse: 1 });
		});

		it('should shift the rest of chapter 7 by one verse to make room', () => {
			// Verified against content: KJV 7:1 "How beautiful are thy
			// feet" = RST 7:2
			const result = convertVersification(BOOK_MAPPINGS.SONG_OF_SOLOMON, 7, 1, false, true);
			expect(result).toEqual({ chapter: 7, verse: 2 });
		});

		it('should still resolve chapter 8 (after the one-verse content difference)', () => {
			const result = convertVersification(BOOK_MAPPINGS.SONG_OF_SOLOMON, 8, 1, false, true);
			expect(result).not.toBeNull();
			expect(result?.chapter).toBe(8);
		});
	});
});

/**
 * Data-driven validation: for every verse in Psalms/Job/Song of Solomon,
 * map KJV -> RST via convertVersification and compare the Strong's
 * concordance numbers (<S>NNNN</S>) embedded in each verse's text. A
 * correctly-mapped pair should share most of its Strong's numbers (both
 * translations are tagging the same underlying Hebrew words); a mismatched
 * pair - e.g. two unrelated psalms - shares almost none. This also proves
 * the mapping is actually an improvement, by comparing against naive
 * (unmapped, same chapter/verse) pairing.
 */
describe('convertVersification() - validated against real databases', () => {
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

	it('should confirm the info table flags are read correctly', () => {
		expect(kjvDb.russianNumbering).toBe(false);
		expect(rstDb.russianNumbering).toBe(true);
	});

	function extractStrongNumbers(text: string): Set<string> {
		const matches = text.matchAll(/<S>(\d+)<\/S>/gi);
		return new Set(Array.from(matches, (m) => m[1]!));
	}

	function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
		if (a.size === 0 && b.size === 0) return 1;
		let intersection = 0;
		for (const item of a) {
			if (b.has(item)) intersection++;
		}
		const union = a.size + b.size - intersection;
		return union === 0 ? 1 : intersection / union;
	}

	/**
	 * For every verse in the given KJV chapter range, compare Strong's-number
	 * similarity between (a) the mapped RST counterpart and (b) the naive
	 * same-chapter/verse RST verse (no mapping). Returns average similarity
	 * for both, plus how many verses had a mapped counterpart at all.
	 */
	function compareBook(bookNumber: number, chapterCount: number) {
		let mappedTotal = 0;
		let mappedCount = 0;
		let naiveTotal = 0;
		let naiveCount = 0;
		let verseCount = 0;

		for (let chapter = 1; chapter <= chapterCount; chapter++) {
			const verses = [];
			for (let verse = 1; verse <= 200; verse++) {
				const v = getVerse(kjvDb, bookNumber, chapter, verse);
				if (!v) break;
				verses.push(v);
			}

			for (const kjvVerse of verses) {
				verseCount++;
				const kjvStrongs = extractStrongNumbers(kjvVerse.text);

				const mapped = convertVersification(bookNumber, chapter, kjvVerse.verse, false, true);
				if (mapped) {
					const rstVerse = getVerse(rstDb, bookNumber, mapped.chapter, mapped.verse);
					if (rstVerse) {
						mappedTotal += jaccardSimilarity(kjvStrongs, extractStrongNumbers(rstVerse.text));
						mappedCount++;
					}
				}

				const naiveVerse = getVerse(rstDb, bookNumber, chapter, kjvVerse.verse);
				if (naiveVerse) {
					naiveTotal += jaccardSimilarity(kjvStrongs, extractStrongNumbers(naiveVerse.text));
					naiveCount++;
				}
			}
		}

		return {
			verseCount,
			mappedAverage: mappedCount > 0 ? mappedTotal / mappedCount : 0,
			mappedCount,
			naiveAverage: naiveCount > 0 ? naiveTotal / naiveCount : 0,
			naiveCount,
		};
	}

	it('should align Psalms verses with high Strong\'s-number similarity, clearly beating naive same-numbered pairing', () => {
		const { verseCount, mappedAverage, mappedCount, naiveAverage } = compareBook(BOOK_MAPPINGS.PSALMS, 150);

		expect(verseCount).toBeGreaterThan(2000); // sanity check we actually scanned the book
		expect(mappedCount / verseCount).toBeGreaterThan(0.95); // almost every verse should have a counterpart
		expect(mappedAverage).toBeGreaterThan(0.6);
		expect(mappedAverage).toBeGreaterThan(naiveAverage + 0.2); // meaningfully better than no mapping at all
	});

	it('should align Job verses with high Strong\'s-number similarity, clearly beating naive same-numbered pairing', () => {
		const { verseCount, mappedAverage, mappedCount, naiveAverage } = compareBook(BOOK_MAPPINGS.JOB, 42);

		expect(verseCount).toBeGreaterThan(900);
		expect(mappedCount / verseCount).toBeGreaterThan(0.95);
		expect(mappedAverage).toBeGreaterThan(0.6);
		expect(mappedAverage).toBeGreaterThan(naiveAverage);
	});

	it('should align Song of Solomon verses reasonably well, given its one genuine content difference', () => {
		const { verseCount, mappedAverage, mappedCount } = compareBook(BOOK_MAPPINGS.SONG_OF_SOLOMON, 8);

		expect(verseCount).toBeGreaterThan(100);
		// Lower bar than Psalms/Job: one real verse-count mismatch (117 vs
		// 116) means alignment can drift by one verse past that point
		expect(mappedCount / verseCount).toBeGreaterThan(0.85);
		expect(mappedAverage).toBeGreaterThan(0.4);
	});
});
