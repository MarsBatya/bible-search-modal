// Example URLs are placeholders only - never actual defaults. Older builds
// persisted these values; treat them as unconfigured when loading.
const LEGACY_EXAMPLE_URLS = [
	'https://example.com/kjv+.sqlite3',
	'https://example.com/rst+.sqlite3',
];

/** Return a usable URL, mapping blank and legacy example placeholders to ''. */
export function normalizeDatabaseUrl(value: string | undefined | null): string {
	const trimmed = typeof value === 'string' ? value.trim() : '';
	if (!trimmed) return '';
	return LEGACY_EXAMPLE_URLS.includes(trimmed.toLowerCase()) ? '' : trimmed;
}
