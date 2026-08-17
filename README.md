<p align="center">
  <img src="assets/logo.svg" alt="Bible Search logo" width="120" height="120">
</p>

# Bible Search - Obsidian Plugin

A powerful Obsidian plugin for searching and inserting Bible verses with bilingual support (KJV English + RST Russian). Search by verse address or keywords, with automatic language detection and customizable formatting.

## Features

✨ **Bilingual Support**
- KJV (King James Version) in English
- RST (Russian Standard Translation)
- Automatic language detection (Cyrillic → RST, Latin → KJV)
- Optional parallel verse display from other translation

🔍 **Flexible Search**
- **Address search**: `John 3:16`, `jn 3 16`, `Gen 1:4-5`, `Rom 8`, `Eccl 1:4`
- **Keyword search**: `grace faith` (multi-word AND logic)
- Fuzzy book name matching (handles abbreviations and typos)
- Support for ranges: `Matt 5:3-12`

📝 **Verse Insertion**
- Customizable verse formatting templates
- Strip markup (remove Strong's numbers, page breaks)
- Direct paste into notes from search results
- Copy any verse (or your whole multi-select) to the clipboard instead of inserting - no active note required
- Keyboard navigation (Up/Down/Enter)

🎲 **Random Verse**
- "Insert random verse" command drops a random verse straight into the active note - no search modal needed
- Picks from whichever translation(s) are loaded

📖 **Context**
- "Expand to chapter" on any result jumps to its full chapter, scrolled to and highlighting that verse
- Verses you've already inserted this session are marked in the results list (in-memory only - resets on reload/restart), so you can see at a glance what you've already pasted when you reopen the modal

⚙️ **Offline & Configurable**
- WASM-based SQLite databases (sql.js) - works on desktop & mobile
- Download and cache databases locally
- Customizable verse format templates
- Settings for display preferences

## Installation

### For Users

1. Download the plugin files (`main.js`, `manifest.json`, `styles.css`)
2. Create folder: `VaultName/.obsidian/plugins/bible-search-modal/`
3. Copy files into the folder
4. Reload Obsidian
5. Enable the plugin in Settings → Community Plugins

### For Developers

```bash
# Clone the repository
git clone <repository-url>
cd bible-search-modal

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run linter
npm run lint
```

## Configuration

After installing, configure the plugin in Settings → Bible Search:

### Database Configuration
1. Enter URLs for KJV and RST database files
2. Click "Download KJV Database" and "Download RST Database"
3. Databases are cached locally in `.obsidian/plugins/bible-search-modal/`

### Search & Display
- **Verse Format Template**: Customize how verses appear when pasted
  - Available variables: `{short_name}`, `{long_name}`, `{chapter}`, `{verse}`, `{translation}`, `{text}`, `{raw_text}`
  - Default: `{short_name} {chapter}:{verse} ({translation}) — {text}`
- **Show Parallel Translation**: Toggle to display verses from both languages
- **Highlight Matches**: Highlight search keywords in results
- **Strip Markup**: Remove Strong's numbers and formatting tags
- **Results Per Page**: Number of results to display (1-20)

## Usage

### Opening Bible Search

1. **Command Palette**: Press `Ctrl+P` (or `Cmd+P` on Mac), type "Bible Search: Open"
2. **Ribbon Icon**: Click the book icon in the left ribbon
3. **Selected Text**: Use "Bible Search: Search selected text" command to search highlighted text

### Searching

**Address Search** (exact verse lookup):
```
John 3:16          → Single verse
jn 3 16            → Abbreviated, spaces instead of colons
Gen 1:4-5          → Verse range
Rom 8              → Entire chapter
1 Peter 1:1        → Books with numbers
```

**Keyword Search** (find verses containing words):
```
grace faith        → All verses with both "grace" AND "faith"
love               → All verses containing "love"
```

### Navigation & Insertion

- **Arrow Up/Down**: Navigate through search results
- **Enter**: Insert selected verse into current note
- **Escape**: Close search modal
- **Copy icon** (on any verse): Copy that verse to the clipboard without inserting it or closing the modal
- **Expand icon** (on any verse): Jump to its full chapter, scrolled to and highlighting that verse

### Random Verse

**Command Palette** → "Insert random verse" drops a random verse straight into the note at your cursor, using your configured format template. Picks between KJV and RST when both are loaded. Requires an active note - shows a notice if none is open.

### Using from other plugins (e.g. Templater)

The plugin exposes `retrieveRandomVerse()` for other plugins to call directly, without opening the search modal:

```js
const bibleSearch = app.plugins.plugins['bible-search-modal'];
const verse = await bibleSearch.retrieveRandomVerse('KJV'); // or 'RST'
```

In a [Templater](https://silentvoid13.github.io/Templater/) template:

```js
<%*
const bibleSearch = app.plugins.plugins['bible-search-modal'];
const verse = await bibleSearch.retrieveRandomVerse('KJV');
tR += verse ?? '(Bible Search plugin not available)';
%>
```

`retrieveRandomVerse(translation, verseFormat?, stripMarkup?)`:
- `translation`: `'KJV'` or `'RST'`
- `verseFormat` (optional): a template string, same syntax as the Verse Format Template setting - defaults to your configured template if omitted
- `stripMarkup` (optional): whether to strip Strong's numbers/markup - defaults to your Strip Markup setting if omitted
- Returns the formatted verse as a string, or `null` if that translation's database isn't loaded

### Keyboard Navigation Examples

The search modal works great with keyboard:
- Type your query
- Press arrow keys to select a verse
- Press Enter to insert it into your note

## Project Structure

```
src/
  main.ts                    # Plugin entry point & lifecycle
  settings.ts                # Settings interface & tab
  types.ts                   # TypeScript interfaces
  
  database/
    engine.ts               # sql.js initialization & DB management
    queries.ts              # Database query functions
  
  search/
    parser.ts               # Bible reference parsing
    engine.ts               # Search orchestration & caching
  
  ui/
    modal.ts                # Search modal component
    results-view.ts         # Results display component
  
  utils/
    language.ts             # Language detection
    formatter.ts            # Verse formatting & markup stripping
    fuzz.ts                 # Fuzzy string matching
    constants.ts            # Bible book mappings & constants
```

## Database Format

The plugin expects SQLite 3 databases with the following schema:

```sql
CREATE TABLE books (
  book_number INTEGER PRIMARY KEY,
  short_name TEXT,
  long_name TEXT
);

CREATE TABLE verses (
  id INTEGER PRIMARY KEY,
  book_number INTEGER,
  chapter INTEGER,
  verse INTEGER,
  text TEXT
);
```

## Technical Details

### Language Detection
- Detects Cyrillic characters (Russian) for RST
- Defaults to Latin characters (English) for KJV
- ~30% threshold for language determination

### Database Loading
- Uses sql.js for WASM SQLite support (works on desktop & mobile)
- Databases loaded into memory for fast queries
- Caches queries to avoid re-querying

### Search Capabilities
- Address parsing with fuzzy book name matching (Levenshtein distance)
- Support for abbreviated book names and common variations
- Multi-word keyword search with AND logic
- Prefix matching for keywords

## Dependencies

- `obsidian` - Obsidian API
- `sql.js` - WASM SQLite engine
- `typescript` - TypeScript compiler
- `esbuild` - Build tool

## Development

### Building

```bash
# Development (watch mode)
npm run dev

# Production build
npm run build

# Type check without building
tsc -noEmit -skipLibCheck
```

### Testing

The plugin includes comprehensive error handling for:
- Missing or corrupted database files
- Network errors during database download
- Invalid verse references
- Database query failures
- Template validation errors

### Performance Optimizations

- **Search caching**: Recent searches cached to avoid re-querying (LRU cache, max 100 entries)
- **Lazy rendering**: Results rendered as needed
- **Query optimization**: Uses SQL LIMIT to reduce result set size
- **Memory management**: Databases loaded once and reused

## Future Enhancements

Potential features for future releases:
- Additional Bible translations
- Cross-reference support (click references in verse text)
- Verse bookmarking and favorites
- Search history persistence
- Mobile touch interface refinements
- Export to PDF/HTML

## Troubleshooting

### Plugin not loading
- Check browser console (F12) for errors
- Ensure Obsidian is version 1.0.0 or later
- Try disabling other plugins

### Database won't download
- Verify the database URL is correct and accessible
- Check network connectivity
- Ensure the vault has write permissions to `.obsidian/plugins/` folder

### No results found
- Verify both databases are downloaded (check Settings)
- Try different keywords or verse formats
- Ensure text is entered correctly

### Verses not inserting
- Check that you have an active editor
- Verify verse format template is valid
- Ensure the cursor is in the right note

## Support & Contributing

For issues, suggestions, or contributions:
1. Check existing issues on GitHub
2. Open a new issue with detailed description
3. Submit pull requests with improvements

## License

This project is licensed under the 0-BSD License. See LICENSE file for details.

## Changelog

### v1.0.0 (Initial Release)
- Full Bible search with KJV and RST translations
- Bilingual language detection
- Flexible verse formatting templates
- Keyboard navigation in search modal
- Settings for customization
- Works on Obsidian desktop and mobile
