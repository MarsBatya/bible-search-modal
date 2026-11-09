/** Minimal runtime shim so tests can import modules that depend on Obsidian. */
export class Notice {
	constructor(_message: string) {}
}

export function setIcon(_el: HTMLElement, _icon: string): void {
	// No-op: DOM tests only assert structural/class changes, not icon glyphs.
}

export async function requestUrl(_options: unknown): Promise<{ arrayBuffer: ArrayBuffer }> {
	throw new Error('requestUrl must be mocked in tests');
}
