/**
 * Test if UPPER() function works with Cyrillic in sql.js
 */

import { describe, it, beforeAll, afterAll } from 'vitest';
import { DatabaseInstance } from '../src/types';
import { initializeSQL, loadTestDatabase, getDbPath, closeDatabase } from './setup';

describe('UPPER() Function Test', () => {
	let rstDb: DatabaseInstance;

	beforeAll(async () => {
		await initializeSQL();
		rstDb = await loadTestDatabase(getDbPath('RST'), 'RST');
	});

	afterAll(() => {
		closeDatabase(rstDb);
	});

	it('should test UPPER() function with Cyrillic', () => {
		console.log('\nTesting UPPER() with Cyrillic...');

		// Test if UPPER() works in sql.js
		const stmt = rstDb.db.prepare(`
			SELECT
				UPPER('иаков') as uppercase,
				UPPER('Иаков') as uppercase2
		`);

		if (stmt.step()) {
			const row = stmt.getAsObject();
			console.log(`UPPER('иаков') = ${row.uppercase}`);
			console.log(`UPPER('Иаков') = ${row.uppercase2}`);
		}
		stmt.free();
	});

	it('should test if uppercase and lowercase match with LIKE', () => {
		console.log('\nTesting LIKE with UPPER()...');

		// Find a verse with Иаков
		const findStmt = rstDb.db.prepare(`
			SELECT text FROM verses WHERE text LIKE '%Иаков%' LIMIT 1
		`);

		if (findStmt.step()) {
			const row = findStmt.getAsObject();
			const text = row.text;

			console.log(`Found verse with Иаков: ${text.substring(0, 50)}`);

			// Now test if LIKE with UPPER works
			const testStmt = rstDb.db.prepare(`
				SELECT COUNT(*) as cnt FROM verses
				WHERE UPPER(text) LIKE UPPER(?)
			`);

			testStmt.bind(['%иаков%']);

			let count = 0;
			if (testStmt.step()) {
				const testRow = testStmt.getAsObject();
				count = testRow.cnt;
			}
			testStmt.free();

			console.log(`UPPER(text) LIKE UPPER('%иаков%') result: ${count} verses`);
		}
		findStmt.free();
	});

	it('should test if sql.js has collate nocase option', () => {
		console.log('\nTesting case-insensitive COLLATE...');

		// Try using COLLATE NOCASE
		const stmt = rstDb.db.prepare(`
			SELECT COUNT(*) as cnt FROM verses
			WHERE text LIKE '%иаков%' COLLATE NOCASE
		`);

		let count = 0;
		if (stmt.step()) {
			count = stmt.getAsObject().cnt;
		}
		stmt.free();

		console.log(`text LIKE '%иаков%' COLLATE NOCASE result: ${count} verses`);
	});

	it('should test exact string match regardless of case', () => {
		console.log('\nTesting if Cyrillic has uppercase/lowercase at all...');

		const stmt = rstDb.db.prepare(`
			SELECT DISTINCT text FROM verses
			WHERE text LIKE '%Иаков%' OR text LIKE '%иаков%'
			LIMIT 5
		`);

		const results: string[] = [];
		while (stmt.step()) {
			const row = stmt.getAsObject();
			results.push(row.text);
		}
		stmt.free();

		console.log(`Found ${results.length} verses with either Иаков or иаков`);
		for (const text of results) {
			console.log(`  ${text.substring(0, 100)}`);
		}
	});
});
