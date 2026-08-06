# Bible Search Modal - Database Schema Documentation

## Overview

The plugin uses two SQLite3 databases (KJV and RST), both with identical schema but different content.

| Database | Size | Verses | Description |
|----------|------|--------|-------------|
| **KJV+.sqlite3** | 9.72 MB | 31,102 | King James Version |
| **RST+.sqlite3** | 10.84 MB | 31,163 | Russian Synodal Translation (Синодальный перевод) |

---

## Database Schema

### Table: `books` (66 rows in each database)

Stores metadata about Bible books.

| Column | Type | Example | Notes |
|--------|------|---------|-------|
| `book_number` | INTEGER | 10 | Unique identifier (used in queries) |
| `short_name` | TEXT | "Gen" (KJV) or "Быт" (RST) | Abbreviated book name |
| `long_name` | TEXT | "Genesis" (KJV) or "Бытие" (RST) | Full book name |
| `book_color` | TEXT | "#ccccff" | Hex color for UI display |

**Book Numbering Scheme:**
Books are numbered irregularly (NOT sequential 1-66):
- Old Testament: 10 (Genesis) through 460 (Malachi) - 39 books
- New Testament: 470 (Matthew) through 730 (Revelation) - 27 books
- Exactly 66 books in each database

**Example Rows:**
```javascript
// KJV
{ book_number: 10, short_name: 'Gen', long_name: 'Genesis', book_color: '#ccccff' }        // 1st book
{ book_number: 500, short_name: 'John', long_name: 'John', book_color: '#ffcccc' }         // 43rd book
{ book_number: 730, short_name: 'Rev', long_name: 'Revelation', book_color: '#ffcccc' }    // 66th book

// RST
{ book_number: 10, short_name: 'Быт', long_name: 'Бытие', book_color: '#ccccff' }
{ book_number: 500, short_name: 'Иов', long_name: 'Иоанн', book_color: '#ffcccc' }
{ book_number: 730, short_name: 'Откр', long_name: 'Откровение', book_color: '#ffcccc' }
```

⚠️ **Important:** Always use the correct book numbers from `src/utils/book-mappings.ts`:
- John = 500 (NOT 43 or 430!)
- Revelation = 730 (NOT 66 or 660!)
- See complete mapping in `src/utils/book-mappings.ts`

---

### Table: `verses` (31,102 rows in KJV, 31,163 rows in RST)

Stores actual verse text.

| Column | Type | Example | Notes |
|--------|------|---------|-------|
| `book_number` | NUMERIC | 10 | Foreign key to `books.book_number` |
| `chapter` | NUMERIC | 1 | Chapter number (1-based) |
| `verse` | NUMERIC | 1 | Verse number (1-based) |
| `text` | TEXT | (see below) | Verse text with markup |

**Text Format:**
Verse text contains XML-like markup that needs stripping:

```html
<!-- Page break -->
<pb/>

<!-- Strong's concordance number -->
<S>7225</S>

<!-- Italics (original words in English, translator's notes in Russian) -->
<i>was</i>
```

**Example (KJV):**
```
<pb/>In the beginning<S>7225</S> God<S>430</S> created<S>1254</S> <S>853</S> the heaven<S>8064</S> and the earth.<S>776</S>
```

**After stripping markup:**
```
In the beginning God created the heaven and the earth.
```

**Example (RST):**
```
<pb/>В начале<S>7225</S> сотворил<S>1254</S> <S>853</S> Бог<S>430</S> небо<S>8064</S> и<S>853</S> землю.<S>776</S>
```

---

### Table: `info` (10 rows in KJV, 9 rows in RST)

Stores metadata about the Bible translation.

| Column | Type | Example (KJV) | Example (RST) |
|--------|------|---|---|
| `name` | TEXT | "description" | "description" |
| `value` | TEXT | "King James Version" | "Библия (Синодальный перевод)" |

**KJV Info Entries:**
- `description`: King James Version
- `chapter_string`: Chapter
- `strong_numbers`: true
- *(and 7 more)*

**RST Info Entries:**
- `description`: Библия (Синодальный перевод)
- `chapter_string`: Глава
- `russian_numbering`: true
- *(and 6 more)*

---

## Typical Query Patterns

### Get Single Verse (Genesis 1:1)
```sql
SELECT v.book_number, b.short_name, b.long_name, v.chapter, v.verse, v.text
FROM verses v
JOIN books b ON v.book_number = b.book_number
WHERE v.book_number = 10 AND v.chapter = 1 AND v.verse = 1
```

### Get John 3:16 (book_number = 500)
```sql
SELECT v.book_number, b.short_name, b.long_name, v.chapter, v.verse, v.text
FROM verses v
JOIN books b ON v.book_number = b.book_number
WHERE v.book_number = 500 AND v.chapter = 3 AND v.verse = 16
```

### Get Entire Chapter
```sql
SELECT v.book_number, b.short_name, b.long_name, v.chapter, v.verse, v.text
FROM verses v
JOIN books b ON v.book_number = b.book_number
WHERE v.book_number = 10 AND v.chapter = 1
ORDER BY v.verse
```

### Get Verse Range (e.g., Romans 8:1-5)
```sql
-- Romans = book_number 520
SELECT v.book_number, b.short_name, b.long_name, v.chapter, v.verse, v.text
FROM verses v
JOIN books b ON v.book_number = b.book_number
WHERE v.book_number = 520 AND v.chapter = 8 AND v.verse BETWEEN 1 AND 5
ORDER BY v.verse
```

### Keyword Search (AND logic)
```sql
SELECT v.book_number, b.short_name, b.long_name, v.chapter, v.verse, v.text
FROM verses v
JOIN books b ON v.book_number = b.book_number
WHERE v.text LIKE '%grace%' AND v.text LIKE '%faith%'
LIMIT 100
```

---

## Important Notes

### Markup Stripping

The `text` column contains markup that must be stripped before display:

```typescript
function stripMarkup(text: string): string {
  return text
    .replace(/<pb\/>/g, '')           // Remove page breaks
    .replace(/<S>\d+<\/S>/g, '')      // Remove Strong's numbers
    .replace(/<i>(.*?)<\/i>/g, '$1')  // Remove italic tags, keep text
    .trim();
}
```

### Book Number Mapping

Book numbers follow an **irregular pattern** (NOT simple position × 10):

**Old Testament (1-39):** 10, 20, 30, ... 160, 190, 220, 230, ... 460
**New Testament (40-66):** 470, 480, 490, 500, ... 730

**Notable Books:**
- Genesis = 10
- Psalms = 230  
- Isaiah = 290
- Matthew = 470
- **John = 500** (not 43 or 430!)
- Romans = 520
- Revelation = 730 (not 66 or 660!)

**Always use correct book numbers from `src/utils/book-mappings.ts`**
Do NOT assume sequential numbering or simple formulas.

### Language Detection

Use these translations' native scripts for language detection:
- **KJV**: Latin script (English) - query when Latin text detected
- **RST**: Cyrillic script (Russian) - query when Cyrillic text detected

---

## Statistics

### Coverage

- **OT Books**: 39
- **NT Books**: 27
- **Total Books**: 66
- **KJV Verses**: 31,102
- **RST Verses**: 31,163 (slight variation due to translation differences)

### Storage

- **Total Size**: ~20.5 MB (both DBs compressed in plugin)
- **Index Strategy**: No explicit indexes created (sql.js doesn't require them for small DBs)

---

## Future Enhancements

1. **Full-Text Search**: Could add SQLite FTS5 for faster keyword searches
2. **Caching Layer**: Consider memoizing frequently searched verses
3. **Cross-references**: Could add links between related verses
4. **Commentary**: Optional commentary tables could be added
5. **Additional Translations**: New database pairs could be added (esp. other Russian or English versions)

---

## Last Updated

Generated: 2026-08-07
Database Inspection Method: sql.js introspection
