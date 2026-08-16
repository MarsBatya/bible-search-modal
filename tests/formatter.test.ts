/**
 * Tests for utils/formatter.ts
 * Tests verse formatting, markup stripping, and template validation
 */

import { describe, it, expect } from 'vitest';
import {
	stripMarkup,
	validateTemplate,
	formatVerse,
	highlightKeywords,
	getDefaultVerseFormat,
	getVersePreview,
} from '../src/utils/formatter';
import { Verse } from '../src/types';

describe('Formatter Utilities', () => {
	describe('stripMarkup()', () => {
		it('should remove page breaks <pb/>', () => {
			const text = '<pb/>In the beginning God created';
			const result = stripMarkup(text);
			expect(result).not.toContain('<pb/>');
			expect(result).toContain('In the beginning');
		});

		it('should remove Strong\'s numbers <S>number</S>', () => {
			const text = 'In the beginning<S>7225</S> God<S>430</S> created';
			const result = stripMarkup(text);
			expect(result).not.toContain('<S>');
			expect(result).not.toContain('</S>');
			expect(result).toContain('In the beginning God created');
		});

		it('should preserve text inside italic tags', () => {
			const text = 'And darkness <i>was</i> upon the deep';
			const result = stripMarkup(text);
			expect(result).not.toContain('<i>');
			expect(result).not.toContain('</i>');
			expect(result).toContain('was');
		});

		it('should handle complete markup example', () => {
			const text = '<pb/>In the beginning<S>7225</S> God<S>430</S> created<S>1254</S> <S>853</S> the heaven<S>8064</S> and the earth.<S>776</S>';
			const result = stripMarkup(text);
			// Result may have extra spaces where tags were removed, which is acceptable
			expect(result).toContain('In the beginning');
			expect(result).toContain('God');
			expect(result).toContain('created');
			expect(result).toContain('earth');
			expect(result).not.toContain('<S>');
		});

		it('should trim whitespace', () => {
			const text = '  <pb/>Text with spaces  ';
			const result = stripMarkup(text);
			expect(result).toBe('Text with spaces');
		});

		it('should handle null or undefined', () => {
			expect(stripMarkup(null)).toBe('');
			expect(stripMarkup(undefined)).toBe('');
			expect(stripMarkup('')).toBe('');
		});

		it('should handle multiple consecutive Strong\'s numbers', () => {
			const text = 'Word<S>1</S><S>2</S><S>3</S>end';
			const result = stripMarkup(text);
			expect(result).toBe('Wordend');
		});

		it('should preserve nested markup correctly', () => {
			const text = 'Text with <i>italic<S>123</S> text</i> here';
			const result = stripMarkup(text);
			expect(result).toContain('italic text');
		});
	});

	describe('validateTemplate()', () => {
		it('should validate template with single variable', () => {
			const result = validateTemplate('{short_name}');
			expect(result.valid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('should validate complete template', () => {
			const template = '{short_name} {chapter}:{verse} ({translation}) — {text}';
			const result = validateTemplate(template);
			expect(result.valid).toBe(true);
		});

		it('should reject invalid variable', () => {
			const result = validateTemplate('{invalid_var}');
			expect(result.valid).toBe(false);
			expect(result.error).toBeDefined();
			expect(result.error).toContain('invalid_var');
		});

		it('should reject multiple invalid variables', () => {
			const result = validateTemplate('{bad1} {bad2} {short_name}');
			expect(result.valid).toBe(false);
			expect(result.error).toContain('bad1');
			expect(result.error).toContain('bad2');
		});

		it('should accept all valid variables', () => {
			const validVariables = [
				'{short_name}',
				'{long_name}',
				'{chapter}',
				'{verse}',
				'{translation}',
				'{text}',
				'{raw_text}',
			];

			for (const variable of validVariables) {
				const result = validateTemplate(variable);
				expect(result.valid).toBe(true);
			}
		});

		it('should validate complex template', () => {
			const template = '*{short_name} {chapter}:{verse}* (__{translation}__)\n{text}';
			const result = validateTemplate(template);
			expect(result.valid).toBe(true);
		});

		it('should accept template without variables', () => {
			const result = validateTemplate('Just plain text');
			expect(result.valid).toBe(true);
		});
	});

	describe('formatVerse()', () => {
		const testVerse: Verse = {
			book_number: 43,
			book_name_short: 'Joh',
			book_name_long: 'John',
			chapter: 3,
			verse: 16,
			text: 'For God<S>430</S> so loved the world<S>2889</S>, that he gave his only begotten Son<S>5207</S>, that whosoever believeth in him should not perish, but have everlasting life.',
			translation: 'KJV',
		};

		it('should format verse with default template', () => {
			const template = '{short_name} {chapter}:{verse} ({translation}) — {text}';
			const result = formatVerse(testVerse, template);
			expect(result).toContain('Joh 3:16 (KJV)');
			expect(result).toContain('For God so loved the world');
		});

		it('should strip markup by default', () => {
			const template = '{text}';
			const result = formatVerse(testVerse, template);
			expect(result).not.toContain('<S>');
			expect(result).toContain('For God so loved the world');
		});

		it('should preserve markup when flag is false', () => {
			const template = '{raw_text}';
			const result = formatVerse(testVerse, template, false);
			expect(result).toContain('<S>');
		});

		it('should replace all occurrences of variables', () => {
			const template = '{short_name} - {short_name}';
			const result = formatVerse(testVerse, template);
			expect(result).toBe('Joh - Joh');
		});

		it('should handle missing variables in template', () => {
			const template = 'Verse: {chapter}:{verse}';
			const result = formatVerse(testVerse, template);
			expect(result).toBe('Verse: 3:16');
		});

		it('should format with complex template', () => {
			const template = '**{short_name} {chapter}:{verse}** _{translation}_\n{text}';
			const result = formatVerse(testVerse, template);
			expect(result).toContain('**Joh 3:16** _KJV_');
			expect(result).toContain('For God so loved the world');
		});
	});

	describe('highlightKeywords()', () => {
		it('should highlight single keyword', () => {
			const text = 'This is a test text with test words';
			const result = highlightKeywords(text, ['test']);
			expect(result).toContain('**test**');
			expect((result.match(/\*\*test\*\*/g) || []).length).toBe(2);
		});

		it('should highlight multiple keywords case-insensitively', () => {
			const text = 'Love and faith are important for grace';
			const result = highlightKeywords(text, ['love', 'faith', 'grace']);
			// highlightKeywords is case-insensitive, so it highlights the actual case in text
			expect(result).toContain('**Love**'); // Capital L in original text
			expect(result).toContain('**faith**');
			expect(result).toContain('**grace**');
		});

		it('should be case-insensitive', () => {
			const text = 'God and GOD and god';
			const result = highlightKeywords(text, ['God']);
			expect((result.match(/\*\*[Gg][Oo][Dd]\*\*/g) || []).length).toBe(3);
		});

		it('should handle Cyrillic text', () => {
			const text = 'Любовь и вера важны';
			const result = highlightKeywords(text, ['любовь', 'вера']);
			// highlightKeywords is case-insensitive, so it highlights with original case
			expect(result).toContain('**Любовь**'); // Capital Л in original text
			expect(result).toContain('**вера**');
		});

		it('should handle empty keywords', () => {
			const text = 'Test text';
			const result = highlightKeywords(text, []);
			expect(result).toBe('Test text');
		});

		it('should handle null or undefined text', () => {
			expect(highlightKeywords(null, ['test'])).toBe('');
			expect(highlightKeywords(undefined, ['test'])).toBe('');
		});

		it('should handle special regex characters in keywords', () => {
			const text = 'This has $ and .* special chars';
			// Should not throw
			const result = highlightKeywords(text, ['$', '.*']);
			expect(result).toBeDefined();
		});

		it('should not corrupt placeholders when a keyword is a substring of the word "highlight"', () => {
			// Regression test: placeholders used to be literal text like
			// "__HIGHLIGHT_0__". A later keyword such as "light" or "high"
			// would match *inside* that literal placeholder (case-insensitive
			// regex), corrupting it before it could be resolved - leaving
			// raw "__HIGHLIGHT_N__" markers in the output instead of bolded
			// text. This only ever showed up for Latin-alphabet (English)
			// queries, never Cyrillic ones, since a Cyrillic keyword can
			// never match a Latin-letter placeholder.
			const result = highlightKeywords('I shall not want light and a high hand', [
				'shall', 'not', 'want', 'light', 'high',
			]);
			expect(result).not.toContain('HIGHLIGHT');
			expect(result).toContain('**shall**');
			expect(result).toContain('**not**');
			expect(result).toContain('**want**');
			expect(result).toContain('**light**');
			expect(result).toContain('**high**');
		});
	});

	describe('getDefaultVerseFormat()', () => {
		it('should return a valid format string', () => {
			const format = getDefaultVerseFormat();
			expect(format).toBeDefined();
			expect(format).toContain('{short_name}');
			expect(format).toContain('{chapter}');
			expect(format).toContain('{verse}');
			expect(format).toContain('{text}');
		});

		it('should match expected pattern', () => {
			const format = getDefaultVerseFormat();
			expect(format).toBe('{short_name} {chapter}:{verse} ({translation}) — {text}');
		});
	});

	describe('getVersePreview()', () => {
		const testVerse: Verse = {
			book_number: 10,
			book_name_short: 'Gen',
			book_name_long: 'Genesis',
			chapter: 1,
			verse: 1,
			text: '<pb/>In the beginning<S>7225</S> God<S>430</S> created the heaven and the earth.',
			translation: 'KJV',
		};

		it('should return formatted preview', () => {
			const preview = getVersePreview(testVerse);
			expect(preview).toContain('Gen 1:1 (KJV)');
			expect(preview).toContain('In the beginning God created');
		});

		it('should strip markup in preview', () => {
			const preview = getVersePreview(testVerse);
			expect(preview).not.toContain('<S>');
			expect(preview).not.toContain('<pb/>');
		});

		it('should truncate long text', () => {
			const longVerse: Verse = {
				...testVerse,
				text: 'A'.repeat(150),
			};
			const preview = getVersePreview(longVerse);
			expect(preview).toContain('...');
		});

		it('should not truncate short text', () => {
			const shortVerse: Verse = {
				...testVerse,
				text: 'Short verse',
			};
			const preview = getVersePreview(shortVerse);
			expect(preview).not.toContain('...');
		});
	});
});
