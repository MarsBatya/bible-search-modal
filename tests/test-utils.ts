/**
 * Test utilities and helpers
 */

import { Verse, BookMapping, DatabaseInstance } from '../src/types';

/**
 * Helper to validate a verse result
 */
export function isValidVerse(v: any): v is Verse {
	return (
		typeof v.book_number === 'number' &&
		typeof v.book_name_short === 'string' &&
		typeof v.book_name_long === 'string' &&
		typeof v.chapter === 'number' &&
		typeof v.verse === 'number' &&
		typeof v.text === 'string' &&
		(v.translation === 'KJV' || v.translation === 'RST')
	);
}

/**
 * Helper to validate a book mapping
 */
export function isValidBook(b: any): b is BookMapping {
	return (
		typeof b.book_number === 'number' &&
		typeof b.short_name === 'string' &&
		typeof b.long_name === 'string' &&
		Array.isArray(b.abbreviations)
	);
}

/**
 * Assert a condition and throw if false
 */
export function assert(condition: boolean, message: string): void {
	if (!condition) {
		throw new Error(`Assertion failed: ${message}`);
	}
}

/**
 * Assert array length
 */
export function assertLength<T>(array: T[], expected: number, message: string): void {
	assert(
		array.length === expected,
		`${message} - Expected length ${expected}, got ${array.length}`
	);
}

/**
 * Assert array length >= minimum
 */
export function assertLengthAtLeast<T>(
	array: T[],
	minimum: number,
	message: string
): void {
	assert(
		array.length >= minimum,
		`${message} - Expected length >= ${minimum}, got ${array.length}`
	);
}

/**
 * Assert a verse matches expected values
 */
export function assertVerseEquals(
	actual: Verse,
	expected: Partial<Verse>,
	message: string
): void {
	if (expected.book_number !== undefined) {
		assert(
			actual.book_number === expected.book_number,
			`${message} - book_number mismatch. Expected ${expected.book_number}, got ${actual.book_number}`
		);
	}
	if (expected.chapter !== undefined) {
		assert(
			actual.chapter === expected.chapter,
			`${message} - chapter mismatch. Expected ${expected.chapter}, got ${actual.chapter}`
		);
	}
	if (expected.verse !== undefined) {
		assert(
			actual.verse === expected.verse,
			`${message} - verse mismatch. Expected ${expected.verse}, got ${actual.verse}`
		);
	}
	if (expected.translation !== undefined) {
		assert(
			actual.translation === expected.translation,
			`${message} - translation mismatch. Expected ${expected.translation}, got ${actual.translation}`
		);
	}
}

/**
 * Print colored test output
 */
export const colors = {
	reset: '\x1b[0m',
	green: '\x1b[32m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
};

export function logTest(name: string, passed: boolean, details?: string): void {
	const status = passed ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
	console.log(`${status} ${name}`);
	if (details) {
		console.log(`  ${details}`);
	}
}

export function logSection(name: string): void {
	console.log(`\n${colors.cyan}━━━ ${name} ━━━${colors.reset}`);
}

export function logError(message: string): void {
	console.error(`${colors.red}ERROR:${colors.reset} ${message}`);
}

export function logSuccess(message: string): void {
	console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

export function logInfo(message: string): void {
	console.log(`${colors.blue}ℹ ${message}${colors.reset}`);
}
