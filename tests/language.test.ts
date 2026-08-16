/**
 * Tests for utils/language.ts
 * Tests Cyrillic/Latin language detection used to route searches to KJV or RST
 */

import { describe, it, expect } from 'vitest';
import { detectLanguage } from '../src/utils/language';

describe('Language Detection', () => {
	describe('detectLanguage()', () => {
		it('should detect pure Latin text as KJV', () => {
			expect(detectLanguage('grace faith love')).toBe('KJV');
		});

		it('should detect pure Cyrillic text as RST', () => {
			expect(detectLanguage('благодать вера любовь')).toBe('RST');
		});

		it('should default to KJV for empty string', () => {
			expect(detectLanguage('')).toBe('KJV');
		});

		it('should default to KJV for null/undefined-like falsy input', () => {
			// @ts-expect-error testing runtime guard against non-string falsy input
			expect(detectLanguage(null)).toBe('KJV');
			// @ts-expect-error testing runtime guard against non-string falsy input
			expect(detectLanguage(undefined)).toBe('KJV');
		});

		it('should treat digits-only input as KJV (no Cyrillic characters)', () => {
			expect(detectLanguage('3:16')).toBe('KJV');
		});

		it('should detect a Bible address with a Cyrillic book name as RST', () => {
			expect(detectLanguage('Ин 3:16')).toBe('RST');
		});

		it('should detect a Bible address with a Latin book name as KJV', () => {
			expect(detectLanguage('John 3:16')).toBe('KJV');
		});

		it('should classify text above the 30% Cyrillic threshold as RST', () => {
			// 4 of 10 non-space chars are Cyrillic (40%)
			expect(detectLanguage('ХХХХabcdef')).toBe('RST');
		});

		it('should classify text at/below the 30% Cyrillic threshold as KJV', () => {
			// 3 of 10 non-space chars are Cyrillic (30%, not strictly greater than 30%)
			expect(detectLanguage('ХХХabcdefg')).toBe('KJV');
		});

		it('should ignore whitespace when computing the Cyrillic percentage', () => {
			// All non-space characters are Cyrillic regardless of spacing
			expect(detectLanguage('И н')).toBe('RST');
		});

		it('should be robust to mixed punctuation with a majority Cyrillic', () => {
			expect(detectLanguage('Иоанна 3:16!')).toBe('RST');
		});
	});
});
