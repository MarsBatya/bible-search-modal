# Quick Start Guide - Bible Search Plugin

## For Users

### Installation
1. Download the plugin files to `.obsidian/plugins/bible-search-modal/` in your vault
2. Restart Obsidian
3. Enable "Bible Search" in Settings → Community Plugins

### First Steps
1. Open Settings → Bible Search
2. Add database URLs for KJV and RST
3. Click "Download KJV Database" and "Download RST Database"
4. Wait for downloads to complete

### Using the Plugin
1. Press `Ctrl+P` (or `Cmd+P` on Mac) to open Command Palette
2. Type "Bible Search: Open" and press Enter
3. Enter your search query:
   - **Address**: `John 3:16`, `Gen 1:1-5`, `Rom 8`
   - **Keywords**: `love grace`, `faith hope`
4. Use arrow keys to select a verse
5. Press Enter to insert into your note

---

## For Developers

### Setup
```bash
cd bible-search-modal
npm install
npm run dev  # Watch mode
npm run build # Production build
npm run lint  # Check code quality
```

### Project Structure
- `src/main.ts` - Plugin entry point
- `src/database/` - Database operations (sql.js)
- `src/search/` - Search engine (parsing, matching, caching)
- `src/ui/` - User interface (modal, results)
- `src/utils/` - Utilities (language detection, formatting, fuzzy matching)
- `src/settings.ts` - Settings interface
- `src/types.ts` - TypeScript interfaces
- `styles.css` - Styling

### Key Features Implemented
✅ Bilingual search (KJV + RST)
✅ Address parsing ("John 3:16", "Gen 1:4-5")
✅ Keyword search ("grace faith")
✅ Language detection (Cyrillic → RST, Latin → KJV)
✅ Fuzzy book name matching
✅ Customizable verse formatting
✅ Search caching
✅ Settings persistence
✅ Keyboard navigation
✅ Mobile support (Obsidian iOS/Android)

### Database Configuration

Your SQLite databases need these tables:

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

### Adding Custom Features

**Example: Adding a new search filter**

1. Add to `src/types.ts`:
```typescript
export interface SearchFilter {
  minVerse?: number;
  maxVerse?: number;
}
```

2. Update `src/search/engine.ts` to use filter
3. Update `src/ui/modal.ts` for UI changes
4. Test and build with `npm run build`

---

## Documentation Files

| File | Purpose |
|------|---------|
| README.md | User guide, features, usage |
| DEVELOPMENT.md | Architecture, design patterns, adding features |
| IMPLEMENTATION_STATUS.md | What's been completed, feature checklist |
| QUICK_START.md | This file - quick reference |

---

## Common Tasks

### Changing Default Settings
Edit `src/settings.ts`:
```typescript
export const DEFAULT_SETTINGS: BibleSearchSettings = {
  kjvDbUrl: 'your-url-here',
  rstDbUrl: 'your-url-here',
  verseFormat: '{short_name} {chapter}:{verse} ({translation}) — {text}',
  // ... more settings
};
```

### Customizing Styling
Edit `styles.css` - uses Obsidian CSS variables:
- `--text-normal` - Main text
- `--text-accent` - Highlight color
- `--background-secondary` - Card background
- `--divider-color` - Border color

### Debugging
1. Open DevTools: Press F12 in Obsidian
2. Look at Console tab for errors
3. Check Network tab for database downloads
4. Search term: "Bible Search" in console logs

---

## Troubleshooting

### "No Bible databases loaded"
- ✅ Go to Settings → Bible Search
- ✅ Enter correct database URLs
- ✅ Click download buttons
- ✅ Check internet connection

### "Database download failed"
- ✅ Verify URL is correct
- ✅ Check file exists on server
- ✅ Ensure vault has write permissions
- ✅ Check browser console for errors

### "No results found"
- ✅ Verify database is downloaded
- ✅ Try different search format
- ✅ Check verse reference is valid
- ✅ Try simpler keywords

### "Plugin not loading"
- ✅ Check Obsidian version (1.0.0+)
- ✅ Look for errors in console (F12)
- ✅ Try disabling other plugins
- ✅ Check file permissions

---

## Template Variables Reference

When customizing verse format in settings:

| Variable | Example | Description |
|----------|---------|-------------|
| `{short_name}` | Gen, Rom | 3-4 letter abbreviation |
| `{long_name}` | Genesis, Romans | Full book name |
| `{chapter}` | 1, 3, 5 | Chapter number |
| `{verse}` | 1, 16, 27 | Verse number |
| `{translation}` | KJV, RST | Translation identifier |
| `{text}` | In the beginning God... | Verse text (cleaned) |
| `{raw_text}` | In the beginning<S>7225</S>... | Original with markup |

### Example Templates
- Default: `{short_name} {chapter}:{verse} ({translation}) — {text}`
- Citation: `{long_name} {chapter}:{verse}`
- Markdown: `> {text}\n— {short_name} {chapter}:{verse} ({translation})`
- Minimal: `{text}`

---

## Performance Tips

1. **Search caching is automatic** - Recent searches are cached
2. **Limit results** - Keyword searches limited to 100 verses
3. **Use specific keywords** - Shorter keywords are faster
4. **Exact references** - Address search is instant (cached)

---

## Version Info

- **Plugin Version**: 1.0.0
- **Obsidian Version**: 1.0.0+
- **Node Version**: 18+
- **TypeScript**: 5.8.3+
- **Database**: WASM SQLite (sql.js 1.8.0+)

---

## Getting Help

1. **Check README.md** - User guide
2. **Check DEVELOPMENT.md** - Technical details
3. **Look at code comments** - JSDoc in source files
4. **Check console** - Errors logged with "Bible Search:" prefix

---

## Next Steps

After installation, consider:
1. Customize verse format in settings
2. Enable "Show Parallel Translation" for bilingual view
3. Enable "Highlight Matches" for better results
4. Test with both English and Russian queries
5. Try different verse address formats

---

**Happy searching! 📖**
