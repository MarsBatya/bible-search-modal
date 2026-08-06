 # Bible Search Plugin Implementation Plan

   ## Project Overview

   An Obsidian plugin that enables inline Bible verse search with bilingual support (KJV + RST). Users can search by verse address or keywords, with automatic language detection, and paste formatted verses directly into notes.

   **Status**: Planning phase
   **Target**: Desktop + Mobile (Obsidian)
   **Tech Stack**: TypeScript, sql.js (WASM SQLite), Obsidian API

   ---

   ## Architecture & Design Decisions

   ### 1. Database Layer (sql.js)
   - **Approach**: Use `sql.js` for WASM-based SQLite support (works on desktop & mobile)
   - **Database Files**: Users download KJV+.SQlite3 and RST+.SQlite3 from a server (VPS-hosted)
   - **Storage**: Cache databases in plugin directory (`{vault}/.obsidian/plugins/bible-search-modal/`)
   - **Loading**:
     - On plugin load: check if databases exist locally; if not, show prompt to download
     - Download via `requestUrl()` from user-configured server URLs
     - Store as binary in vault adapter
     - Initialize sql.js engine and load database into memory

   ### 2. Language Detection
   - **Auto-detection**:
     - Cyrillic script → RST (Russian)
     - Latin script → KJV (English)
     - Implemented via regex: `/[а-яё]/i` for Cyrillic
   - **Search Flow**:
     - User enters search query
     - Detect dominant language
     - Query the appropriate database
     - Display result in that language
     - Show parallel verse from other translation (configurable toggle)

   ### 3. Search Capabilities
   - **Address parsing**: "John 3:16", "jn 3 16", "Gen 1:4-5", "Rom 8", "Eccl 1:4"
     - Fuzzy book name matching (Levenshtein distance or simple prefix matching)
     - Support ranges (e.g., "Matt 5:3-12")
     - Support full chapters (e.g., "John 3")
     - Normalize spaces/colons
   - **Keyword search**: "grace faith"
     - Multi-word: all words must be present (AND logic)
     - Prefix matching on each word
     - Full-text search on verse text
   - **Parser**: Build a `parseReference()` function to extract:
     - Book name (normalize to `book_number`)
     - Chapter number (optional; if omitted, default to entire book or chapter 1)
     - Verse range (start:end; if no end, return single verse)

   ### 4. UI Components
   - **Search Modal** (ModalDialog)
     - Search input field (auto-focus)
     - Results container with infinite scroll
     - Display ~5 verses per screen
     - Keyboard navigation: Up/Down arrows to select, Enter to paste
     - Highlighted matching text in results
     - Small icon/badge showing translation (KJV/RST)
     - Toggle button for "Show Parallel" (if enabled)

   - **Results Display**:
     - Format: `{Book} {chapter}:{verse} ({translation})`
     - Full verse text below reference
     - Highlight matching keywords in verse text
     - Clicking or pressing Enter inserts formatted verse into note

   ### 5. Verse Formatting & Insertion
   - **Default Format**: `{short_name} {chapter}:{verse} ({translation}) — {text}`
   - **Template System** (in settings):
     - Allow user-defined format strings
     - Available variables:
       - `{short_name}` (e.g., "Gen", "Rom")
       - `{long_name}` (e.g., "Genesis", "Romans")
       - `{chapter}` (chapter number)
       - `{verse}` (verse number)
       - `{translation}` (KJV or RST)
       - `{text}` (verse text, with markup stripped)
       - `{raw_text}` (verse text, with tags)
     - Example: `"{short_name} {chapter}:{verse} ({translation}) *{text}*"`
     - Validation: check template for valid variables, show error if invalid

   - **Text Processing**:
     - Strip markup from verse text:
       - Remove `<pb/>` (page breaks)
       - Remove `<S>number</S>` (Strong's concordance)
       - Convert `<i>text</i>` to plain text (or preserve italics as `*text*`?)
       - Output: clean, readable verse text

   ### 6. Settings System
   - **Database Configuration**:
     - `kjvDbUrl`: URL to KJV+.SQlite3 on VPS
     - `rstDbUrl`: URL to RST+.SQlite3 on VPS
     - Button to "Download KJV Database" and "Download RST Database"
     - Display download status and file size

   - **Search & Display**:
     - `showParallelByDefault`: boolean (show parallel verse alongside search result?)
     - `verseFormat`: string (template for pasted verse, with validation)
     - `stripMarkup`: boolean (remove Strong's numbers, etc.)

   - **UI Preferences**:
     - `resultsPerPage`: number (default 5) — though we're using infinite scroll, keep for potential later use
     - `highlightMatches`: boolean (highlight search keywords in results?)

   ---

   ## File Structure

   ```
   src/
     main.ts                          # Plugin entry point, lifecycle, command registration
     settings.ts                      # Settings interface, defaults, SettingTab

     types.ts                         # Shared TypeScript interfaces

     database/
       engine.ts                      # SqlJs engine initialization, DB loading/fetching
       queries.ts                     # Database query functions (getVerse, searchVerses, getBooks)

     search/
       parser.ts                      # Reference parser (address → book_number, chapter, verse)
       engine.ts                      # Search engine (language detection, fuzzy matching, keyword search)

     ui/
       modal.ts                       # BibleSearchModal (extends Modal)
       results-view.ts                # ResultsView component (render, keyboard nav)

     utils/
       language.ts                    # Language detection functions
       formatter.ts                   # Verse formatting, markup stripping
       fuzz.ts                        # Fuzzy matching (book name)
       constants.ts                   # Constants (book mappings, regex patterns)

     styles.css                       # Styling for modal and results

   pkg/
     KJV+.SQlite3                     # (user downloads these)
     RST+.SQlite3
   ```

   ---

   ## Implementation Phases

   ### Phase 1: Foundation (Database & Settings)
   **Goal**: Load databases, establish settings infrastructure

   1. **database/engine.ts**
      - Initialize sql.js (load WASM binary)
      - Implement `loadDb()`: read binary from vault, create Database instance
      - Implement `fetchDb()`: download from URL, cache, initialize
      - Export singleton engine instance

   2. **settings.ts**
      - Define `BibleSearchSettings` interface
      - Implement `SettingTab` with:
        - Database URL inputs (KJV, RST)
        - Download buttons
        - Verse format template input with variable hints
        - Toggle for "Show Parallel by Default"

   3. **main.ts**
      - Plugin lifecycle: `onload()`, `onunload()`
      - Initialize database engine
      - Load settings
      - Register command: "Bible Search: Open"

   **Deliverable**: Plugin loads, databases can be downloaded, settings persist

   ---

   ### Phase 2: Search Engine & Parsing
   **Goal**: Parse references and keywords, query databases

   1. **utils/constants.ts**
      - Book name mappings: `{short_name, long_name, book_number}`
      - Regex patterns for parsing

   2. **search/parser.ts**
      - `parseReference(input: string)`: Parse addresses
        - Normalize input (trim, lowercase)
        - Extract book name (fuzzy match against books table)
        - Extract chapter & verse (handle ranges)
        - Return: `{book_number, chapter?, verseStart?, verseEnd?}`
      - Test cases: "John 3:16", "jn 3 16", "Gen 1:4-5", "Rom 8"

   3. **database/queries.ts**
      - `getBooks()`: Load book list from DB
      - `getVerse(db, book_number, chapter, verse)`: Fetch single verse
      - `getChapter(db, book_number, chapter)`: Fetch entire chapter
      - `searchVersesKeyword(db, keywords)`: Prefix search + AND logic
      - Handle both KJV and RST databases

   4. **search/engine.ts**
      - `detectLanguage(query: string)`: Cyrillic vs Latin
      - `search(query: string, showParallel: boolean)`: Main search orchestrator
        - Parse reference or keyword
        - Detect language
        - Query appropriate DB (+ parallel if enabled)
        - Format results
        - Return: `{results: Verse[], sourceDb: 'KJV'|'RST', parallelResults?: Verse[]}`

   **Deliverable**: Can parse any valid scripture address or keyword and retrieve verses from DB

   ---

   ### Phase 3: UI & Modal
   **Goal**: Render search results, handle user interaction

   1. **ui/modal.ts**
      - `BibleSearchModal` class (extends Modal)
      - Search input field
      - Results container (use infinite scroll library or manual implementation)
      - Register keyboard handlers (Up/Down/Enter)
      - Call search engine, render results
      - On Enter: insert verse into active editor

   2. **ui/results-view.ts**
      - Render individual verse result
      - Display reference, translation badge, verse text
      - Highlight matching keywords
      - Show parallel verse (if enabled)
      - Handle selection state (highlight on keyboard nav)

   3. **utils/formatter.ts**
      - `stripMarkup(text: string)`: Remove `<pb/>`, `<S>...</S>`, convert `<i>` to plain
      - `formatVerse(verse: Verse, template: string, translation: string)`: Apply user template
      - Validation: `validateTemplate(template: string)`: Check for invalid variables

   4. **styles.css**
      - Modal styling
      - Results list styling
      - Selection highlight
      - Translation badge styling
      - Responsive layout (mobile-friendly)

   **Deliverable**: Plugin opens, shows results, user can select and insert verses

   ---

   ### Phase 4: Polish & Testing
   **Goal**: Refine UX, handle edge cases, test mobile

   1. Keyboard navigation edge cases
   2. Large result sets (pagination/infinite scroll smoothness)
   3. Error handling (DB download failures, network issues, invalid input)
   4. Parallel verse display (ensure it doesn't clutter UI)
   5. Mobile testing (touch interactions, small screens)
   6. Performance optimization (query caching, lazy rendering)
   7. Settings validation and helpful error messages

   **Deliverable**: Fully functional, production-ready plugin

   ---

   ## Dependencies

   **New npm packages to add**:
   - `sql.js` — WASM SQLite engine

   **Already present**:
   - `obsidian` — Obsidian API
   - `typescript` — Language
   - `esbuild` — Build tool

   ---

   ## Technical Notes

   ### Markup Stripping
   Verse text contains:
   ```
   <pb/>In the beginning<S>7225</S> God<S>430</S> created
   ```

   Approach:
   ```typescript
   function stripMarkup(text: string): string {
     return text
       .replace(/<pb\/>/g, '')                    // Page breaks
       .replace(/<S>\d+<\/S>/g, '')               // Strong's numbers
       .replace(/<i>(.*?)<\/i>/g, '$1')           // Italics (keep text, remove tags)
       .trim();
   }
   ```

   ### Fuzzy Book Name Matching
   For input "jn", match "John":
   - Option 1: Simple prefix matching on short_name and long_name
   - Option 2: Levenshtein distance (library or simple implementation)
   - Recommended: Prefix first, then Levenshtein if no exact prefix match

   ### Infinite Scroll Implementation
   - Use virtual scrolling (render only visible verses)
   - Fetch next batch on scroll near bottom
   - Limit initial load to ~50 results, paginate in groups of 20

   ### Mobile Considerations
   - sql.js WASM works on mobile
   - Touch-friendly modal (larger tap targets)
   - Keyboard may auto-dismiss on mobile; ensure Enter insertion works
   - Test on Obsidian Mobile (iOS/Android)

   ---

   ## User Flow

   1. **First Run**:
      - Plugin shows notice: "Bible Search: Configure databases in settings"
      - User goes to Settings → Bible Search
      - User enters VPS URLs for KJV and RST databases
      - User clicks "Download KJV" and "Download RST"
      - Databases cached locally

   2. **Normal Usage**:
      - User in note, presses hotkey or uses Command Palette → "Bible Search: Open"
      - Modal opens with search input
      - User types: "grace faith" (English) → detects English, searches KJV, shows results
      - OR: "грех" (Russian) → detects Russian, searches RST, shows results
      - User types: "Gen 1:1" → parses address, shows Genesis 1:1 from both DB (if parallel enabled)
      - User presses Up/Down to navigate, Enter to insert
      - Verse is pasted in format: "John 3:16 (KJV) — For God so loved the world..."

   3. **Settings**:
      - User can customize verse format: `"{short_name} {chapter}:{verse} ({translation}) — *{text}*"`
      - User can toggle "Show Parallel by Default"
      - User can re-download databases if needed

   ---

   ## Success Criteria

   - [ ] Plugin loads without errors
   - [ ] Databases can be downloaded and cached
   - [ ] Address parsing works for all formats (jn 3 16, gen 1, rom 8:1-5, etc.)
   - [ ] Keyword search returns results (multi-word AND logic)
   - [ ] Language auto-detection works (Cyrillic vs Latin)
   - [ ] Modal displays results with infinite scroll
   - [ ] Keyboard navigation (Up/Down/Enter) works
   - [ ] Verses paste in correct format
   - [ ] Template system works and validates
   - [ ] Mobile (Obsidian app) works
   - [ ] Settings persist across sessions
   - [ ] Error handling is graceful (download failures, etc.)

   ---

   ## Estimated Timeline

   - **Phase 1** (Foundation): 1-2 days
   - **Phase 2** (Search): 2-3 days
   - **Phase 3** (UI): 2-3 days
   - **Phase 4** (Polish): 1-2 days

   **Total**: ~1 week of focused work

   ---

   ## Open Questions / Future Enhancements

   1. Should we cache search results to avoid re-querying? - let's have it yes,
   2. Should we support other languages/translations in the future? - most probably no
   3. Should we add cross-reference support (e.g., click a reference in verse text to search)? - no
   4. Should we persist search history? - yes
   5. Should we add verse bookmarking/favorites? no
