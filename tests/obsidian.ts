/** Minimal runtime shim so tests can import modules that depend on Obsidian. */
export class Notice {
	constructor(_message: string) {}
}

export async function requestUrl(_options: unknown): Promise<{ arrayBuffer: ArrayBuffer }> {
	throw new Error('requestUrl must be mocked in tests');
}
