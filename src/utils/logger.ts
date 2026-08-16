/**
 * Lightweight debug logging gated by a flag.
 * Flip DEBUG to true when diagnosing database/search issues; leave false
 * for normal use so the console isn't flooded with per-query noise.
 * console.warn/console.error calls are left as-is since those indicate
 * real problems the user may need to see regardless of this flag.
 */
export const DEBUG = false;

export function debug(...args: unknown[]): void {
	if (DEBUG) {
		console.log(...args);
	}
}
