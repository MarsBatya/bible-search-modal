import type { Translation } from '../types';

/**
 * Availability of one translation's database. This describes the last load or
 * installation attempt, not whether a previous instance is still usable after
 * a failed replacement.
 */
export type DatabaseStatusState = 'not-configured' | 'loading' | 'ready' | 'failed';

export interface DatabaseStatus {
	state: DatabaseStatusState;
	/** Human-readable detail for the failed/not-configured state. */
	error?: string;
}

export type DatabaseStatusListener = (
	translation: Translation,
	status: DatabaseStatus,
) => void;
