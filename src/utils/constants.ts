/**
 * Constants for Bible Search plugin
 */

/**
 * Bible book mappings with book numbers
 * Used for parsing book names and abbreviations
 */
export const BIBLE_BOOKS = [
	{ book_number: 1, short_name: 'Gen', long_name: 'Genesis', abbreviations: ['ge', 'gen', 'gn'] },
	{ book_number: 2, short_name: 'Exo', long_name: 'Exodus', abbreviations: ['ex', 'exo', 'exodus'] },
	{ book_number: 3, short_name: 'Lev', long_name: 'Leviticus', abbreviations: ['lev', 'leviticus'] },
	{ book_number: 4, short_name: 'Num', long_name: 'Numbers', abbreviations: ['num', 'numbers', 'nm'] },
	{ book_number: 5, short_name: 'Deu', long_name: 'Deuteronomy', abbreviations: ['deu', 'deuteronomy', 'dt'] },
	{ book_number: 6, short_name: 'Jos', long_name: 'Joshua', abbreviations: ['jos', 'joshua', 'josh'] },
	{ book_number: 7, short_name: 'Jdg', long_name: 'Judges', abbreviations: ['jdg', 'judges', 'jg'] },
	{ book_number: 8, short_name: 'Rut', long_name: 'Ruth', abbreviations: ['rut', 'ruth', 'ru'] },
	{ book_number: 9, short_name: '1Sa', long_name: '1 Samuel', abbreviations: ['1sa', '1 samuel', '1sam'] },
	{ book_number: 10, short_name: '2Sa', long_name: '2 Samuel', abbreviations: ['2sa', '2 samuel', '2sam'] },
	{ book_number: 11, short_name: '1Ki', long_name: '1 Kings', abbreviations: ['1ki', '1 kings', '1kgs'] },
	{ book_number: 12, short_name: '2Ki', long_name: '2 Kings', abbreviations: ['2ki', '2 kings', '2kgs'] },
	{ book_number: 13, short_name: '1Ch', long_name: '1 Chronicles', abbreviations: ['1ch', '1 chronicles', '1chr'] },
	{ book_number: 14, short_name: '2Ch', long_name: '2 Chronicles', abbreviations: ['2ch', '2 chronicles', '2chr'] },
	{ book_number: 15, short_name: 'Ezr', long_name: 'Ezra', abbreviations: ['ezr', 'ezra'] },
	{ book_number: 16, short_name: 'Neh', long_name: 'Nehemiah', abbreviations: ['neh', 'nehemiah'] },
	{ book_number: 17, short_name: 'Est', long_name: 'Esther', abbreviations: ['est', 'esther'] },
	{ book_number: 18, short_name: 'Job', long_name: 'Job', abbreviations: ['job'] },
	{ book_number: 19, short_name: 'Psa', long_name: 'Psalms', abbreviations: ['psa', 'psalm', 'psalms', 'ps'] },
	{ book_number: 20, short_name: 'Pro', long_name: 'Proverbs', abbreviations: ['pro', 'proverbs', 'prov'] },
	{ book_number: 21, short_name: 'Ecc', long_name: 'Ecclesiastes', abbreviations: ['ecc', 'ecclesiastes', 'eccles'] },
	{ book_number: 22, short_name: 'Isa', long_name: 'Isaiah', abbreviations: ['isa', 'isaiah'] },
	{ book_number: 23, short_name: 'Jer', long_name: 'Jeremiah', abbreviations: ['jer', 'jeremiah'] },
	{ book_number: 24, short_name: 'Lam', long_name: 'Lamentations', abbreviations: ['lam', 'lamentations'] },
	{ book_number: 25, short_name: 'Eze', long_name: 'Ezekiel', abbreviations: ['eze', 'ezekiel', 'ezk'] },
	{ book_number: 26, short_name: 'Dan', long_name: 'Daniel', abbreviations: ['dan', 'daniel', 'dn'] },
	{ book_number: 27, short_name: 'Hos', long_name: 'Hosea', abbreviations: ['hos', 'hosea', 'ho'] },
	{ book_number: 28, short_name: 'Joe', long_name: 'Joel', abbreviations: ['joe', 'joel', 'jl'] },
	{ book_number: 29, short_name: 'Amo', long_name: 'Amos', abbreviations: ['amo', 'amos', 'am'] },
	{ book_number: 30, short_name: 'Oba', long_name: 'Obadiah', abbreviations: ['oba', 'obadiah', 'ob'] },
	{ book_number: 31, short_name: 'Jon', long_name: 'Jonah', abbreviations: ['jon', 'jonah', 'jnh'] },
	{ book_number: 32, short_name: 'Mic', long_name: 'Micah', abbreviations: ['mic', 'micah'] },
	{ book_number: 33, short_name: 'Nah', long_name: 'Nahum', abbreviations: ['nah', 'nahum'] },
	{ book_number: 34, short_name: 'Hab', long_name: 'Habakkuk', abbreviations: ['hab', 'habakkuk'] },
	{ book_number: 35, short_name: 'Zep', long_name: 'Zephaniah', abbreviations: ['zep', 'zephaniah'] },
	{ book_number: 36, short_name: 'Hag', long_name: 'Haggai', abbreviations: ['hag', 'haggai'] },
	{ book_number: 37, short_name: 'Zac', long_name: 'Zechariah', abbreviations: ['zac', 'zechariah', 'zech'] },
	{ book_number: 38, short_name: 'Mal', long_name: 'Malachi', abbreviations: ['mal', 'malachi'] },
	{ book_number: 39, short_name: 'Mat', long_name: 'Matthew', abbreviations: ['mat', 'matthew', 'matt', 'mt'] },
	{ book_number: 40, short_name: 'Mar', long_name: 'Mark', abbreviations: ['mar', 'mark', 'mk'] },
	{ book_number: 41, short_name: 'Luk', long_name: 'Luke', abbreviations: ['luk', 'luke', 'lk'] },
	{ book_number: 42, short_name: 'Joh', long_name: 'John', abbreviations: ['joh', 'john', 'jn'] },
	{ book_number: 43, short_name: 'Act', long_name: 'Acts', abbreviations: ['act', 'acts', 'ac'] },
	{ book_number: 44, short_name: 'Rom', long_name: 'Romans', abbreviations: ['rom', 'romans', 'ro'] },
	{ book_number: 45, short_name: '1Co', long_name: '1 Corinthians', abbreviations: ['1co', '1 corinthians', '1cor'] },
	{ book_number: 46, short_name: '2Co', long_name: '2 Corinthians', abbreviations: ['2co', '2 corinthians', '2cor'] },
	{ book_number: 47, short_name: 'Gal', long_name: 'Galatians', abbreviations: ['gal', 'galatians', 'ga'] },
	{ book_number: 48, short_name: 'Eph', long_name: 'Ephesians', abbreviations: ['eph', 'ephesians', 'ep'] },
	{ book_number: 49, short_name: 'Phl', long_name: 'Philippians', abbreviations: ['phl', 'philippians', 'phil'] },
	{ book_number: 50, short_name: 'Col', long_name: 'Colossians', abbreviations: ['col', 'colossians', 'co'] },
	{ book_number: 51, short_name: '1Th', long_name: '1 Thessalonians', abbreviations: ['1th', '1 thessalonians', '1thess'] },
	{ book_number: 52, short_name: '2Th', long_name: '2 Thessalonians', abbreviations: ['2th', '2 thessalonians', '2thess'] },
	{ book_number: 53, short_name: '1Ti', long_name: '1 Timothy', abbreviations: ['1ti', '1 timothy', '1tim'] },
	{ book_number: 54, short_name: '2Ti', long_name: '2 Timothy', abbreviations: ['2ti', '2 timothy', '2tim'] },
	{ book_number: 55, short_name: 'Tit', long_name: 'Titus', abbreviations: ['tit', 'titus'] },
	{ book_number: 56, short_name: 'Phm', long_name: 'Philemon', abbreviations: ['phm', 'philemon'] },
	{ book_number: 57, short_name: 'Heb', long_name: 'Hebrews', abbreviations: ['heb', 'hebrews'] },
	{ book_number: 58, short_name: 'Jas', long_name: 'James', abbreviations: ['jas', 'james', 'jm'] },
	{ book_number: 59, short_name: '1Pe', long_name: '1 Peter', abbreviations: ['1pe', '1 peter', '1pet'] },
	{ book_number: 60, short_name: '2Pe', long_name: '2 Peter', abbreviations: ['2pe', '2 peter', '2pet'] },
	{ book_number: 61, short_name: '1Jo', long_name: '1 John', abbreviations: ['1jo', '1 john', '1jn'] },
	{ book_number: 62, short_name: '2Jo', long_name: '2 John', abbreviations: ['2jo', '2 john', '2jn'] },
	{ book_number: 63, short_name: '3Jo', long_name: '3 John', abbreviations: ['3jo', '3 john', '3jn'] },
	{ book_number: 64, short_name: 'Jud', long_name: 'Jude', abbreviations: ['jud', 'jude'] },
	{ book_number: 65, short_name: 'Rev', long_name: 'Revelation', abbreviations: ['rev', 'revelation'] },
];

/**
 * Cyrillic pattern for language detection
 */
export const CYRILLIC_PATTERN = /[а-яё]/i;

/**
 * Bible reference pattern
 * Matches: "John 3:16", "jn 3 16", "Gen 1:4-5", "Rom 8", "Eccl 1:4"
 */
export const REFERENCE_PATTERN = /^([a-zA-Z0-9\s]+?)\s+(\d+)(?::(\d+(?:-\d+)?)|)?$/;

/**
 * Chapter:Verse pattern
 */
export const CHAPTER_VERSE_PATTERN = /^(\d+)(?::(\d+(?:-\d+)?))?$/;

/**
 * Max results per search
 */
export const MAX_SEARCH_RESULTS = 100;

/**
 * Results per page (for pagination)
 */
export const RESULTS_PER_PAGE = 5;
