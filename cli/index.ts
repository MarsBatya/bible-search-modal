#!/usr/bin/env node
/**
 * Bible Search & Parallel Verse CLI (KJV ⇄ RST)
 *
 * Supports:
 * - Address lookup (single verse, verse ranges, full chapters)
 * - Keyword search with AND logic across multiple words
 * - KJV <-> RST parallel verse alignment with Synodal versification mapping (Psalms, Job, Song of Solomon)
 * - Human-readable formatted text or structured JSON output (--json)
 * - Interactive REPL mode (-i / --interactive)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import initSqlJs from 'sql.js';

import {
	Verse,
	DatabaseInstance,
	convertVersification,
	parseReference,
	splitKeywords,
	detectLanguage,
	stripMarkup,
	highlightKeywords,
	getVerse,
	getVerseRange,
	getChapter,
	searchVersesKeyword,
	getRussianNumbering,
} from '../src';

// --- Types & Interfaces ---

export interface CliOptions {
	query?: string;
	json: boolean;
	parallel: boolean;
	raw: boolean;
	limit: number;
	translation?: 'KJV' | 'RST';
	color: boolean;
	interactive: boolean;
	dbDir?: string;
	help: boolean;
}

export interface FormattedVerseOutput {
	reference: string;
	shortReference: string;
	bookNumber: number;
	bookName: string;
	shortName: string;
	chapter: number;
	verse: number;
	translation: 'KJV' | 'RST';
	text: string;
	rawText?: string;
	parallel?: {
		reference: string;
		shortReference: string;
		bookNumber: number;
		bookName: string;
		shortName: string;
		chapter: number;
		verse: number;
		translation: 'KJV' | 'RST';
		text: string;
		rawText?: string;
	} | null;
}

export interface CliSearchResult {
	query: string;
	type: 'address' | 'keyword';
	sourceTranslation: 'KJV' | 'RST';
	targetTranslation: 'KJV' | 'RST' | null;
	totalResults: number;
	verses: FormattedVerseOutput[];
}

// --- ANSI Colors ---

const colors = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	dim: '\x1b[2m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	gray: '\x1b[90m',
};

function colorize(colorCode: string, text: string, enabled: boolean): string {
	return enabled ? `${colorCode}${text}${colors.reset}` : text;
}

// --- Database Resolution & Loading ---

function findDatabaseFile(dir: string, baseName: string): string | null {
	const candidates = [
		`${baseName}.SQlite3`,
		`${baseName}.sqlite3`,
		`${baseName}.sqlite`,
		`${baseName}.db`,
	];

	for (const candidate of candidates) {
		const fullPath = path.join(dir, candidate);
		if (fs.existsSync(fullPath)) {
			return fullPath;
		}
	}
	return null;
}

export function resolveDbDir(customDir?: string): string {
	const possibleDirs: string[] = [];

	if (customDir) {
		possibleDirs.push(path.resolve(customDir));
	}
	if (process.env.BIBLE_DB_DIR) {
		possibleDirs.push(path.resolve(process.env.BIBLE_DB_DIR));
	}

	// Relative to process.cwd()
	possibleDirs.push(path.resolve(process.cwd(), 'pkg'));
	possibleDirs.push(path.resolve(process.cwd(), '..', 'pkg'));

	// Relative to current file/module
	const scriptDir = path.dirname(fileURLToPath(import.meta.url));
	possibleDirs.push(path.resolve(scriptDir, '..', 'pkg'));
	possibleDirs.push(path.resolve(scriptDir, 'pkg'));

	for (const dir of possibleDirs) {
		if (fs.existsSync(dir)) {
			const hasKjv = findDatabaseFile(dir, 'KJV+') !== null;
			const hasRst = findDatabaseFile(dir, 'RST+') !== null;
			if (hasKjv || hasRst) {
				return dir;
			}
		}
	}

	throw new Error(
		`Could not locate Bible databases (KJV+ and RST+). Checked:\n  ${possibleDirs.join('\n  ')}\nUse --db-dir <path> or set BIBLE_DB_DIR environment variable.`
	);
}

let sqlJsInstance: initSqlJs.SqlJsStatic | null = null;

async function getSqlJsStatic(): Promise<initSqlJs.SqlJsStatic> {
	if (!sqlJsInstance) {
		sqlJsInstance = await initSqlJs();
	}
	return sqlJsInstance;
}

export async function loadDatabase(
	dbDir: string,
	translation: 'KJV' | 'RST'
): Promise<DatabaseInstance> {
	const SQL = await getSqlJsStatic();
	const baseName = translation === 'KJV' ? 'KJV+' : 'RST+';
	const dbPath = findDatabaseFile(dbDir, baseName);

	if (!dbPath) {
		throw new Error(`Database file for ${translation} not found in ${dbDir}`);
	}

	const data = fs.readFileSync(dbPath);
	const db = new SQL.Database(new Uint8Array(data));

	return {
		db,
		translation,
		isLoaded: true,
		russianNumbering: getRussianNumbering(db),
	};
}

// --- Query & Parallel Logic ---

export interface DatabasePair {
	kjv: DatabaseInstance;
	rst: DatabaseInstance;
}

export async function loadDatabasePair(customDbDir?: string): Promise<DatabasePair> {
	const dir = resolveDbDir(customDbDir);
	const [kjv, rst] = await Promise.all([
		loadDatabase(dir, 'KJV'),
		loadDatabase(dir, 'RST'),
	]);
	return { kjv, rst };
}

function getParallelVerse(verse: Verse, targetDb: DatabaseInstance): Verse | null {
	const mapped = convertVersification(
		verse.book_number,
		verse.chapter,
		verse.verse,
		verse.translation === 'RST',
		targetDb.russianNumbering
	);

	if (!mapped) {
		return null;
	}

	return getVerse(targetDb, verse.book_number, mapped.chapter, mapped.verse);
}

function formatVerseOutput(
	verse: Verse,
	parallelVerse: Verse | null,
	includeRaw: boolean
): FormattedVerseOutput {
	const cleanText = stripMarkup(verse.text);

	let parallelOutput: FormattedVerseOutput['parallel'] = null;
	if (parallelVerse) {
		parallelOutput = {
			reference: `${parallelVerse.book_name_long} ${parallelVerse.chapter}:${parallelVerse.verse}`,
			shortReference: `${parallelVerse.book_name_short} ${parallelVerse.chapter}:${parallelVerse.verse}`,
			bookNumber: parallelVerse.book_number,
			bookName: parallelVerse.book_name_long,
			shortName: parallelVerse.book_name_short,
			chapter: parallelVerse.chapter,
			verse: parallelVerse.verse,
			translation: parallelVerse.translation,
			text: stripMarkup(parallelVerse.text),
			...(includeRaw ? { rawText: parallelVerse.text } : {}),
		};
	}

	return {
		reference: `${verse.book_name_long} ${verse.chapter}:${verse.verse}`,
		shortReference: `${verse.book_name_short} ${verse.chapter}:${verse.verse}`,
		bookNumber: verse.book_number,
		bookName: verse.book_name_long,
		shortName: verse.book_name_short,
		chapter: verse.chapter,
		verse: verse.verse,
		translation: verse.translation,
		text: cleanText,
		...(includeRaw ? { rawText: verse.text } : {}),
		parallel: parallelOutput,
	};
}

export function executeQuery(
	databases: DatabasePair,
	query: string,
	options: Partial<CliOptions> = {}
): CliSearchResult {
	const trimmedQuery = query.trim();
	if (!trimmedQuery) {
		throw new Error('Search query cannot be empty');
	}

	const showParallel = options.parallel ?? true;
	const isRaw = options.raw ?? false;
	const limit = options.limit && options.limit > 0 ? options.limit : 20;

	// Detect or select source translation
	let sourceTranslation: 'KJV' | 'RST';
	if (options.translation) {
		sourceTranslation = options.translation;
	} else {
		sourceTranslation = detectLanguage(trimmedQuery);
	}

	const sourceDb = sourceTranslation === 'KJV' ? databases.kjv : databases.rst;
	const targetDb = sourceTranslation === 'KJV' ? databases.rst : databases.kjv;

	const parsed = parseReference(trimmedQuery);
	const isAddress = parsed !== null && parsed.book_number !== null;

	let sourceVerses: Verse[] = [];

	if (isAddress && parsed.book_number !== null) {
		if (parsed.verseStart !== undefined && parsed.verseEnd !== undefined) {
			sourceVerses = getVerseRange(
				sourceDb,
				parsed.book_number,
				parsed.chapter!,
				parsed.verseStart,
				parsed.verseEnd
			);
		} else if (parsed.verseStart !== undefined) {
			const v = getVerse(sourceDb, parsed.book_number, parsed.chapter!, parsed.verseStart);
			if (v) sourceVerses = [v];
		} else if (parsed.chapter !== undefined) {
			sourceVerses = getChapter(sourceDb, parsed.book_number, parsed.chapter);
		}
	} else {
		const keywords = splitKeywords(trimmedQuery);
		sourceVerses = searchVersesKeyword(sourceDb, keywords, limit);
	}

	// Pair each verse with its parallel counterpart
	const formattedVerses: FormattedVerseOutput[] = sourceVerses.map((verse) => {
		let parallelVerse: Verse | null = null;
		if (showParallel) {
			parallelVerse = getParallelVerse(verse, targetDb);
		}
		return formatVerseOutput(verse, parallelVerse, isRaw);
	});

	return {
		query: trimmedQuery,
		type: isAddress ? 'address' : 'keyword',
		sourceTranslation,
		targetTranslation: showParallel ? targetDb.translation : null,
		totalResults: formattedVerses.length,
		verses: formattedVerses,
	};
}

// --- Text Output Formatting ---

export function renderHumanReadable(
	result: CliSearchResult,
	keywords: string[],
	colorEnabled: boolean
): string {
	if (result.verses.length === 0) {
		return colorize(colors.yellow, `No verses found matching: "${result.query}"`, colorEnabled);
	}

	const lines: string[] = [];

	const headerType = result.type === 'address' ? 'Address Lookup' : 'Keyword Search';
	const parallelInfo = result.targetTranslation
		? `${result.sourceTranslation} ⇄ ${result.targetTranslation}`
		: result.sourceTranslation;

	lines.push(
		colorize(
			colors.cyan + colors.bold,
			`📖 [${headerType}] "${result.query}" (${parallelInfo}) - ${result.totalResults} result(s)`,
			colorEnabled
		)
	);
	lines.push(colorize(colors.gray, '─'.repeat(70), colorEnabled));

	for (let i = 0; i < result.verses.length; i++) {
		const v = result.verses[i];
		if (!v) continue;

		let srcText = v.text;
		if (result.type === 'keyword' && keywords.length > 0) {
			if (colorEnabled) {
				// Highlight with ANSI yellow bold
				srcText = highlightWithAnsi(srcText, keywords);
			} else {
				// Highlight with markdown asterisks
				srcText = highlightKeywords(srcText, keywords);
			}
		}

		if (v.parallel) {
			// Header showing both references
			const refHeading = `${v.shortReference} (${v.translation}) ⇄ ${v.parallel.shortReference} (${v.parallel.translation})`;
			lines.push(colorize(colors.bold + colors.green, `[${i + 1}] ${refHeading}`, colorEnabled));

			lines.push(`  ${colorize(colors.blue, `[${v.translation}]`, colorEnabled)} ${srcText}`);
			if (v.rawText) {
				lines.push(`  ${colorize(colors.gray, `[${v.translation} RAW]`, colorEnabled)} ${colorize(colors.dim, v.rawText, colorEnabled)}`);
			}
			lines.push(
				`  ${colorize(colors.magenta, `[${v.parallel.translation}]`, colorEnabled)} ${v.parallel.text}`
			);
			if (v.parallel.rawText) {
				lines.push(`  ${colorize(colors.gray, `[${v.parallel.translation} RAW]`, colorEnabled)} ${colorize(colors.dim, v.parallel.rawText, colorEnabled)}`);
			}
		} else {
			lines.push(
				colorize(
					colors.bold + colors.green,
					`[${i + 1}] ${v.shortReference} (${v.translation})`,
					colorEnabled
				)
			);
			lines.push(`  ${srcText}`);
			if (v.rawText) {
				lines.push(`  ${colorize(colors.gray, '[RAW]', colorEnabled)} ${colorize(colors.dim, v.rawText, colorEnabled)}`);
			}
			if (result.targetTranslation) {
				lines.push(
					colorize(
						colors.gray,
						`  (No direct parallel verse in ${result.targetTranslation})`,
						colorEnabled
					)
				);
			}
		}

		if (i < result.verses.length - 1) {
			lines.push(colorize(colors.gray, '─'.repeat(40), colorEnabled));
		}
	}

	return lines.join('\n');
}

function highlightWithAnsi(text: string, keywords: string[]): string {
	let res = text;
	for (const kw of keywords) {
		const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const reg = new RegExp(`(${escaped})`, 'gi');
		res = res.replace(reg, `${colors.yellow}${colors.bold}$1${colors.reset}`);
	}
	return res;
}

// --- CLI Argument Parsing ---

export function parseArgs(args: string[]): CliOptions {
	const options: CliOptions = {
		json: false,
		parallel: true, // Enabled by default!
		raw: false,
		limit: 20,
		color: process.stdout.isTTY ?? true,
		interactive: false,
		help: false,
	};

	const queryParts: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (!arg) continue;

		if (arg === '--help' || arg === '-h') {
			options.help = true;
		} else if (arg === '--json') {
			options.json = true;
		} else if (arg === '--no-parallel') {
			options.parallel = false;
		} else if (arg === '--parallel' || arg === '-p') {
			options.parallel = true;
		} else if (arg === '--raw' || arg === '-r') {
			options.raw = true;
		} else if (arg === '--no-color') {
			options.color = false;
		} else if (arg === '--color') {
			options.color = true;
		} else if (arg === '--interactive' || arg === '-i') {
			options.interactive = true;
		} else if (arg === '--limit' || arg === '-n') {
			const next = args[++i];
			if (next) options.limit = parseInt(next, 10) || 20;
		} else if (arg.startsWith('--limit=')) {
			const val = arg.split('=')[1];
			if (val) options.limit = parseInt(val, 10) || 20;
		} else if (arg === '--translation' || arg === '-t') {
			const next = args[++i]?.toUpperCase();
			if (next === 'KJV' || next === 'RST') {
				options.translation = next;
			}
		} else if (arg.startsWith('--translation=')) {
			const val = arg.split('=')[1]?.toUpperCase();
			if (val === 'KJV' || val === 'RST') {
				options.translation = val;
			}
		} else if (arg === '--db-dir') {
			options.dbDir = args[++i];
		} else if (arg.startsWith('--db-dir=')) {
			options.dbDir = arg.split('=')[1];
		} else if (!arg.startsWith('-')) {
			queryParts.push(arg);
		}
	}

	if (queryParts.length > 0) {
		options.query = queryParts.join(' ');
	}

	return options;
}

function printHelp(): void {
	console.log(`
Bible Search & Parallel Verse CLI (KJV ⇄ RST)

USAGE:
  bible-cli [OPTIONS] "<QUERY>"
  echo "<QUERY>" | bible-cli [OPTIONS]
  bible-cli -i

EXAMPLES:
  # Address Search (Single verse, with parallel RST/KJV by default)
  bible-cli "John 3:16"
  bible-cli "Ин 3:16"

  # Versification mapping (Psalms, Job, Song of Solomon)
  bible-cli "Ps 23:1"          # Maps KJV Psalm 23:1 -> RST Psalm 22:1
  bible-cli "Пс 50:3"          # Maps RST Psalm 50:3 -> KJV Psalm 51:1

  # Verse Ranges & Full Chapters
  bible-cli "Gen 1:1-3"
  bible-cli "Рим 8:28-30"
  bible-cli "Jude 1"

  # Keyword Search (AND logic across terms)
  bible-cli "grace faith"
  bible-cli "благодать" --limit 10

  # JSON Output Format
  bible-cli "John 3:16" --json

  # Disable Parallel Verses
  bible-cli "John 3:16" --no-parallel

  # Interactive REPL
  bible-cli -i

OPTIONS:
  -p, --parallel             Include parallel translation counterpart (Default: ON)
  --no-parallel              Disable parallel translation lookup
  --json                     Output structured JSON
  -r, --raw                  Output raw verse text including Strong's numbers and markup
  -n, --limit <num>          Max results for keyword search (default: 20)
  -t, --translation <KJV|RST> Force source translation instead of auto-detecting
  -i, --interactive          Start interactive REPL mode
  --db-dir <path>            Custom path to database directory (containing KJV+ and RST+)
  --no-color                 Disable ANSI terminal colors
  -h, --help                 Show this help screen
`);
}

// --- Interactive REPL ---

export async function startInteractive(
	databases: DatabasePair,
	initialOptions: CliOptions
): Promise<void> {
	console.log(
		colorize(
			colors.cyan + colors.bold,
			'📖 Bible Search CLI Interactive Mode (KJV ⇄ RST)\nType a reference, keywords, or command. Type "exit" or "quit" to leave.\nType "help" for options.',
			initialOptions.color
		)
	);

	const state = {
		parallel: initialOptions.parallel,
		json: initialOptions.json,
		raw: initialOptions.raw,
		limit: initialOptions.limit,
		color: initialOptions.color,
		translation: initialOptions.translation,
	};

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: colorize(colors.green + colors.bold, 'bible> ', state.color),
	});

	rl.prompt();

	for await (const line of rl) {
		const input = line.trim();
		if (!input) {
			rl.prompt();
			continue;
		}

		if (input === 'exit' || input === 'quit' || input === ':q') {
			break;
		}

		if (input === 'help' || input === '?') {
			console.log(`
Interactive Commands:
  parallel on|off   Toggle parallel translation lookup (current: ${state.parallel ? 'on' : 'off'})
  json on|off       Toggle JSON output (current: ${state.json ? 'on' : 'off'})
  raw on|off        Toggle raw markup (current: ${state.raw ? 'on' : 'off'})
  limit <n>         Set keyword search limit (current: ${state.limit})
  trans kjv|rst|auto Set source translation override (current: ${state.translation ?? 'auto'})
  exit, quit        Exit interactive mode
`);
			rl.prompt();
			continue;
		}

		if (input.startsWith('parallel ')) {
			state.parallel = input.split(' ')[1] === 'on';
			console.log(`Parallel lookup: ${state.parallel ? 'ON' : 'OFF'}`);
			rl.prompt();
			continue;
		}

		if (input.startsWith('json ')) {
			state.json = input.split(' ')[1] === 'on';
			console.log(`JSON output: ${state.json ? 'ON' : 'OFF'}`);
			rl.prompt();
			continue;
		}

		if (input.startsWith('raw ')) {
			state.raw = input.split(' ')[1] === 'on';
			console.log(`Raw markup: ${state.raw ? 'ON' : 'OFF'}`);
			rl.prompt();
			continue;
		}

		if (input.startsWith('limit ')) {
			const limitPart = input.split(' ')[1];
			if (limitPart) {
				const n = parseInt(limitPart, 10);
				if (!isNaN(n) && n > 0) {
					state.limit = n;
					console.log(`Keyword search limit set to ${n}`);
				}
			}
			rl.prompt();
			continue;
		}

		if (input.startsWith('trans ')) {
			const val = input.split(' ')[1]?.toUpperCase();
			if (val === 'KJV' || val === 'RST') {
				state.translation = val;
				console.log(`Source translation forced to ${val}`);
			} else {
				state.translation = undefined;
				console.log('Source translation set to auto-detect');
			}
			rl.prompt();
			continue;
		}

		try {
			const result = executeQuery(databases, input, state);
			if (state.json) {
				console.log(JSON.stringify(result, null, 2));
			} else {
				const kw = result.type === 'keyword' ? splitKeywords(input) : [];
				console.log(renderHumanReadable(result, kw, state.color));
			}
		} catch (err) {
			console.error(colorize(colors.red, `Error: ${(err as Error).message}`, state.color));
		}

		console.log();
		rl.prompt();
	}

	console.log('Goodbye!');
}

// --- Main Entry Point ---

export async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));

	if (options.help) {
		printHelp();
		return;
	}

	// Check if input is piped into stdin when no query arg is provided
	let stdinQuery: string | undefined;
	if (!options.query && !options.interactive && !process.stdin.isTTY) {
		const chunks: Buffer[] = [];
		for await (const chunk of process.stdin) {
			chunks.push(chunk);
		}
		const piped = Buffer.concat(chunks).toString('utf-8').trim();
		if (piped) {
			stdinQuery = piped;
		}
	}

	const query = options.query || stdinQuery;

	if (!query && !options.interactive) {
		printHelp();
		process.exit(1);
	}

	// Load SQLite databases
	let databases: DatabasePair;
	try {
		databases = await loadDatabasePair(options.dbDir);
	} catch (err) {
		console.error(
			colorize(colors.red, `Failed to load Bible databases: ${(err as Error).message}`, options.color)
		);
		process.exit(1);
	}

	if (options.interactive) {
		await startInteractive(databases, options);
		return;
	}

	if (!query) return;

	try {
		const result = executeQuery(databases, query, options);

		if (options.json) {
			console.log(JSON.stringify(result, null, 2));
		} else {
			const kw = result.type === 'keyword' ? splitKeywords(query) : [];
			console.log(renderHumanReadable(result, kw, options.color));
		}
	} catch (err) {
		console.error(colorize(colors.red, `Error: ${(err as Error).message}`, options.color));
		process.exit(1);
	}
}

// Run directly when executed
if (typeof process !== 'undefined' && process.argv && process.argv[1]) {
	const currentFile = path.resolve(process.argv[1]);
	if (
		currentFile.endsWith('cli/index.ts') ||
		currentFile.endsWith('cli/index.mjs') ||
		currentFile.endsWith('cli/index.js') ||
		currentFile.endsWith('cli/bible-cli')
	) {
		main().catch((err) => {
			console.error('Fatal:', err);
			process.exit(1);
		});
	}
}
