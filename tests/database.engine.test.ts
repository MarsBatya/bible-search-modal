/**
 * Tests for database/engine.ts
 * Tests database loading and initialization
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseInstance } from '../src/types';
import { initializeSQL, loadTestDatabase, getDbPath, closeDatabase } from './setup';
import { BOOK_MAPPINGS } from '../src/utils/book-mappings';

describe('Database Engine', () => {
	let kjvDb: DatabaseInstance;
	let rstDb: DatabaseInstance;

	beforeAll(async () => {
		console.log('Initializing test databases for engine tests...');
		await initializeSQL();
		kjvDb = await loadTestDatabase(getDbPath('KJV'), 'KJV');
		rstDb = await loadTestDatabase(getDbPath('RST'), 'RST');
		console.log('✓ Test databases loaded');
	});

	afterAll(() => {
		closeDatabase(kjvDb);
		closeDatabase(rstDb);
	});

	describe('Database Loading', () => {
		it('should load KJV database successfully', async () => {
			expect(kjvDb).toBeDefined();
			expect(kjvDb.isLoaded).toBe(true);
			expect(kjvDb.translation).toBe('KJV');
		});

		it('should load RST database successfully', async () => {
			expect(rstDb).toBeDefined();
			expect(rstDb.isLoaded).toBe(true);
			expect(rstDb.translation).toBe('RST');
		});

		it('should have database instance', () => {
			expect(kjvDb.db).toBeDefined();
			expect(typeof kjvDb.db).not.toBe('undefined');
		});
	});

	describe('Database Structure', () => {
		it('should have books table', () => {
			const stmt = kjvDb.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='books'");
			expect(stmt.step()).toBe(true);
			stmt.free();
		});

		it('should have verses table', () => {
			const stmt = kjvDb.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='verses'");
			expect(stmt.step()).toBe(true);
			stmt.free();
		});

		it('should have info table', () => {
			const stmt = kjvDb.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='info'");
			expect(stmt.step()).toBe(true);
			stmt.free();
		});

		it('should have correct columns in books table', () => {
			const columns: string[] = [];
			const stmt = kjvDb.db.prepare('PRAGMA table_info(books)');
			while (stmt.step()) {
				const row = stmt.getAsObject();
				columns.push(row.name);
			}
			stmt.free();

			expect(columns).toContain('book_number');
			expect(columns).toContain('short_name');
			expect(columns).toContain('long_name');
		});

		it('should have correct columns in verses table', () => {
			const columns: string[] = [];
			const stmt = kjvDb.db.prepare('PRAGMA table_info(verses)');
			while (stmt.step()) {
				const row = stmt.getAsObject();
				columns.push(row.name);
			}
			stmt.free();

			expect(columns).toContain('book_number');
			expect(columns).toContain('chapter');
			expect(columns).toContain('verse');
			expect(columns).toContain('text');
		});
	});

	describe('Data Integrity', () => {
		it('should have 66 books in KJV', () => {
			const stmt = kjvDb.db.prepare('SELECT COUNT(*) as cnt FROM books');
			let count = 0;
			if (stmt.step()) {
				count = stmt.getAsObject().cnt;
			}
			stmt.free();
			expect(count).toBe(66);
		});

		it('should have 66 books in RST', () => {
			const stmt = rstDb.db.prepare('SELECT COUNT(*) as cnt FROM books');
			let count = 0;
			if (stmt.step()) {
				count = stmt.getAsObject().cnt;
			}
			stmt.free();
			expect(count).toBe(66);
		});

		it('should have verses in KJV', () => {
			const stmt = kjvDb.db.prepare('SELECT COUNT(*) as cnt FROM verses');
			let count = 0;
			if (stmt.step()) {
				count = stmt.getAsObject().cnt;
			}
			stmt.free();
			expect(count).toBeGreaterThan(30000);
		});

		it('should have verses in RST', () => {
			const stmt = rstDb.db.prepare('SELECT COUNT(*) as cnt FROM verses');
			let count = 0;
			if (stmt.step()) {
				count = stmt.getAsObject().cnt;
			}
			stmt.free();
			expect(count).toBeGreaterThan(30000);
		});

		it('should have Genesis book', () => {
			const stmt = kjvDb.db.prepare('SELECT * FROM books WHERE book_number = 10 LIMIT 1');
			expect(stmt.step()).toBe(true);
			const row = stmt.getAsObject();
			expect(row.short_name).toBe('Gen');
			expect(row.long_name).toBe('Genesis');
			stmt.free();
		});

		it('should have Revelation book', () => {
			const stmt = kjvDb.db.prepare('SELECT * FROM books WHERE book_number = ? LIMIT 1');
			stmt.bind([BOOK_MAPPINGS.REVELATION]);
			expect(stmt.step()).toBe(true);
			const row = stmt.getAsObject();
			expect(row.short_name).toBe('Rev');
			expect(row.long_name).toBe('Revelation');
			stmt.free();
		});
	});

	describe('SQL Query Execution', () => {
		it('should execute SELECT query', () => {
			const stmt = kjvDb.db.prepare('SELECT COUNT(*) as cnt FROM books');
			expect(stmt.step()).toBe(true);
			stmt.free();
		});

		it('should execute JOIN query', () => {
			const stmt = kjvDb.db.prepare(
				'SELECT v.verse FROM verses v JOIN books b ON v.book_number = b.book_number WHERE b.book_number = 10 LIMIT 1'
			);
			expect(stmt.step()).toBe(true);
			stmt.free();
		});

		it('should execute WHERE query', () => {
			const stmt = kjvDb.db.prepare('SELECT * FROM verses WHERE book_number = 10 AND chapter = 1 AND verse = 1');
			expect(stmt.step()).toBe(true);
			const row = stmt.getAsObject();
			expect(row.book_number).toBe(10);
			expect(row.chapter).toBe(1);
			expect(row.verse).toBe(1);
			stmt.free();
		});

		it('should execute LIKE query', () => {
			const stmt = kjvDb.db.prepare("SELECT COUNT(*) as cnt FROM verses WHERE text LIKE '%grace%'");
			let count = 0;
			if (stmt.step()) {
				count = stmt.getAsObject().cnt;
			}
			stmt.free();
			expect(count).toBeGreaterThan(0);
		});

		it('should execute BETWEEN query', () => {
			const stmt = kjvDb.db.prepare(
				'SELECT COUNT(*) as cnt FROM verses WHERE book_number = 10 AND chapter = 1 AND verse BETWEEN 1 AND 10'
			);
			let count = 0;
			if (stmt.step()) {
				count = stmt.getAsObject().cnt;
			}
			stmt.free();
			expect(count).toBe(10);
		});
	});

	describe('Prepared Statements', () => {
		it('should bind parameters correctly', () => {
			const stmt = kjvDb.db.prepare(
				'SELECT * FROM verses WHERE book_number = ? AND chapter = ? AND verse = ?'
			);
			stmt.bind([10, 1, 1]);
			expect(stmt.step()).toBe(true);
			const row = stmt.getAsObject();
			expect(row.book_number).toBe(10);
			expect(row.chapter).toBe(1);
			expect(row.verse).toBe(1);
			stmt.free();
		});

		it('should handle multiple parameters', () => {
			const stmt = kjvDb.db.prepare(
				'SELECT COUNT(*) as cnt FROM verses WHERE book_number = ? AND chapter = ? AND verse BETWEEN ? AND ?'
			);
			stmt.bind([10, 1, 5, 10]);
			expect(stmt.step()).toBe(true);
			const row = stmt.getAsObject();
			expect(row.cnt).toBe(6);
			stmt.free();
		});

		it('should handle LIKE parameters', () => {
			const stmt = kjvDb.db.prepare("SELECT COUNT(*) as cnt FROM verses WHERE text LIKE ?");
			stmt.bind(['%God%']);
			let count = 0;
			if (stmt.step()) {
				count = stmt.getAsObject().cnt;
			}
			stmt.free();
			expect(count).toBeGreaterThan(1000);
		});
	});

	describe('Cross-database Consistency', () => {
		it('should have same number of tables', () => {
			const kjvTables = [];
			const rstTables = [];

			const kjvStmt = kjvDb.db.prepare("SELECT name FROM sqlite_master WHERE type='table'");
			while (kjvStmt.step()) {
				kjvTables.push(kjvStmt.getAsObject().name);
			}
			kjvStmt.free();

			const rstStmt = rstDb.db.prepare("SELECT name FROM sqlite_master WHERE type='table'");
			while (rstStmt.step()) {
				rstTables.push(rstStmt.getAsObject().name);
			}
			rstStmt.free();

			expect(kjvTables.length).toBe(rstTables.length);
		});

		it('should have same table names', () => {
			const kjvTables: string[] = [];
			const rstTables: string[] = [];

			const kjvStmt = kjvDb.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
			while (kjvStmt.step()) {
				kjvTables.push(kjvStmt.getAsObject().name);
			}
			kjvStmt.free();

			const rstStmt = rstDb.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
			while (rstStmt.step()) {
				rstTables.push(rstStmt.getAsObject().name);
			}
			rstStmt.free();

			expect(kjvTables).toEqual(rstTables);
		});
	});
});
