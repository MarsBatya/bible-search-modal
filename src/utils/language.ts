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
	const cyrillicMatches = text.match(CYRILLIC_PATTERN);
	const cyrillicCount = cyrillicMatches ? cyrillicMatches.length : 0;

	// If more than 30% of characters are Cyrillic, treat as Russian
	const nonSpaceChars = text.replace(/\s/g, '').length;
	const cyrillicPercentage = nonSpaceChars > 0 ? cyrillicCount / nonSpaceChars : 0;

	return cyrillicPercentage > 0.3 ? 'RST' : 'KJV';
}
