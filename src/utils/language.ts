import { CYRILLIC_PATTERN } from './constants';

/**
 * Language detection utilities
 */

/**
 * Detect language from text
 * Returns 'RST' for Cyrillic (Russian), 'KJV' for Latin (English)
 */
export function detectLanguage(text: string): 'KJV' | 'RST' {
	if (!text) return 'KJV'; // Default to English

	// Count Cyrillic characters
	const cyrillicMatches = text.match(new RegExp(CYRILLIC_PATTERN, 'g'));
	const cyrillicCount = cyrillicMatches ? cyrillicMatches.length : 0;

	// If more than 30% of ALPHABETIC characters are Cyrillic, treat as Russian
	// This prevents short queries like "1 Ин 5:20" from being skewed by digits/punctuation
	const alphaChars = text.replace(/[^a-zA-Zа-яёА-ЯЁ]/g, '').length;
	const cyrillicPercentage = alphaChars > 0 ? cyrillicCount / alphaChars : 0;

	return cyrillicPercentage > 0.3 ? 'RST' : 'KJV';
}
