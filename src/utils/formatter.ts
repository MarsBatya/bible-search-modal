import { Verse } from '../types';

/**
 * Verse formatting and markup stripping utilities
 */

/**
 * Strip markup from verse text
 * Removes: <pb/>, <S>number</S>, and converts <i>text</i>
 */
export function stripMarkup(text: string): string {
	return text
		.replace(/<pb\/>/g, '') // Remove page breaks
		.replace(/<S>\d+<\/S>/g, '') // Remove Strong's numbers
		.replace(/<i>(.*?)<\/i>/g, '$1') // Remove italic tags but keep text
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
	let text = stripMarkupFlag ? stripMarkup(verse.text) : verse.text;

	return template
		.replace(/{short_name}/g, verse.book_name_short)
		.replace(/{long_name}/g, verse.book_name_long)
		.replace(/{chapter}/g, String(verse.chapter))
		.replace(/{verse}/g, String(verse.verse))
		.replace(/{translation}/g, verse.translation)
		.replace(/{text}/g, text)
		.replace(/{raw_text}/g, verse.text);
}

/**
 * Highlight matching keywords in text
 */
export function highlightKeywords(text: string, keywords: string[]): string {
	if (keywords.length === 0) return text;

	// Sort keywords by length (longest first) to avoid overlapping replacements
	const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length);

	let result = text;
	for (const keyword of sortedKeywords) {
		// Case-insensitive replacement
		const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
		result = result.replace(regex, `**$&**`);
	}

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
