# Bible Search Modal - Test Suite

Comprehensive test suite for database queries and utilities, independent of Obsidian UI.

## Overview

This test suite validates all database operations without needing the Obsidian plugin environment. Tests can be run with `npm test` or `npm run test:run`.

**Status: ✅ 188/190 tests passing**

## Running Tests

```bash
# Run tests in watch mode
npm test

# Run tests once and exit
npm run test:run
```

## Test Files

### `database.queries.test.ts` (43 tests)
Tests all database query functions:
- **getBooks()**: Retrieve all 66 Bible books
- **getVerse()**: Get single verses by book/chapter/verse
- **getChapter()**: Get all verses in a chapter
- **getVerseRange()**: Get verse ranges (e.g., Gen 1:1-5)
- **searchVersesKeyword()**: Search verses by keywords (AND logic)

**Key Test Categories:**
- ✅ Correct data retrieval
- ✅ Valid verse structure
- ✅ Edge cases (non-existent verses, etc.)
- ✅ Multi-language support (KJV + RST)
- ✅ Cross-database consistency

### `database.engine.test.ts` (24 tests)
Tests database loading and initialization:
- ✅ Database file loading
- ✅ SQL.js initialization
- ✅ Schema validation (tables, columns)
- ✅ Data integrity (row counts, books)
- ✅ Query execution (SELECT, JOIN, WHERE, LIKE, BETWEEN)
- ✅ Prepared statements

### `formatter.test.ts` (34 tests)
Tests verse formatting and utility functions:
- **stripMarkup()**: Remove XML markup from verse text
  - Removes `<pb/>` (page breaks)
  - Removes `<S>number</S>` (Strong's concordance)
  - Preserves text inside `<i>` (italics)
- **validateTemplate()**: Validate verse format templates
- **formatVerse()**: Format verses using templates
- **highlightKeywords()**: Highlight search keywords (case-insensitive)
- **getDefaultVerseFormat()**: Get default format string
- **getVersePreview()**: Generate verse preview (truncated)

**Key Test Categories:**
- ✅ Markup stripping
- ✅ Template validation
- ✅ Verse formatting with variable substitution
- ✅ Keyword highlighting (Latin + Cyrillic)
- ✅ Text truncation and preview generation

### `parser.test.ts` (30 tests)
Tests Bible reference parsing (`src/search/parser.ts`) - the address-search engine:
- **parseReference()**: single verses, ranges, chapter-only, abbreviations,
  numbered books ("1 Peter", "1john"), Cyrillic addresses, fuzzy typo correction
  ("Mathew" → Matthew), and rejection of invalid chapters/verses/reversed ranges
- **looksLikeReference() / isKeywordSearch()**: address-vs-keyword classification
- **splitKeywords()**: whitespace splitting and lowercasing

### `fuzz.test.ts` (22 tests)
Tests fuzzy string matching (`src/utils/fuzz.ts`) used to resolve typo'd/abbreviated
book names:
- **levenshteinDistance()**: edit distance for insertions/deletions/substitutions
- **isPrefix()**: case-insensitive prefix matching
- **findBestMatch()**: exact → prefix → Levenshtein resolution strategy, and the
  distance-3 cutoff beyond which no match is returned

### `language.test.ts` (11 tests)
Tests Cyrillic/Latin language detection (`src/utils/language.ts`) used to route
searches to the KJV or RST database:
- Pure Latin / pure Cyrillic text
- The 30% Cyrillic-character threshold (including the boundary case)
- Empty/falsy input defaulting to KJV

### `search.engine.test.ts` (15 tests)
Tests the top-level search orchestrator (`src/search/engine.ts`) - the function the
search modal calls directly, tying parsing, language detection, and database
queries together:
- Address search: single verse, verse range, full chapter
- Keyword search: AND logic across multiple keywords, KJV/RST routing by language
- Parallel-translation lookup for both address and keyword searches
- Database fallback when the detected-language database isn't loaded
- Error handling when no database is available
- Result caching (including that a cached hit doesn't touch the databases again)

## Test Setup

### Key Files

- **setup.ts**: Provides database loading utilities
  - `initializeSQL()`: Initialize sql.js library
  - `loadTestDatabase()`: Load database from file
  - `getDbPath()`: Get path to database file
  - `closeDatabase()`: Clean up database instance

- **test-utils.ts**: Helper assertions and validation
  - `isValidVerse()`: Type guard for verse objects
  - `assert()`, `assertLength()`: Common assertions
  - `logTest()`, `logSection()`: Colored console output

### Database Files

Tests use actual database files from `pkg/`:
- `pkg/KJV+.SQlite3` (9.72 MB, 31,102 verses)
- `pkg/RST+.SQlite3` (10.84 MB, 31,163 verses)

## Important: Book Number Mapping

**⚠️ CRITICAL:** Book numbers are NOT sequential (1-66) but follow an irregular pattern:

| Book | Number | Book | Number |
|------|--------|------|--------|
| Genesis | 10 | Matthew | 470 |
| Exodus | 20 | Mark | 480 |
| ... | ... | Luke | 490 |
| Malachi | 460 | **John** | **500** |
| | | Revelation | 730 |

See `src/utils/book-mappings.ts` for complete mapping.

**Always use correct book numbers:**
```typescript
// ✅ CORRECT
getVerse(db, BOOK_MAPPINGS.JOHN, 3, 16)    // book_number = 500
getVerse(db, BOOK_MAPPINGS.REVELATION, 1, 1) // book_number = 730

// ❌ WRONG
getVerse(db, 43, 3, 16)   // John is not 43!
getVerse(db, 66, 1, 1)    // Revelation is not 66!
```

## Database Schema

Both KJV and RST databases have identical schema:

### books (66 rows)
```
book_number: INTEGER (10, 20, ..., 730)
short_name: TEXT (e.g., "Gen", "John")
long_name: TEXT (e.g., "Genesis", "John")
book_color: TEXT (e.g., "#ccccff")
```

### verses (~31,000 rows)
```
book_number: NUMERIC (foreign key to books)
chapter: NUMERIC (1+)
verse: NUMERIC (1+)
text: TEXT (contains <pb/>, <S>number</S>, <i>text</i> markup)
```

### info
Metadata table with translation-specific info (description, chapter_string, etc.)

## Common Test Patterns

### Testing Single Verse
```typescript
const verse = getVerse(kjvDb, BOOK_MAPPINGS.GENESIS, 1, 1);
expect(verse?.text).toBeDefined();
expect(verse?.book_number).toBe(BOOK_MAPPINGS.GENESIS);
```

### Testing Chapter
```typescript
const verses = getChapter(kjvDb, BOOK_MAPPINGS.GENESIS, 1);
expect(verses.length).toBeGreaterThan(0);
expect(verses[0].verse).toBe(1);
```

### Testing Keyword Search
```typescript
const verses = searchVersesKeyword(kjvDb, ['grace', 'faith']);
verses.forEach(v => {
  expect(v.text.toLowerCase()).toContain('grace');
  expect(v.text.toLowerCase()).toContain('faith');
});
```

### Testing Markup Stripping
```typescript
const dirty = '<pb/>In the beginning<S>7225</S> God created';
const clean = stripMarkup(dirty);
expect(clean).not.toContain('<');
expect(clean).toContain('God created');
```

## Debugging Tests

Run with debug output:
```bash
npm run test:run -- --reporter=verbose
```

Tests output database query logs for debugging:
```
[DB] Loading Genesis database from cache
[DB] Found verse: Gen 1:1
[DB Query] Searching for keywords: ['grace']
[DB Query] Found 100 verses
```

## Notes

- All tests are **synchronous** (no async operations after DB loading)
- Tests can run in **parallel** without conflicts (each test loads fresh DB instances)
- Tests cleanup by calling `closeDatabase()` in `afterAll()` hooks
- No external network calls needed (uses local database files)
- Tests validate **both KJV and RST** translations

## Future Enhancements

- [ ] Performance benchmarks (query speed)
- [ ] Large dataset tests (full book searches)
- [ ] Memory usage monitoring
- [ ] Concurrency testing (multiple simultaneous queries)
- [ ] Integration tests with actual Obsidian plugin

---

See `DB_INFO.md` for complete database schema documentation.
