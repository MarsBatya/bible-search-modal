import type { DatabaseInstance, SearchResult, Translation, TranslationSelection, Verse } from '../types';
import { detectLanguage } from '../utils/language';
import { getParallelVerses, search } from './engine';

export interface SearchDatabaseProvider {
	ensureDb(translation: Translation, timeoutMs?: number): Promise<DatabaseInstance | null>;
}

export class MissingDatabaseError extends Error {
	constructor(readonly translation: Translation) {
		super(`${translation} database is unavailable. Open plugin settings to import or download it.`);
	}
}

/** Loads the preferred source first and publishes usable results before optional counterparts. */
export async function coordinateSearch(
	query: string,
	selection: TranslationSelection,
	showParallel: boolean,
	provider: SearchDatabaseProvider,
	isCurrent: () => boolean,
	onPrimary: (result: SearchResult) => void,
	onParallel: (result: SearchResult) => void,
	getCurrentResults?: () => Verse[],
): Promise<void> {
	const preferred = selection === 'Auto' ? detectLanguage(query) : selection;
	let source: Translation = preferred;
	let primary = await provider.ensureDb(preferred, 5000).catch(() => null);
	if (!isCurrent()) return;
	if (!primary?.isLoaded && selection === 'Auto') {
		source = preferred === 'KJV' ? 'RST' : 'KJV';
		primary = await provider.ensureDb(source, 5000).catch(() => null);
		if (!isCurrent()) return;
	}
	if (!primary?.isLoaded) throw new MissingDatabaseError(source);

	const kjv = source === 'KJV' ? primary : undefined;
	const rst = source === 'RST' ? primary : undefined;
	const primaryResult = await search(query, kjv, rst, false, 0, { translation: source });
	if (!isCurrent()) return;
	onPrimary(primaryResult);
	if (!showParallel || primaryResult.results.length === 0) return;

	const counterpart = source === 'KJV' ? 'RST' : 'KJV';
	const other = await provider.ensureDb(counterpart, 5000).catch(() => null);
	if (!isCurrent() || !other?.isLoaded) return;
	try {
		// Pagination may have completed while the counterpart was loading.
		const results = getCurrentResults?.() ?? primaryResult.results;
		const enriched = { ...primaryResult, results, parallelResults: getParallelVerses(results, other) };
		if (isCurrent()) onParallel(enriched);
	} catch (error) {
		// The primary result is already usable; a counterpart failure is optional.
		console.debug('Parallel lookup failed:', error);
	}
}
