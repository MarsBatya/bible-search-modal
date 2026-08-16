/**
 * Constants for Bible Search plugin
 */

/**
 * Bible book mappings with book numbers
 * Used for parsing book names and abbreviations
 */
export const BIBLE_BOOKS = [
	{ book_number: 10, short_name: 'Gen', long_name: 'Genesis', abbreviations: ['ge', 'gen', 'gn', 'быт', 'бытие'] },
	{ book_number: 20, short_name: 'Exo', long_name: 'Exodus', abbreviations: ['ex', 'exo', 'exodus', 'исх', 'исход'] },
	{ book_number: 30, short_name: 'Lev', long_name: 'Leviticus', abbreviations: ['lev', 'leviticus', 'лев', 'левит'] },
	{ book_number: 40, short_name: 'Num', long_name: 'Numbers', abbreviations: ['num', 'numbers', 'nm', 'чис', 'числа'] },
	{ book_number: 50, short_name: 'Deu', long_name: 'Deuteronomy', abbreviations: ['deu', 'deuteronomy', 'dt', 'втр', 'второзаконие'] },
	{ book_number: 60, short_name: 'Josh', long_name: 'Joshua', abbreviations: ['jos', 'josh', 'joshua', 'нав', 'навин'] },
	{ book_number: 70, short_name: 'Judg', long_name: 'Judges', abbreviations: ['jdg', 'judg', 'judges', 'jg', 'суд', 'судей'] },
	{ book_number: 80, short_name: 'Ruth', long_name: 'Ruth', abbreviations: ['rut', 'ruth', 'ru', 'руф', 'руфь'] },
	{ book_number: 90, short_name: '1Sam', long_name: '1 Samuel', abbreviations: ['1sa', '1sam', '1samuel', '1 samuel', '1 цар', '1цар', '1 царств'] },
	{ book_number: 100, short_name: '2Sam', long_name: '2 Samuel', abbreviations: ['2sa', '2sam', '2samuel', '2 samuel', '2 цар', '2цар', '2 царств'] },
	{ book_number: 110, short_name: '1Kin', long_name: '1 Kings', abbreviations: ['1ki', '1kin', '1kings', '1 kings', '1kgs', '1 цар', '1цар'] },
	{ book_number: 120, short_name: '2Kin', long_name: '2 Kings', abbreviations: ['2ki', '2kin', '2kings', '2 kings', '2kgs', '2 цар', '2цар'] },
	{ book_number: 130, short_name: '1Chr', long_name: '1 Chronicles', abbreviations: ['1ch', '1chr', '1chronicles', '1 chronicles', '1 пар', '1пар'] },
	{ book_number: 140, short_name: '2Chr', long_name: '2 Chronicles', abbreviations: ['2ch', '2chr', '2chronicles', '2 chronicles', '2 пар', '2пар'] },
	{ book_number: 150, short_name: 'Ezr', long_name: 'Ezra', abbreviations: ['ezr', 'ezra', 'езр', 'ездра'] },
	{ book_number: 160, short_name: 'Neh', long_name: 'Nehemiah', abbreviations: ['neh', 'nehemiah', 'неh', 'неемия'] },
	{ book_number: 190, short_name: 'Esth', long_name: 'Esther', abbreviations: ['est', 'esth', 'esther', 'есф', 'есфирь'] },
	{ book_number: 220, short_name: 'Job', long_name: 'Job', abbreviations: ['job', 'иов'] },
	{ book_number: 230, short_name: 'Ps', long_name: 'Psalms', abbreviations: ['ps', 'psa', 'psalm', 'psalms', 'пс', 'псал', 'псалом', 'псалтырь'] },
	{ book_number: 240, short_name: 'Prov', long_name: 'Proverbs', abbreviations: ['pro', 'prov', 'proverbs', 'пр', 'прит', 'притч'] },
	{ book_number: 250, short_name: 'Eccl', long_name: 'Ecclesiastes', abbreviations: ['ecc', 'eccl', 'ecclesiastes', 'еккл', 'екклезиаст'] },
	{ book_number: 260, short_name: 'Song', long_name: 'Song of Solomon', abbreviations: ['song', 'sos', 'canticles'] },
	{ book_number: 290, short_name: 'Isa', long_name: 'Isaiah', abbreviations: ['isa', 'isaiah', 'ис', 'ис.', 'исайя', 'исаия'] },
	{ book_number: 300, short_name: 'Jer', long_name: 'Jeremiah', abbreviations: ['jer', 'jeremiah', 'иер', 'иеремия'] },
	{ book_number: 310, short_name: 'Lam', long_name: 'Lamentations', abbreviations: ['lam', 'lamentations', 'плач'] },
	{ book_number: 330, short_name: 'Ezek', long_name: 'Ezekiel', abbreviations: ['eze', 'ezek', 'ezekiel', 'иез', 'иезекииль'] },
	{ book_number: 340, short_name: 'Dan', long_name: 'Daniel', abbreviations: ['dan', 'daniel', 'dn', 'дан', 'даниил'] },
	{ book_number: 350, short_name: 'Hos', long_name: 'Hosea', abbreviations: ['hos', 'hosea', 'ho', 'ос', 'осия'] },
	{ book_number: 360, short_name: 'Joel', long_name: 'Joel', abbreviations: ['joe', 'joel', 'jl', 'иоиль'] },
	{ book_number: 370, short_name: 'Am', long_name: 'Amos', abbreviations: ['amo', 'am', 'amos', 'ам', 'амос'] },
	{ book_number: 380, short_name: 'Oba', long_name: 'Obadiah', abbreviations: ['oba', 'obadiah', 'ob', 'авд', 'авдий'] },
	{ book_number: 390, short_name: 'Jona', long_name: 'Jonah', abbreviations: ['jon', 'jona', 'jonah', 'jnh', 'иона'] },
	{ book_number: 400, short_name: 'Mic', long_name: 'Micah', abbreviations: ['mic', 'micah', 'мих', 'михей'] },
	{ book_number: 410, short_name: 'Nah', long_name: 'Nahum', abbreviations: ['nah', 'nahum', 'нахум'] },
	{ book_number: 420, short_name: 'Hab', long_name: 'Habakkuk', abbreviations: ['hab', 'habakkuk', 'авв', 'аввакум'] },
	{ book_number: 430, short_name: 'Zeph', long_name: 'Zephaniah', abbreviations: ['zep', 'zeph', 'zephaniah', 'соф', 'софония'] },
	{ book_number: 440, short_name: 'Hag', long_name: 'Haggai', abbreviations: ['hag', 'haggai', 'аггей'] },
	{ book_number: 450, short_name: 'Zech', long_name: 'Zechariah', abbreviations: ['zac', 'zech', 'zechariah', 'зах', 'захария'] },
	{ book_number: 460, short_name: 'Mal', long_name: 'Malachi', abbreviations: ['mal', 'malachi', 'мал', 'малахия'] },
	{ book_number: 470, short_name: 'Mat', long_name: 'Matthew', abbreviations: ['mat', 'matthew', 'matt', 'mt', 'мф', 'матф', 'матфей'] },
	{ book_number: 480, short_name: 'Mar', long_name: 'Mark', abbreviations: ['mar', 'mark', 'mk', 'мк', 'марк'] },
	{ book_number: 490, short_name: 'Luk', long_name: 'Luke', abbreviations: ['luk', 'luke', 'lk', 'лк', 'лука'] },
	{ book_number: 500, short_name: 'John', long_name: 'John', abbreviations: ['joh', 'john', 'jn', 'ин', 'иоан', 'иоанн'] },
	{ book_number: 510, short_name: 'Acts', long_name: 'Acts', abbreviations: ['act', 'acts', 'ac', 'деян', 'деяния'] },
	{ book_number: 520, short_name: 'Rom', long_name: 'Romans', abbreviations: ['rom', 'romans', 'ro', 'рим', 'римл'] },
	{ book_number: 530, short_name: '1Cor', long_name: '1 Corinthians', abbreviations: ['1co', '1cor', '1corinthians', '1 corinthians', '1 кор', '1кор'] },
	{ book_number: 540, short_name: '2Cor', long_name: '2 Corinthians', abbreviations: ['2co', '2cor', '2corinthians', '2 corinthians', '2 кор', '2кор'] },
	{ book_number: 550, short_name: 'Gal', long_name: 'Galatians', abbreviations: ['gal', 'galatians', 'ga', 'гал', 'галат'] },
	{ book_number: 560, short_name: 'Eph', long_name: 'Ephesians', abbreviations: ['eph', 'ephesians', 'ep', 'еф', 'ефес'] },
	{ book_number: 570, short_name: 'Phil', long_name: 'Philippians', abbreviations: ['phl', 'phil', 'philippians', 'флп', 'филипп'] },
	{ book_number: 580, short_name: 'Col', long_name: 'Colossians', abbreviations: ['col', 'colossians', 'co', 'кол', 'колосс'] },
	{ book_number: 590, short_name: '1Ths', long_name: '1 Thessalonians', abbreviations: ['1th', '1ths', '1thessalonians', '1 thessalonians', '1 фес', '1фес'] },
	{ book_number: 600, short_name: '2Ths', long_name: '2 Thessalonians', abbreviations: ['2th', '2ths', '2thessalonians', '2 thessalonians', '2 фес', '2фес'] },
	{ book_number: 610, short_name: '1Tim', long_name: '1 Timothy', abbreviations: ['1ti', '1tim', '1timothy', '1 timothy', '1 тим', '1тим'] },
	{ book_number: 620, short_name: '2Tim', long_name: '2 Timothy', abbreviations: ['2ti', '2tim', '2timothy', '2 timothy', '2 тим', '2тим'] },
	{ book_number: 630, short_name: 'Tit', long_name: 'Titus', abbreviations: ['tit', 'titus', 'тит'] },
	{ book_number: 640, short_name: 'Phlm', long_name: 'Philemon', abbreviations: ['phlm', 'philemon', 'флм', 'филимон'] },
	{ book_number: 650, short_name: 'Heb', long_name: 'Hebrews', abbreviations: ['heb', 'hebrews', 'евр', 'евреям'] },
	{ book_number: 660, short_name: 'Jam', long_name: 'James', abbreviations: ['jas', 'jam', 'james', 'jm', 'иак', 'иаков'] },
	{ book_number: 670, short_name: '1Pet', long_name: '1 Peter', abbreviations: ['1pe', '1pet', '1peter', '1 peter', '1 пет', '1пет'] },
	{ book_number: 680, short_name: '2Pet', long_name: '2 Peter', abbreviations: ['2pe', '2pet', '2peter', '2 peter', '2 пет', '2пет'] },
	{ book_number: 690, short_name: '1Jn', long_name: '1 John', abbreviations: ['1jo', '1jn', '1john', '1 john', '1 ин', '1ин'] },
	{ book_number: 700, short_name: '2Jn', long_name: '2 John', abbreviations: ['2jo', '2jn', '2john', '2 john', '2 ин', '2ин'] },
	{ book_number: 710, short_name: '3Jn', long_name: '3 John', abbreviations: ['3jo', '3jn', '3john', '3 john', '3 ин', '3ин'] },
	{ book_number: 720, short_name: 'Jud', long_name: 'Jude', abbreviations: ['jud', 'jude', 'иуд', 'иуда'] },
	{ book_number: 730, short_name: 'Rev', long_name: 'Revelation', abbreviations: ['rev', 'revelation', 'откр', 'откровение'] },
];

/**
 * Cyrillic pattern for language detection
 * IMPORTANT: Use 'g' flag to match ALL Cyrillic characters, not just the first one
 * Pattern includes both lowercase and uppercase Cyrillic letters
 */
export const CYRILLIC_PATTERN = /[а-яёА-ЯЁ]/g;

/**
 * Bible reference pattern
 * Matches:
 * - "John 3:16" (single-word book)
 * - "jn 3 16" (abbreviation with space separator)
 * - "1 John 1 1" (multi-word book with number prefix and space)
 * - "1john 1 1" (no space between number and name)
 * - "1 peter 3:1" (multi-word with colon)
 * - "Gen 1:4-5" (with range)
 * - "Rom 8" (chapter only)
 * - "Eccl 1:4" (single-word)
 *
 * Book name can contain:
 * - Letters (Latin and Cyrillic)
 * - Numbers (for "1 John", "2 Peter", etc.)
 * - Spaces (for multi-word names like "1 John")
 *
 * Pattern breakdown:
 * - (?:\d+\s*)? - Optional: one or more digits followed by optional space
 * - [а-яёА-ЯЁa-zA-Z] - Required: at least one letter
 * - [а-яёА-ЯЁa-zA-Z0-9\s]*? - Optional: more letters, digits, spaces (non-greedy)
 * - \s+ - Required: space(s) before chapter number
 * - (\d+) - Required: chapter number
 * - (?:[: ](\d+(?:-\d+)?)?)? - Optional: colon/space and verse number (supports ranges)
 */
export const REFERENCE_PATTERN = /^((?:\d+\s*)?[а-яёА-ЯЁa-zA-Z][а-яёА-ЯЁa-zA-Z0-9\s]*?)\s+(\d+)(?:[: ](\d+(?:-\d+)?)?)?$/;
