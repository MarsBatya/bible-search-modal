/**
 * Ambient module declarations for imports that only exist as virtual
 * modules at build time (see esbuild.config.mjs's inlineWasmPlugin), not as
 * real files TypeScript can resolve on disk.
 */
declare module '*.wasm' {
	// esbuild's inline-wasm plugin replaces this import with a plain
	// `export default '<base64 data URL>';` - a string, not an ArrayBuffer
	const wasmDataUrl: string;
	export default wasmDataUrl;
}
