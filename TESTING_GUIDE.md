# Testing Guide - Bible Search Modal

## Quick Start

```bash
# Install dependencies (if not done)
npm install

# Run tests in watch mode (for development)
npm test

# Run tests once (for CI/production)
npm run test:run
```

**Status: ✅ 101 tests passing**

---

## What Was Created

### 1. **Test Suite** (`tests/` directory)

A comprehensive test suite with **101 tests** covering:

#### Database Query Tests (`database.queries.test.ts`) - 43 tests
- ✅ `getBooks()` - Retrieve all 66 Bible books
- ✅ `getVerse()` - Get single verses by reference
- ✅ `getChapter()` - Get entire chapters
- ✅ `getVerseRange()` - Get verse ranges
- ✅ `searchVersesKeyword()` - Keyword search with AND logic
- ✅ Cross-database consistency (KJV + RST)

#### Database Engine Tests (`database.engine.test.ts`) - 24 tests
- ✅ SQL.js initialization
- ✅ Database loading from file
- ✅ Schema validation (tables, columns, types)
- ✅ Data integrity (row counts, book mappings)
- ✅ Query execution (SELECT, JOIN, WHERE, LIKE, BETWEEN)
- ✅ Prepared statement handling

#### Formatter Tests (`formatter.test.ts`) - 34 tests
- ✅ Markup stripping (`<pb/>`, `<S>`, `<i>` tags)
- ✅ Template validation
- ✅ Verse formatting with variable substitution
- ✅ Keyword highlighting (Latin + Cyrillic)
- ✅ Text preview and truncation

### 2. **Database Documentation** (`DB_INFO.md`)

Complete database schema documentation including:
- Table structures (books, verses, info)
- Sample queries for common operations
- Markup format explanation
- **⚠️ Critical: Correct book number mappings**

### 3. **Book Mappings** (`src/utils/book-mappings.ts`)

Reference file with actual book numbers from database:
```typescript
GENESIS: 10
MATTHEW: 470
JOHN: 500          // NOT 43 or 430!
REVELATION: 730    // NOT 66 or 660!
```

### 4. **Test Infrastructure**

- **setup.ts**: Database loading utilities for tests
- **test-utils.ts**: Helper assertions and validation functions
- **vitest.config.ts**: Test runner configuration
- **tests/README.md**: Detailed test documentation

---

## Key Findings & Important Notes

### 🔴 CRITICAL: Book Number Mapping

**The database uses IRREGULAR book numbering, NOT sequential (1-66)!**

```typescript
// ✅ CORRECT - Use actual book numbers
getVerse(db, 500, 3, 16)        // John 3:16 (book_number = 500)
getVerse(db, 730, 1, 1)         // Revelation 1:1 (book_number = 730)

// ❌ WRONG - Sequential numbering doesn't work
getVerse(db, 43, 3, 16)         // This queries Zephaniah, not John!
getVerse(db, 66, 1, 1)          // This queries nothing!
```

**Complete mapping is in `src/utils/book-mappings.ts`**

### Markup Format in Verses

Verse text contains XML-like markup that must be stripped:

```
<pb/>        → Page break (remove)
<S>7225</S>  → Strong's number (remove)
<i>text</i>  → Italics (keep text, remove tags)
```

Example:
```
Raw:    <pb/>In the beginning<S>7225</S> God<S>430</S> created
Clean:  In the beginning God created
```

### Database Statistics

| Metric | KJV | RST |
|--------|-----|-----|
| File Size | 9.72 MB | 10.84 MB |
| Books | 66 | 66 |
| Verses | 31,102 | 31,163 |
| Tables | 3 (books, verses, info) | 3 (books, verses, info) |

### Test Coverage

- **Database Queries**: All query functions tested with valid and edge cases
- **Both Translations**: All tests run against KJV and RST
- **Error Handling**: Non-existent verses, invalid ranges tested
- **Data Integrity**: Cross-database consistency verified
- **Utilities**: Markup stripping, formatting, highlighting tested

---

## Running Specific Tests

```bash
# Run only formatter tests
npm run test:run -- formatter

# Run only database query tests
npm run test:run -- database.queries

# Run with verbose output
npm run test:run -- --reporter=verbose

# Run with specific test name
npm run test:run -- -t "should find verses with grace"
```

---

## Test Architecture

### Setup Flow

1. **Before All Tests**
   - Initialize sql.js WASM library
   - Load both KJV and RST databases from `pkg/` directory
   - Verify databases are accessible

2. **During Tests**
   - Tests are independent and can run in parallel
   - Each test uses loaded database instances
   - No network calls or file I/O during tests

3. **After All Tests**
   - Close/free database instances
   - Clean up resources

### Test Patterns

```typescript
// Single verse test
it('should return Genesis 1:1', () => {
  const verse = getVerse(kjvDb, 10, 1, 1);
  expect(verse?.text).toBeDefined();
  expect(verse?.book_number).toBe(10);
});

// Multi-verse test
it('should return chapter', () => {
  const verses = getChapter(kjvDb, 10, 1);
  expect(verses.length).toBeGreaterThan(0);
  verses.forEach(v => {
    expect(v.chapter).toBe(1);
  });
});

// Search test
it('should find keyword', () => {
  const verses = searchVersesKeyword(kjvDb, ['grace']);
  expect(verses.length).toBeGreaterThan(0);
  verses.forEach(v => {
    expect(v.text.toLowerCase()).toContain('grace');
  });
});
```

---

## Database Files

Tests use actual SQLite3 database files:
- `pkg/KJV+.SQlite3` - King James Version
- `pkg/RST+.SQlite3` - Russian Synodal Translation

Both databases have identical schema but different verse text and book names.

### Tables

```sql
-- books table (66 rows each)
CREATE TABLE books (
  book_number INTEGER,
  short_name TEXT,
  long_name TEXT,
  book_color TEXT
);

-- verses table (~31,000 rows each)
CREATE TABLE verses (
  book_number NUMERIC,
  chapter NUMERIC,
  verse NUMERIC,
  text TEXT
);

-- info table (metadata)
CREATE TABLE info (
  name TEXT,
  value TEXT
);
```

---

## Refactoring Notes

### What Was Refactored

1. **Book Mappings**
   - Discovered actual book numbers don't follow simple pattern
   - Created `src/utils/book-mappings.ts` with correct mappings
   - Updated documentation with warnings

2. **Test Adjustments**
   - Fixed book number references (John = 500, not 43)
   - Adjusted expectations for actual database contents
   - Improved test descriptions to be more accurate

3. **Documentation**
   - Updated `DB_INFO.md` with correct book numbers
   - Clarified markup format
   - Added query examples

### No Breaking Changes

The actual database query functions (`src/database/queries.ts`) required **no changes**. They work correctly; the issue was test assumptions about book numbering.

---

## Integration with Plugin

When using these query functions in the actual plugin:

```typescript
import { getVerse, getChapter, searchVersesKeyword } from './database/queries';
import { BOOK_MAPPINGS } from './utils/book-mappings';

// ✅ Correct usage in plugin code
const verse = getVerse(dbInstance, BOOK_MAPPINGS.JOHN, 3, 16);
const chapter = getChapter(dbInstance, BOOK_MAPPINGS.GENESIS, 1);
const results = searchVersesKeyword(dbInstance, ['grace', 'love']);
```

---

## Future Test Enhancements

- [ ] Performance benchmarking (query speed metrics)
- [ ] Memory usage monitoring
- [ ] Large dataset tests (full book searches)
- [ ] Concurrency tests (multiple simultaneous queries)
- [ ] Integration tests with Obsidian plugin UI
- [ ] Search parser tests (reference parsing)
- [ ] Language detection tests
- [ ] Cross-reference resolution tests

---

## Troubleshooting

### Tests not finding databases
```bash
# Make sure database files exist
ls -lh pkg/*.SQlite3
# Should show both KJV and RST files

# Run tests from project root
npm run test:run
```

### Specific test failing
```bash
# Run with verbose output to see debug logs
npm run test:run -- --reporter=verbose

# Look for [DB] log lines that show query results
```

### Memory issues with large tests
```bash
# Increase Node.js heap size
NODE_OPTIONS=--max-old-space-size=4096 npm run test:run
```

---

## See Also

- `DB_INFO.md` - Complete database schema documentation
- `tests/README.md` - Detailed test suite documentation
- `PLAN.md` - Original project plan and architecture
- `src/utils/book-mappings.ts` - Book number reference
- `src/database/queries.ts` - Query function implementations

---

Generated: 2026-08-07  
Test Framework: Vitest  
Database: SQLite3 (sql.js)  
Coverage: 101 tests, 100% pass rate
