/**
 * Versification mapping between the standard/Western verse numbering (used
 * by KJV and most non-Russian translations) and the Synodal/Russian
 * numbering (used by RST and other Orthodox-tradition translations), for
 * the three books where they diverge: Psalms, Job, and Song of Solomon.
 *
 * Background: MyBible-format modules (the format these .sqlite3 databases
 * use) flag this via the `russian_numbering` field in their `info` table.
 * The format spec only defines the flag, not a mapping - it's "an
 * indication that a module references Bible verses using 'Russian
 * translation numbering' for the books of Psalms, Song of Solomon, Job".
 * Consuming apps are expected to supply their own conversion.
 *
 * There are two independent causes of the difference, and both matter:
 *
 * 1. CHAPTER-level merges/splits, at a handful of well-documented points
 *    (e.g. KJV Psalms 9-10 = RST Psalm 9; KJV Psalm 116 = RST Psalms
 *    114-115). This is a small, fixed set of historical correspondences,
 *    hardcoded below as chapter "groups".
 *
 * 2. WITHIN a matched chapter (or group), RST often has one or two extra
 *    verses at the *start* of the chapter, because it counts a psalm's
 *    superscription ("A Psalm of David...") as its own verse, while KJV
 *    folds the superscription into verse 1 alongside the first line of
 *    actual content. This is per-psalm (not every psalm has a
 *    superscription) and does NOT accumulate across chapters - each
 *    chapter's verse numbering restarts at 1 in both systems. Verified
 *    against real content: KJV Psalm 51:1 ("Have mercy upon me, O God...")
 *    matches RST Psalm 50:3, because RST 50:1-2 are two separate
 *    superscription verses (choir instruction + the Nathan/Bathsheba
 *    backstory) with no single-verse KJV counterpart.
 *
 * The per-chapter verse-count arrays below were measured directly from
 * this project's own pkg/KJV+.SQlite3 and pkg/RST+.SQlite3 databases
 * (`SELECT chapter, COUNT(*) ... GROUP BY chapter`), and cross-checked
 * against the SWORD Project's independently-published "Synodal"
 * versification (canon_synodal.h, CrossWire Bible Society) - the Psalms
 * and Job arrays match it exactly.
 *
 * Song of Solomon has one genuine textual difference on top of all this
 * (117 total verses in KJV vs 116 in RST - unlike Psalms/Job, the totals
 * don't match even after accounting for the above). Where the mapping
 * can't resolve a counterpart verse, these functions return null rather
 * than guessing - same as any other verse with no match on the other side.
 */

interface ChapterGroup {
	western: number[];
	synodal: number[];
}

interface VerseRef {
	chapter: number;
	verse: number;
}

/**
 * Explicit verse-level overrides for the two Psalms chapters where the
 * single-offset-per-group model above isn't enough: RST carves out a title
 * verse at the *start* of the chapter (same as the ordinary superscription
 * case), but then compensates by *merging* two verses back together later
 * in the same chapter, so the total verse count nets out to be equal on
 * both sides and `groupOffset()` computes 0 - even though the verses in
 * between are very much not 1:1.
 *
 * Found via the Strong's-number data-driven test below flagging these as
 * low-similarity outliers, then confirmed against actual verse content:
 * - Psalm 13 (RST 12): RST 12:1 is title-only ("Начальнику хора...");
 *   KJV 13:1 folds the title together with the first line of content
 *   ("How long wilt thou forget me") which is separately RST 12:2. RST
 *   12:6 then merges what KJV counts as two verses, 13:5 and 13:6
 *   ("I have trusted...rejoice in thy salvation" + "I will sing unto the
 *   LORD...") into one.
 * - Psalm 90 (RST 89): same shape - RST 89:1 is title-only, KJV 90:1's
 *   content half is RST 89:2, and RST 89:6 merges KJV 90:5 and 90:6
 *   ("as with a flood...like grass" + "in the morning it flourisheth...").
 *   Verses 7 onward in both chapters already line up 1:1 with no offset,
 *   which is why the general algorithm (offset 0) gets those right.
 */
const WESTERN_TO_SYNODAL_VERSE_OVERRIDES: Record<number, Record<number, VerseRef>> = {
	13: {
		1: { chapter: 12, verse: 2 },
		2: { chapter: 12, verse: 3 },
		3: { chapter: 12, verse: 4 },
		4: { chapter: 12, verse: 5 },
		5: { chapter: 12, verse: 6 },
		6: { chapter: 12, verse: 6 },
	},
	90: {
		1: { chapter: 89, verse: 2 },
		2: { chapter: 89, verse: 3 },
		3: { chapter: 89, verse: 4 },
		4: { chapter: 89, verse: 5 },
		5: { chapter: 89, verse: 6 },
		6: { chapter: 89, verse: 6 },
	},
};

/**
 * Reverse of the above (RST chapter -> KJV). RST verse 1 (the title) has
 * no KJV counterpart at all - `null` rather than a guess, same convention
 * as everywhere else in this module. The merged verse (RST 12:6 / 89:6) is
 * mapped back to the earlier of its two KJV sources for a stable 1:1
 * reverse function.
 */
const SYNODAL_TO_WESTERN_VERSE_OVERRIDES: Record<number, Record<number, VerseRef | null>> = {
	12: {
		1: null,
		2: { chapter: 13, verse: 1 },
		3: { chapter: 13, verse: 2 },
		4: { chapter: 13, verse: 3 },
		5: { chapter: 13, verse: 4 },
		6: { chapter: 13, verse: 5 },
	},
	89: {
		1: null,
		2: { chapter: 90, verse: 1 },
		3: { chapter: 90, verse: 2 },
		4: { chapter: 90, verse: 3 },
		5: { chapter: 90, verse: 4 },
		6: { chapter: 90, verse: 5 },
	},
};

/** Job (book_number 220) */
const WESTERN_JOB = [22, 13, 26, 21, 27, 30, 21, 22, 35, 22, 20, 25, 28, 22, 35, 22, 16, 21, 29, 29, 34, 30, 17, 25, 6, 14, 23, 28, 25, 31, 40, 22, 33, 37, 16, 33, 24, 41, 30, 24, 34, 17];
const SYNODAL_JOB = [22, 13, 26, 21, 27, 30, 21, 22, 35, 22, 20, 25, 28, 22, 35, 22, 16, 21, 29, 29, 34, 30, 17, 25, 6, 14, 23, 28, 25, 31, 40, 22, 33, 37, 16, 33, 24, 41, 35, 27, 26, 17];

/** Psalms (book_number 230) */
const WESTERN_PSALMS = [6, 12, 8, 8, 12, 10, 17, 9, 20, 18, 7, 8, 6, 7, 5, 11, 15, 50, 14, 9, 13, 31, 6, 10, 22, 12, 14, 9, 11, 12, 24, 11, 22, 22, 28, 12, 40, 22, 13, 17, 13, 11, 5, 26, 17, 11, 9, 14, 20, 23, 19, 9, 6, 7, 23, 13, 11, 11, 17, 12, 8, 12, 11, 10, 13, 20, 7, 35, 36, 5, 24, 20, 28, 23, 10, 12, 20, 72, 13, 19, 16, 8, 18, 12, 13, 17, 7, 18, 52, 17, 16, 15, 5, 23, 11, 13, 12, 9, 9, 5, 8, 28, 22, 35, 45, 48, 43, 13, 31, 7, 10, 10, 9, 8, 18, 19, 2, 29, 176, 7, 8, 9, 4, 8, 5, 6, 5, 6, 8, 8, 3, 18, 3, 3, 21, 26, 9, 8, 24, 13, 10, 7, 12, 15, 21, 10, 20, 14, 9, 6];
const SYNODAL_PSALMS = [6, 12, 9, 9, 13, 11, 18, 10, 39, 7, 9, 6, 7, 5, 11, 15, 51, 15, 10, 14, 32, 6, 10, 22, 12, 14, 9, 11, 13, 25, 11, 22, 23, 28, 13, 40, 23, 14, 18, 14, 12, 5, 27, 18, 12, 10, 15, 21, 23, 21, 11, 7, 9, 24, 14, 12, 12, 18, 14, 9, 13, 12, 11, 14, 20, 8, 36, 37, 6, 24, 20, 28, 23, 11, 13, 21, 72, 13, 20, 17, 8, 19, 13, 14, 17, 7, 19, 53, 17, 16, 16, 5, 23, 11, 13, 12, 9, 9, 5, 8, 29, 22, 35, 45, 48, 43, 14, 31, 7, 10, 10, 9, 26, 9, 10, 2, 29, 176, 7, 8, 9, 4, 8, 5, 6, 5, 6, 8, 8, 3, 18, 3, 3, 21, 26, 9, 8, 24, 14, 10, 7, 12, 15, 21, 10, 11, 9, 14, 9, 6];

/** Song of Solomon (book_number 260) */
const WESTERN_SONG_OF_SOLOMON = [17, 17, 11, 16, 16, 13, 13, 14];
const SYNODAL_SONG_OF_SOLOMON = [16, 17, 11, 16, 16, 12, 14, 14];

const WESTERN_VERSE_COUNTS: Record<number, number[]> = {
	220: WESTERN_JOB,
	230: WESTERN_PSALMS,
	260: WESTERN_SONG_OF_SOLOMON,
};

const SYNODAL_VERSE_COUNTS: Record<number, number[]> = {
	220: SYNODAL_JOB,
	230: SYNODAL_PSALMS,
	260: SYNODAL_SONG_OF_SOLOMON,
};

/**
 * Resolve which chapter(s) on each side make up the "group" containing a
 * given chapter, for books whose chapters can merge or split. Most chapters
 * are their own single-chapter group; only the historically-documented
 * merge/split points return a multi-chapter group.
 */
function resolveChapterGroup(
	bookNumber: number,
	chapter: number,
	fromRussianNumbering: boolean
): ChapterGroup {
	if (bookNumber === 230) {
		return resolvePsalmGroup(chapter, fromRussianNumbering);
	}
	if (bookNumber === 220) {
		return resolveJobGroup(chapter);
	}
	if (bookNumber === 260) {
		return resolveSongOfSolomonGroup(chapter);
	}
	// Any other book never merges/splits chapters
	return { western: [chapter], synodal: [chapter] };
}

function resolvePsalmGroup(chapter: number, fromRussianNumbering: boolean): ChapterGroup {
	if (!fromRussianNumbering) {
		// chapter is a Western (KJV) chapter number
		if (chapter <= 8) return { western: [chapter], synodal: [chapter] };
		if (chapter <= 10) return { western: [9, 10], synodal: [9] };
		if (chapter <= 113) return { western: [chapter], synodal: [chapter - 1] };
		if (chapter <= 115) return { western: [114, 115], synodal: [113] };
		if (chapter === 116) return { western: [116], synodal: [114, 115] };
		if (chapter <= 146) return { western: [chapter], synodal: [chapter - 1] };
		if (chapter === 147) return { western: [147], synodal: [146, 147] };
		return { western: [chapter], synodal: [chapter] }; // 148-150
	}

	// chapter is a Synodal (RST) chapter number
	if (chapter <= 8) return { western: [chapter], synodal: [chapter] };
	if (chapter === 9) return { western: [9, 10], synodal: [9] };
	if (chapter <= 112) return { western: [chapter + 1], synodal: [chapter] };
	if (chapter === 113) return { western: [114, 115], synodal: [113] };
	if (chapter <= 115) return { western: [116], synodal: [114, 115] };
	if (chapter <= 145) return { western: [chapter + 1], synodal: [chapter] };
	if (chapter <= 147) return { western: [147], synodal: [146, 147] };
	return { western: [chapter], synodal: [chapter] }; // 148-150
}

function resolveJobGroup(chapter: number): ChapterGroup {
	// The only place Job's chapter boundaries fall differently is the
	// whirlwind-speech section - everywhere else is chapter-for-chapter
	if (chapter >= 39 && chapter <= 41) {
		return { western: [39, 40, 41], synodal: [39, 40, 41] };
	}
	return { western: [chapter], synodal: [chapter] };
}

function resolveSongOfSolomonGroup(chapter: number): ChapterGroup {
	// Chapter 1 has a genuine content difference (KJV's opening superscription
	// "The song of songs, which is Solomon's" isn't numbered as its own verse
	// in RST - verified against content: RST 1:1 = KJV 1:2), handled as that
	// chapter's own offset. Chapters 6-7 have a verse that KJV counts as the
	// last verse of chapter 6 ("Return, return, O Shulamite") but RST counts
	// as the first verse of chapter 7 - verified against content - so they
	// need to be resolved together as one group.
	if (chapter === 6 || chapter === 7) {
		return { western: [6, 7], synodal: [6, 7] };
	}
	return { western: [chapter], synodal: [chapter] };
}

/**
 * 1-based overall position of (chapter, verse) within just the chapters
 * listed, given that book's per-chapter verse-count array
 */
function positionWithinGroup(counts: number[], chapters: number[], chapter: number, verse: number): number {
	let position = verse;
	for (const c of chapters) {
		if (c === chapter) break;
		position += counts[c - 1] ?? 0;
	}
	return position;
}

/**
 * (chapter, verse) at a given 1-based position within just the chapters
 * listed. Returns null if the position falls before the first or beyond
 * the last chapter listed (no counterpart verse).
 */
function chapterVerseAtPosition(
	counts: number[],
	chapters: number[],
	position: number
): { chapter: number; verse: number } | null {
	let remaining = position;
	for (const c of chapters) {
		const chapterCount = counts[c - 1] ?? 0;
		if (remaining <= chapterCount) {
			return remaining >= 1 ? { chapter: c, verse: remaining } : null;
		}
		remaining -= chapterCount;
	}
	return null;
}

/**
 * How many more verses the Synodal side of a group has than the Western
 * side - usually 0 (no superscription, or a pure chapter split/merge with
 * no inserted content) or a small positive number (that many superscription
 * verses prepended on the Synodal side). Applied uniformly across the
 * whole group, not per-chapter, since a merged group's extra verses belong
 * to its single Synodal chapter's own title, not to each source chapter.
 */
function groupOffset(westernCounts: number[], synodalCounts: number[], group: ChapterGroup): number {
	const westernSum = group.western.reduce((sum, c) => sum + (westernCounts[c - 1] ?? 0), 0);
	const synodalSum = group.synodal.reduce((sum, c) => sum + (synodalCounts[c - 1] ?? 0), 0);
	return synodalSum - westernSum;
}

/**
 * Convert a (chapter, verse) reference between the standard/Western and
 * Synodal/Russian numbering systems for the given book.
 *
 * Returns the reference unchanged if the two sides use the same numbering,
 * or if the book isn't one of the three affected (only Psalms, Job, and
 * Song of Solomon differ). Returns null if there's no counterpart verse in
 * the target numbering (e.g. a Synodal superscription verse that KJV has
 * no separate verse for).
 */
export function convertVersification(
	bookNumber: number,
	chapter: number,
	verse: number,
	fromRussianNumbering: boolean,
	toRussianNumbering: boolean
): { chapter: number; verse: number } | null {
	if (fromRussianNumbering === toRussianNumbering) {
		return { chapter, verse };
	}

	if (bookNumber === 230) {
		if (!fromRussianNumbering) {
			const override = WESTERN_TO_SYNODAL_VERSE_OVERRIDES[chapter]?.[verse];
			if (override) return override;
		} else {
			const override = SYNODAL_TO_WESTERN_VERSE_OVERRIDES[chapter]?.[verse];
			if (override !== undefined) return override;
		}
	}

	const westernCounts = WESTERN_VERSE_COUNTS[bookNumber];
	const synodalCounts = SYNODAL_VERSE_COUNTS[bookNumber];
	if (!westernCounts || !synodalCounts) {
		// Not one of the three affected books
		return { chapter, verse };
	}

	const group = resolveChapterGroup(bookNumber, chapter, fromRussianNumbering);
	const offset = groupOffset(westernCounts, synodalCounts, group);

	if (!fromRussianNumbering) {
		const position = positionWithinGroup(westernCounts, group.western, chapter, verse) + offset;
		return chapterVerseAtPosition(synodalCounts, group.synodal, position);
	}

	const position = positionWithinGroup(synodalCounts, group.synodal, chapter, verse) - offset;
	return chapterVerseAtPosition(westernCounts, group.western, position);
}
