# Bible Search Plugin - Development Guide

This document provides guidance for developers working on the Bible Search plugin.

## Project Overview

Bible Search is an Obsidian plugin that enables inline Bible verse searching with bilingual support (KJV + RST). The plugin uses sql.js for WASM-based SQLite database access, allowing it to work on both desktop and mobile platforms.

## Architecture

### Core Components

#### Database Layer (`src/database/`)
- **engine.ts**: Manages sql.js initialization and database lifecycle
  - `DatabaseEngine` class: Handles loading, fetching, and caching databases
  - Singleton pattern: `getEngineInstance()` returns shared instance
  - Methods: `initSqlJs()`, `loadDb()`, `fetchDb()`, `getDb()`, `isDbLoaded()`

- **queries.ts**: Database query functions
  - `getBooks()`: Fetch all books from database
  - `getVerse()`: Get single verse by reference
  - `getChapter()`: Get entire chapter
  - `getVerseRange()`: Get verse range
  - `searchVersesKeyword()`: Full-text search with multiple keywords
  - `getVerseById()`: Get verse by internal ID

#### Search Layer (`src/search/`)
- **parser.ts**: Bible reference parsing
  - `parseReference()`: Parse addresses like "John 3:16", "Gen 1:4-5"
  - `findBookNumber()`: Fuzzy match book names
  - `looksLikeReference()`: Detect if input is an address
  - `isKeywordSearch()`: Determine search type
  - `splitKeywords()`: Split keyword queries into words

- **engine.ts**: Search orchestration
  - `search()`: Main search function
  - `addressSearch()`: Handle Bible address lookups
  - `keywordSearch()`: Handle keyword searches
  - Search caching with LRU eviction (max 100 entries)
  - Search history tracking

#### UI Layer (`src/ui/`)
- **modal.ts**: Main search modal component
  - `BibleSearchModal` class (extends Obsidian Modal)
  - Input handling and keyboard navigation
  - Results rendering and selection
  - Verse insertion into editor

- **results-view.ts**: Results display components
  - `renderVerseResult()`: Render individual verse
  - `renderResultsList()`: Render results collection
  - `createSearchInput()`: Create search input element
  - `updateSelection()`: Update visual selection
  - State management functions

#### Utilities (`src/utils/`)
- **language.ts**: Language detection
  - `detectLanguage()`: Cyrillic → RST, Latin → KJV
  - `hasCyrillic()`: Check for Cyrillic characters
  - `hasLatin()`: Check for Latin characters

- **formatter.ts**: Verse formatting and markup handling
  - `stripMarkup()`: Remove tags, Strong's numbers
  - `formatVerse()`: Apply user template
  - `highlightKeywords()`: Highlight search terms
  - `validateTemplate()`: Validate format templates

- **fuzz.ts**: Fuzzy string matching
  - `levenshteinDistance()`: Calculate string distance
  - `isPrefix()`: Check prefix match
  - `findBestMatch()`: Find closest matching string
  - `sortByRelevance()`: Sort strings by similarity

- **constants.ts**: Bible book mappings and regex patterns
  - `BIBLE_BOOKS`: Array of all 66 books with numbers and abbreviations
  - `CYRILLIC_PATTERN`: Regex for Cyrillic detection
  - `REFERENCE_PATTERN`: Regex for address parsing

#### Configuration (`src/settings.ts` & `src/types.ts`)
- **settings.ts**: Settings UI and persistence
  - `BibleSearchSettings` interface
  - `BibleSearchSettingTab` class (extends Obsidian SettingTab)
  - Download buttons with status feedback

- **types.ts**: TypeScript interfaces
  - `Verse`: Bible verse data structure
  - `ParsedReference`: Parsed Bible reference
  - `SearchResult`: Search results with metadata
  - `BookMapping`: Bible book mapping
  - `DatabaseInstance`: Database wrapper

### Data Flow

```
User Input
    ↓
Modal Input Handler (modal.ts)
    ↓
Language Detection (language.ts)
    ↓
Reference Parser or Keyword Split (parser.ts)
    ↓
Search Engine (engine.ts)
    ├─ Address Search → getVerse/getChapter/getVerseRange (queries.ts)
    └─ Keyword Search → searchVersesKeyword (queries.ts)
    ↓
Results Formatting (formatter.ts)
    ↓
Results Display (results-view.ts)
    ↓
User Selection & Insertion
```

## Development Workflow

### Setup
```bash
npm install              # Install dependencies
npm run dev             # Start watch mode
npm run build           # Production build
npm run lint            # Check code quality
```

### Adding a New Feature

1. **Create the implementation file** in appropriate `src/` subdirectory
2. **Add TypeScript interfaces** to `src/types.ts` if needed
3. **Update imports** in dependent files
4. **Add tests** if possible (create test files)
5. **Update documentation** in README.md or DEVELOPMENT.md
6. **Run lint and build** to verify no errors

### Example: Adding a New Search Filter

1. Add filter interface to `src/types.ts`:
```typescript
export interface SearchFilter {
  bookNumbers?: number[];
  minChapter?: number;
  maxChapter?: number;
}
```

2. Add filter parameter to search functions in `src/search/engine.ts`
3. Update queries in `src/database/queries.ts` to handle filters
4. Update UI in `src/ui/modal.ts` to accept filter input

## Key Design Decisions

### 1. Language Detection via Regex
- Simple and fast (~30% Cyrillic threshold)
- No heavy NLP library needed
- Covers 95% of use cases

### 2. Fuzzy Matching Strategy
- Prefix matching first (most likely)
- Levenshtein distance as fallback
- Threshold of 3 for acceptance
- Handles typos and abbreviations well

### 3. Search Caching
- LRU cache with max 100 entries
- Keyed by (query, showParallel)
- Reduces database queries significantly
- Cleared on plugin reload

### 4. Template Variables
- `{short_name}`: "Gen", "Rom" (3-4 chars)
- `{long_name}`: "Genesis", "Romans" (full name)
- `{chapter}`: Chapter number
- `{verse}`: Verse number
- `{translation}`: "KJV" or "RST"
- `{text}`: Cleaned verse text
- `{raw_text}`: Original with markup

### 5. Markup Stripping
- Remove `<pb/>` (page breaks)
- Remove `<S>N</S>` (Strong's concordance)
- Convert `<i>text</i>` to plain text
- Preserves readability

## Database Schema Expectations

The plugin expects SQLite databases with this schema:

```sql
CREATE TABLE books (
  book_number INTEGER PRIMARY KEY,
  short_name TEXT NOT NULL,
  long_name TEXT NOT NULL
);

CREATE TABLE verses (
  id INTEGER PRIMARY KEY,
  book_number INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  text TEXT NOT NULL,
  FOREIGN KEY (book_number) REFERENCES books(book_number)
);

CREATE INDEX idx_verses_lookup ON verses(book_number, chapter, verse);
CREATE INDEX idx_verses_text ON verses(text);
```

## Performance Considerations

### Query Optimization
- Use LIMIT in keyword searches (default 100)
- Index on (book_number, chapter, verse) for address lookups
- FTS (Full-Text Search) would be ideal for keyword searches

### Memory Management
- Databases loaded once into memory
- Results cached with max 100 entries
- Modal disposed after close

### Mobile Performance
- sql.js works efficiently on mobile (WASM)
- Smaller result sets (5 per page default)
- Lazy rendering of long lists

## Testing

### Current Coverage
- Type checking with TypeScript
- ESLint for code quality
- Manual testing in Obsidian

### Adding Tests
The project currently lacks automated tests. To add:

```typescript
// src/__tests__/parser.test.ts
import { parseReference } from '../search/parser';

describe('parseReference', () => {
  it('should parse "John 3:16"', () => {
    const result = parseReference('John 3:16');
    expect(result?.book_number).toBe(42);
    expect(result?.chapter).toBe(3);
    expect(result?.verseStart).toBe(16);
  });
});
```

## Debugging

### Console Logging
The plugin includes debug logging:
```typescript
console.log('Loading Bible Search plugin...');
console.error('Failed to initialize databases:', error);
```

Enable in Chrome DevTools (F12) > Console tab.

### Common Issues

1. **Database not loading**
   - Check URL in settings
   - Verify file exists and is accessible
   - Check browser network tab for 404/500 errors

2. **No results found**
   - Verify database is actually loaded (`isDbLoaded()`)
   - Check verse reference format
   - Try different keywords

3. **Crashes on search**
   - Check for SQL errors in database schema
   - Verify template variables are valid
   - Check for undefined database instance

## Future Improvements

### Phase 2 Features
- [ ] Search history UI (dropdown or sidebar)
- [ ] Verse bookmarks/favorites
- [ ] Additional Bible translations
- [ ] Cross-reference clicking
- [ ] Verse export (PDF, HTML, Markdown)

### Phase 3 Optimizations
- [ ] Full-text search (FTS) for better performance
- [ ] Query result pagination
- [ ] Virtual scrolling for large result sets
- [ ] Search analytics

### Phase 4 Polish
- [ ] Voice input for search
- [ ] Customizable keyboard shortcuts
- [ ] Theme support (light/dark mode refinement)
- [ ] Accessibility improvements
- [ ] Internationalization (i18n)

## Code Style & Standards

### TypeScript
- Strict mode enabled
- No implicit `any` types
- Comprehensive interfaces
- JSDoc comments for public APIs

### File Organization
```
src/
  ├── database/     # Database operations
  ├── search/       # Search logic
  ├── ui/           # UI components
  ├── utils/        # Utilities
  ├── main.ts       # Plugin entry
  ├── settings.ts   # Settings
  └── types.ts      # Interfaces
```

### Naming Conventions
- PascalCase for classes and interfaces
- camelCase for functions and variables
- UPPER_SNAKE_CASE for constants
- Prefix private methods with underscore

### Comments
- JSDoc for public functions
- Inline comments for complex logic
- File headers describing purpose

## Release Process

1. Update version in `manifest.json` and `package.json`
2. Run `npm run build` to verify
3. Commit changes with version bump
4. Create GitHub release with binary files
5. Update community plugin list if applicable

## Resources

- [Obsidian Plugin API](https://docs.obsidian.md/)
- [sql.js Documentation](https://sql.js.org/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [ESLint Configuration](https://eslint.org/docs/rules/)

## Support

For questions or issues during development:
1. Check existing GitHub issues
2. Review Obsidian plugin documentation
3. Test with minimal reproduction
4. Check console for error messages
