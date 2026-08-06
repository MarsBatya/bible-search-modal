/**
 * Debug test for Cyrillic keyword search
 * Investigating why "Иаков" search doesn't work
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { searchVersesKeyword } from '../src/database/queries';
import { DatabaseInstance } from '../src/types';
import { initializeSQL, loadTestDatabase, getDbPath, closeDatabase } from './setup';

describe('Cyrillic Keyword Search Debug', () => {
	let rstDb: DatabaseInstance;

	beforeAll(async () => {
		console.log('\n=== Cyrillic Search Debug ===\n');
		await initializeSQL();
		rstDb = await loadTestDatabase(getDbPath('RST'), 'RST');
		console.log('✓ RST database loaded');
	});

	afterAll(() => {
		closeDatabase(rstDb);
	});

	it('should find verses with Иаков (Jacob)', () => {
		console.log('\nSearching for: Иаков');
		const verses = searchVersesKeyword(rstDb, ['Иаков']);
		console.log(`Found ${verses.length} verses`);
		if (verses.length > 0) {
			console.log('First 3 results:');
			verses.slice(0, 3).forEach((v, i) => {
				console.log(`  [${i + 1}] ${v.book_name_long} ${v.chapter}:${v.verse}`);
				console.log(`      Text: ${v.text.substring(0, 100)}...`);
			});
		}
		expect(verses.length).toBeGreaterThan(0);
	});

	it('should check if Иаков exists in database at all', () => {
		console.log('\nChecking if "Иаков" exists in database...');

		// Direct SQL query to find "Иаков"
		const stmt = rstDb.db.prepare("SELECT COUNT(*) as cnt FROM verses WHERE text LIKE '%Иаков%'");
		let count = 0;
		if (stmt.step()) {
			count = stmt.getAsObject().cnt;
		}
		stmt.free();

		console.log(`Found ${count} verses with "Иаков" in database`);

		if (count > 0) {
			// Get sample verses
			const sampleStmt = rstDb.db.prepare(
				"SELECT book_number, chapter, verse, text FROM verses WHERE text LIKE '%Иаков%' LIMIT 3"
			);
			console.log('Sample verses:');
			while (sampleStmt.step()) {
				const row = sampleStmt.getAsObject();
				console.log(`  Book ${row.book_number}, ${row.chapter}:${row.verse}`);
				console.log(`  Text: ${row.text.substring(0, 100)}...`);
			}
			sampleStmt.free();
		}

		expect(count).toBeGreaterThan(0);
	});

	it('should test case-insensitive search for иаков (lowercase)', () => {
		console.log('\nSearching for: иаков (lowercase)');
		const verses = searchVersesKeyword(rstDb, ['иаков']);
		console.log(`Found ${verses.length} verses`);
		expect(verses.length).toBeGreaterThan(0);
	});

	it('should test search with Latin transliteration', () => {
		console.log('\nSearching for: Iakov (Latin)');
		const verses = searchVersesKeyword(rstDb, ['Iakov']);
		console.log(`Found ${verses.length} verses (should be 0 - Latin won't match Cyrillic)`);
		// This should fail - Latin text won't match Cyrillic
	});

	it('should check database character encoding', () => {
		console.log('\nChecking database character encoding...');

		// Get a Russian verse and check its encoding
		const stmt = rstDb.db.prepare(
			"SELECT text FROM verses WHERE book_number = 10 LIMIT 1"
		);
		if (stmt.step()) {
			const row = stmt.getAsObject();
			const text = row.text;
			console.log(`Sample Russian text: ${text.substring(0, 50)}`);
			console.log(`Character codes: ${Array.from(text.substring(0, 10))
				.map(c => c.charCodeAt(0))
				.join(', ')}`);
		}
		stmt.free();
	});

	it('should test the actual searchVersesKeyword function call', () => {
		console.log('\nTesting searchVersesKeyword function directly...');

		// Test various keywords
		const keywords = [
			['Иаков'],
			['Бог'],
			['любовь'],
			['вера'],
		];

		for (const kw of keywords) {
			const results = searchVersesKeyword(rstDb, kw, 5);
			console.log(`  "${kw[0]}": ${results.length} results`);
		}
	});

	it('should debug the LIKE query with Cyrillic', () => {
		console.log('\nDebugging LIKE query with Cyrillic...');

		const keyword = 'Иаков';
		const likePattern = `%${keyword}%`;

		console.log(`Keyword: ${keyword}`);
		console.log(`LIKE pattern: ${likePattern}`);

		// Try the query directly
		const stmt = rstDb.db.prepare('SELECT COUNT(*) as cnt FROM verses WHERE text LIKE ?');
		stmt.bind([likePattern]);

		let count = 0;
		if (stmt.step()) {
			count = stmt.getAsObject().cnt;
		}
		stmt.free();

		console.log(`Direct LIKE query result: ${count} verses`);
		expect(count).toBeGreaterThan(0);
	});
});
