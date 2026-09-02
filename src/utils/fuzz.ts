/**
 * Fuzzy matching for book names
 */

/**
 * Calculate Levenshtein distance between two strings
 * Lower distance = more similar
 */
export function levenshteinDistance(str1: string, str2: string): number {
	const len1 = str1.length;
	const len2 = str2.length;

	// Create matrix. Array.from with a mapper (rather than Array(n).fill(...))
	// lets TypeScript infer number[][] cleanly with no assertions needed.
	const matrix: number[][] = Array.from({ length: len1 + 1 }, () =>
		Array.from({ length: len2 + 1 }, () => 0)
	);

	// Initialize first row and column
	for (let i = 0; i <= len1; i++) {
		matrix[i]![0] = i;
	}
	for (let j = 0; j <= len2; j++) {
		matrix[0]![j] = j;
	}

	// Calculate distances
	for (let i = 1; i <= len1; i++) {
		for (let j = 1; j <= len2; j++) {
			const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
			const minVal = Math.min(
				(matrix[i - 1]?.[j] ?? 0) + 1, // deletion
				(matrix[i]?.[j - 1] ?? 0) + 1, // insertion
				(matrix[i - 1]?.[j - 1] ?? 0) + cost // substitution
			);
			matrix[i]![j] = minVal;
		}
	}

	return matrix[len1]?.[len2] ?? 0;
}

/**
 * Check if str1 is a prefix of str2 (case-insensitive)
 */
export function isPrefix(str1: string, str2: string): boolean {
	return str2.toLowerCase().startsWith(str1.toLowerCase());
}

/**
 * Find best match for input among candidates
 * Strategy: prefix match first, then Levenshtein distance
 */
export function findBestMatch(input: string, candidates: string[]): string | null {
	if (candidates.length === 0) return null;

	const inputLower = input.toLowerCase().trim();

	// Step 1: Try exact match (case-insensitive)
	const exactMatch = candidates.find((c) => c.toLowerCase() === inputLower);
	if (exactMatch) return exactMatch;

	// Step 2: Try prefix match
	const prefixMatches = candidates.filter((c) => isPrefix(inputLower, c));
	if (prefixMatches.length > 0) {
		// Return shortest prefix match
		return prefixMatches.reduce((a, b) => (a.length < b.length ? a : b));
	}

	// Step 3: Use Levenshtein distance
	let bestMatch: string | null = null;
	let minDistance = Infinity;

	for (const candidate of candidates) {
		const distance = levenshteinDistance(inputLower, candidate.toLowerCase());
		if (distance < minDistance) {
			minDistance = distance;
			bestMatch = candidate;
		}
	}

	if (!bestMatch) return null;

	// Only return if distance is reasonably close:
	// - Distance must be <= 3
	// - Never match if every character differs (distance >= input length)
	// - Max allowed edit distance scales with input length
	const maxAllowedDistance = Math.min(3, Math.max(1, Math.floor(inputLower.length / 2)));
	return minDistance <= maxAllowedDistance && minDistance < inputLower.length ? bestMatch : null;
}
