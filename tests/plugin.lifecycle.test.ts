import { afterEach, describe, expect, it, vi } from 'vitest';

const { dispose, modalClose, layoutCallbacks, timers } = vi.hoisted(() => ({
	dispose: vi.fn(), modalClose: vi.fn(),
	layoutCallbacks: [] as Array<() => void>, timers: [] as Array<() => void>,
}));
vi.mock('obsidian', () => ({
	Plugin: class {
		app = { vault: {}, workspace: { onLayoutReady: (callback: () => void) => layoutCallbacks.push(callback) } };
		loadData = vi.fn().mockResolvedValue({});
		addCommand = vi.fn();
		addSettingTab = vi.fn();
	},
	Notice: vi.fn(),
}));
vi.mock('../src/settings', () => ({ DEFAULT_SETTINGS: {}, BibleSearchSettingTab: class {} }));
vi.mock('../src/database/engine', () => ({ getEngineInstance: () => ({ dispose }) }));
vi.mock('../src/ui/modal', () => ({
	BibleSearchModal: class {
		constructor(_app: unknown, _plugin: unknown, private onClosed: () => void) {}
		open(): void {}
		setInitialQuery(): void {}
		close(): void { modalClose(); this.onClosed(); }
	},
}));
import BibleSearchPlugin from '../src/main';

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); layoutCallbacks.length = 0; timers.length = 0; });
describe('plugin unload', () => {
	it('closes open modals, cancels warming and disposes databases', async () => {
		const clearTimeout = vi.fn();
		vi.stubGlobal('window', { setTimeout: (callback: () => void) => timers.push(callback), clearTimeout });
		const plugin = new BibleSearchPlugin({} as never, {} as never);
		await plugin.onload();
		plugin['openBibleSearch']();
		layoutCallbacks[0]?.();
		plugin.onunload();
		expect(modalClose).toHaveBeenCalledOnce();
		expect(clearTimeout).toHaveBeenCalledWith(1);
		expect(dispose).toHaveBeenCalledOnce();
		expect(plugin['openModals'].size).toBe(0);
		// Even an already queued callback must not begin database work.
		expect(() => timers[0]?.()).not.toThrow();
	});

	it('does not schedule warming when layout becomes ready after unload', async () => {
		const setTimeout = vi.fn();
		vi.stubGlobal('window', { setTimeout, clearTimeout: vi.fn() });
		const plugin = new BibleSearchPlugin({} as never, {} as never);
		await plugin.onload();
		plugin.onunload();
		layoutCallbacks[0]?.();
		expect(setTimeout).not.toHaveBeenCalled();
	});
});
