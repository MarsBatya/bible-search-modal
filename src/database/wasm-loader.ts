// Resolves to a real string import via the `*.wasm` ambient declaration in
// src/global.d.ts - esbuild's inline-wasm plugin replaces the actual module
// at build time (see esbuild.config.mjs)
import WASM_DATA_URL from 'sql.js/dist/sql-wasm.wasm';
import { debug } from '../utils/logger';

let cachedWasmBinary: ArrayBuffer | null = null;

/**
 * Load WASM binary from embedded data URL
 */
export async function getWasmBinary(): Promise<ArrayBuffer> {
	if (cachedWasmBinary) {
		return cachedWasmBinary;
	}

	debug('Loading WASM from embedded data URL');
	debug('Data URL length:', WASM_DATA_URL.length);

	try {
		// This is a local `data:` URL (the WASM binary inlined as base64 at
		// build time, see esbuild.config.mjs), not an actual network
		// request - decode it directly rather than fetch()
		// (Obsidian's guidelines flag fetch() as a network-request API;
		// it's also unclear whether requestUrl(), built for real HTTP
		// requests, supports data: URLs at all).
		const base64 = WASM_DATA_URL.slice(WASM_DATA_URL.indexOf(',') + 1);
		const nodeBuffer = (typeof window !== 'undefined'
			? (window as unknown as { Buffer?: { from(data: string, encoding: string): Uint8Array } }).Buffer
			: undefined);
		let binaryBuffer: ArrayBuffer;
		if (typeof nodeBuffer?.from === 'function') {
			const buf = nodeBuffer.from(base64, 'base64');
			binaryBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
		} else {
			const binaryString = atob(base64);
			const bytes = new Uint8Array(binaryString.length);
			for (let i = 0; i < binaryString.length; i++) {
				bytes[i] = binaryString.charCodeAt(i);
			}
			binaryBuffer = bytes.buffer;
		}

		cachedWasmBinary = binaryBuffer;
		debug('Successfully loaded WASM binary, size:', binaryBuffer.byteLength);
		return binaryBuffer;
	} catch (error) {
		console.error('Failed to load WASM from data URL:', error);
		throw new Error('Failed to load WASM binary: ' + String(error));
	}
}
