import { Verse } from '../types';

/**
 * Verse formatting and markup stripping utilities
 */

/**
 * Strip markup from verse text
 *
 * Handles the following markup tags found in Bible databases:
 * 1. <pb/> - Page break marker (self-closing)
 * 2. <S>NUMBER</S> - Strong's concordance reference numbers
 * 3. <i>TEXT</i> - Italics formatting (removes tags, keeps text)
 *
 * @param text The verse text potentially containing markup
 * @returns Clean text with all markup removed
 */
export function stripMarkup(text: string | null | undefined): string {
	if (!text) return '';

	return text
		// Remove page break markers (self-closing tags)
		.replace(/<pb\s*\/>/gi, '')

		// Remove Strong's concordance numbers (e.g., <S>7225</S>)
		// Handles: uppercase/lowercase variants, spaces, and any content in tags
		.replace(/<[Ss]>[^<]*<\/[Ss]>/g, '')

		// Remove/unwrap italic tags but keep the text content
		// Handles: <i>text</i> → text, preserves nested content
		.replace(/<i>(.*?)<\/i>/gi, '$1')

		// Clean up any remaining/malformed tags (safety fallback)
		.replace(/<[^>]*>/g, '')

		// Normalize whitespace (multiple spaces to single space)
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Validate format template for valid variables
 */
export function validateTemplate(template: string): { valid: boolean; error?: string } {
	const validVariables = [
		'{short_name}',
		'{long_name}',
		'{chapter}',
		'{verse}',
		'{translation}',
		'{text}',
		'{raw_text}',
	];

	// Extract all variables from template
	const variableRegex = /\{[^}]+\}/g;
	const variables = template.match(variableRegex) || [];

	// Check if all variables are valid
	const invalidVariables = variables.filter((v) => !validVariables.includes(v));

	if (invalidVariables.length > 0) {
		return {
			valid: false,
			error: `Invalid template variables: ${invalidVariables.join(', ')}. Valid variables: ${validVariables.join(', ')}`,
		};
	}

	return { valid: true };
}

/**
 * Format verse using template
 */
export function formatVerse(verse: Verse, template: string, stripMarkupFlag: boolean = true): string {
	const rawText = verse.text || '';
	let text = stripMarkupFlag ? stripMarkup(rawText) : rawText;

	return template
		.replace(/{short_name}/g, verse.book_name_short)
		.replace(/{long_name}/g, verse.book_name_long)
		.replace(/{chapter}/g, String(verse.chapter))
		.replace(/{verse}/g, String(verse.verse))
		.replace(/{translation}/g, verse.translation)
		.replace(/{text}/g, text)
		.replace(/{raw_text}/g, rawText);
}

/**
 * Highlight matching keywords in text (case-insensitive)
 * Works with both Latin and Cyrillic text
 *
 * Features:
 * - Removes duplicate keywords to prevent double-highlighting
 * - Highlights substring matches (e.g., "или" in "стыдились")
 * - Avoids double-wrapping: doesn't highlight text already wrapped in **...**
 */
export function highlightKeywords(text: string | null | undefined, keywords: string[]): string {
	if (!text || keywords.length === 0) return text || '';

	// Remove duplicates (case-insensitive) to prevent highlighting the same keyword twice
	const uniqueKeywords = Array.from(new Set(keywords.map(k => k.toLowerCase())));

	// Sort keywords by length (longest first) to avoid overlapping replacements
	const sortedKeywords = uniqueKeywords.sort((a, b) => b.length - a.length);

	let result = text;
	const highlightMap: Record<string, string> = {};
	let placeholderIndex = 0;

	// Process each keyword, using placeholders to protect already-highlighted text.
	//
	// Placeholders are bookended with Unicode Private Use Area characters
	// (U+E000 / U+E001) rather than spelled out as a word like "HIGHLIGHT".
	// A real-word placeholder is exactly the kind of thing a later keyword
	// can match a substring of - e.g. searching for "light" or "high" would
	// match inside a literal "__HIGHLIGHT_0__" placeholder itself, silently
	// corrupting it before the second pass gets a chance to resolve it back
	// to "**light**"/"**high**" (this was a real, reproduced bug: it only
	// showed up for English/Latin queries because Cyrillic keywords can
	// never match Latin letters in a placeholder). PUA characters can't
	// appear in real Bible text or be typed as a search keyword, so no
	// keyword can ever collide with the marker.
	const PLACEHOLDER_START = '';
	const PLACEHOLDER_END = '';
	sortedKeywords.forEach((keyword) => {
		try {
			// First pass: replace each occurrence with its own placeholder, capturing
			// the actual matched substring so its original casing is preserved
			// (e.g. "Love" stays "Love" instead of becoming the lowercased "love")
			const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const regex = new RegExp(escapedKeyword, 'gi');
			result = result.replace(regex, (match) => {
				const placeholder = `${PLACEHOLDER_START}${placeholderIndex++}${PLACEHOLDER_END}`;
				highlightMap[placeholder] = `**${match}**`;
				return placeholder;
			});
		} catch (error) {
			console.warn(`Failed to highlight keyword "${keyword}":`, error);
		}
	});

	// Second pass: replace all placeholders with highlighted versions. Uses
	// split/join (plain substring matching, not a RegExp) so the placeholder
	// itself never needs escaping.
	Object.entries(highlightMap).forEach(([placeholder, highlighted]) => {
		result = result.split(placeholder).join(highlighted);
	});

	return result;
}

/**
 * Generate default verse format
 */
export function getDefaultVerseFormat(): string {
	return '{short_name} {chapter}:{verse} ({translation}) — {text}';
}

/**
 * Generate preview of formatted verse
 */
export function getVersePreview(verse: Verse, stripMarkupFlag: boolean = true): string {
	const text = stripMarkupFlag ? stripMarkup(verse.text) : verse.text;
	const truncated = text.length > 100 ? text.substring(0, 100) + '...' : text;

	return `${verse.book_name_short} ${verse.chapter}:${verse.verse} (${verse.translation}) — ${truncated}`;
}
