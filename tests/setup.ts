/**
 * Test setup and utilities for database testing without Obsidian
 */

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { DatabaseInstance } from '../src/types';
import { getRussianNumbering } from '../src/database/queries';

let SQL: any = null;

/**
 * Initialize sql.js (called once per test session)
 */
export async function initializeSQL(): Promise<void> {
	if (SQL) return;
	SQL = await initSqlJs();
}

/**
 * Load a database from file
 */
export async function loadTestDatabase(
	filePath: string,
	translation: 'KJV' | 'RST'
): Promise<DatabaseInstance> {
	if (!SQL) {
		await initializeSQL();
	}

	const data = fs.readFileSync(filePath);
	const db = new SQL.Database(new Uint8Array(data));

	return {
		db,
		translation,
		isLoaded: true,
		russianNumbering: getRussianNumbering(db),
	};
}

/**
 * Get path to database file
 */
export function getDbPath(translation: 'KJV' | 'RST'): string {
	const fileName = translation === 'KJV' ? 'KJV+.SQlite3' : 'RST+.SQlite3';
	return path.join(process.cwd(), 'pkg', fileName);
}

/**
 * Close a database instance
 */
export function closeDatabase(dbInstance: DatabaseInstance): void {
	if (dbInstance.db) {
		dbInstance.db.close();
	}
}

/**
 * Helper to format test output
 */
export function formatTestResult(
	description: string,
	result: any,
	passed: boolean
): string {
	const status = passed ? '✓' : '✗';
	return `${status} ${description}\n  Result: ${JSON.stringify(result, null, 2)}`;
}
