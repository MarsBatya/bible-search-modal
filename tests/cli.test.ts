import { describe, it, expect, beforeAll } from 'vitest';
import {
	parseArgs,
	executeQuery,
	loadDatabasePair,
	DatabasePair,
	renderHumanReadable,
} from '../cli';

describe('Bible CLI', () => {
	let databases: DatabasePair;

	beforeAll(async () => {
		databases = await loadDatabasePair();
	});

	describe('Argument Parsing', () => {
		it('should parse simple address query', () => {
			const opts = parseArgs(['John', '3:16']);
			expect(opts.query).toBe('John 3:16');
			expect(opts.parallel).toBe(true);
			expect(opts.json).toBe(false);
		});

		it('should parse --json flag', () => {
			const opts = parseArgs(['John 3:16', '--json']);
			expect(opts.query).toBe('John 3:16');
			expect(opts.json).toBe(true);
		});

		it('should parse --no-parallel flag', () => {
			const opts = parseArgs(['John 3:16', '--no-parallel']);
			expect(opts.parallel).toBe(false);
		});

		it('should parse limit and translation flags', () => {
			const opts = parseArgs(['grace', '-n', '10', '-t', 'KJV']);
			expect(opts.limit).toBe(10);
			expect(opts.translation).toBe('KJV');
		});
	});

	describe('Query Execution', () => {
		it('should look up John 3:16 with RST parallel verse', () => {
			const result = executeQuery(databases, 'John 3:16');
			expect(result.type).toBe('address');
			expect(result.sourceTranslation).toBe('KJV');
			expect(result.totalResults).toBe(1);

			const v = result.verses[0];
			expect(v.bookNumber).toBe(500);
			expect(v.chapter).toBe(3);
			expect(v.verse).toBe(16);
			expect(v.text).toContain('For God so loved the world');

			expect(v.parallel).toBeDefined();
			expect(v.parallel?.translation).toBe('RST');
			expect(v.parallel?.chapter).toBe(3);
			expect(v.parallel?.verse).toBe(16);
			expect(v.parallel?.text).toContain('Ибо так возлюбил Бог мир');
		});

		it('should correctly map versification between KJV Psalm 23 and RST Psalm 22', () => {
			const kjvResult = executeQuery(databases, 'Ps 23:1');
			expect(kjvResult.verses[0].chapter).toBe(23);
			expect(kjvResult.verses[0].verse).toBe(1);
			expect(kjvResult.verses[0].parallel?.chapter).toBe(22);
			expect(kjvResult.verses[0].parallel?.verse).toBe(1);

			const rstResult = executeQuery(databases, 'Пс 22:1');
			expect(rstResult.verses[0].chapter).toBe(22);
			expect(rstResult.verses[0].verse).toBe(1);
			expect(rstResult.verses[0].parallel?.chapter).toBe(23);
			expect(rstResult.verses[0].parallel?.verse).toBe(1);
		});

		it('should correctly map superscription offset (KJV Psalm 51:1 -> RST Psalm 50:3)', () => {
			const res = executeQuery(databases, 'Ps 51:1');
			expect(res.verses[0].parallel?.chapter).toBe(50);
			expect(res.verses[0].parallel?.verse).toBe(3);
		});

		it('should search keywords in KJV and find parallel RST verses', () => {
			const res = executeQuery(databases, 'grace faith', { limit: 5 });
			expect(res.type).toBe('keyword');
			expect(res.sourceTranslation).toBe('KJV');
			expect(res.totalResults).toBeGreaterThan(0);
			expect(res.totalResults).toBeLessThanOrEqual(5);

			for (const v of res.verses) {
				expect(v.text.toLowerCase()).toContain('grace');
				expect(v.text.toLowerCase()).toContain('faith');
				expect(v.parallel).toBeDefined();
				expect(v.parallel?.translation).toBe('RST');
			}
		});

		it('should search Cyrillic keywords in RST and find parallel KJV verses', () => {
			const res = executeQuery(databases, 'благодать', { limit: 5 });
			expect(res.type).toBe('keyword');
			expect(res.sourceTranslation).toBe('RST');
			expect(res.totalResults).toBeGreaterThan(0);
			expect(res.totalResults).toBeLessThanOrEqual(5);

			for (const v of res.verses) {
				expect(v.parallel).toBeDefined();
				expect(v.parallel?.translation).toBe('KJV');
			}
		});

		it('should handle --no-parallel option', () => {
			const res = executeQuery(databases, 'John 3:16', { parallel: false });
			expect(res.verses[0].parallel).toBeNull();
		});

		it('should omit rawText by default', () => {
			const res = executeQuery(databases, 'John 3:16');
			expect(res.verses[0].rawText).toBeUndefined();
			expect(res.verses[0].parallel?.rawText).toBeUndefined();
		});

		it('should include rawText when raw option is enabled', () => {
			const res = executeQuery(databases, 'John 3:16', { raw: true });
			expect(res.verses[0].rawText).toBeDefined();
			expect(res.verses[0].rawText).toContain('<S>');
			expect(res.verses[0].parallel?.rawText).toBeDefined();
			expect(res.verses[0].parallel?.rawText).toContain('<S>');
		});

		it('should render human-readable output without error', () => {
			const res = executeQuery(databases, 'John 3:16');
			const rendered = renderHumanReadable(res, [], false);
			expect(rendered).toContain('John 3:16');
			expect(rendered).toContain('For God so loved the world');
			expect(rendered).toContain('Ибо так возлюбил Бог мир');
		});
	});
});
