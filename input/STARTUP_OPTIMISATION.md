# Obsidian Plugin Startup Optimization Guide

> **Case Study:** How *Bible Search Modal* dropped startup latency from **269ms** to **< 1ms**, and a practical blueprint for optimizing WebAssembly-, SQLite-, and data-heavy Obsidian plugins.

---

## 1. Introduction: The Startup Budget

Obsidian displays plugin startup times under **Settings > Community plugins > Debug startup time** (or the General > Advanced stopwatch). In modern vaults with dozens of community plugins, every millisecond counts:
- **Ideal startup time:** `< 10ms`
- **Acceptable:** `< 50ms`
- **Problematic (user-perceptible lag):** `> 100ms`

When a plugin reports **269ms**, it is severely delaying Obsidian's launch, freezing the UI thread, and competing with vault indexing and note rendering.

---

## 2. Anatomy of the 269ms Bottleneck (Case Study)

In *Bible Search Modal* 1.1.6, startup was measured at **269ms**. Profiling revealed that the delay was driven by three distinct issues:

### A. The `void asyncFunction()` Fallacy
In `src/main.ts`, the author attempted non-blocking initialization:
```typescript
// Looked non-blocking, but wasn't:
void this.initializeDatabases();
```
**Why this still blocked startup:**
1. In JavaScript, an `async` function executes **synchronously** up to the first asynchronous operation (`await` on an actual unresolved promise).
2. Inside `initializeDatabases()`, `initSqlJs()` immediately called `getWasmBinary()`.
3. `getWasmBinary()` was completely synchronous:
   - Sliced an **880 KB** inlined base64 WASM string.
   - Called `atob()`.
   - Ran a synchronous loop of **660,000 iterations** (`bytes[i] = binaryString.charCodeAt(i)`).
   - This alone blocked the main thread for **~40ms** before `onload()` could return!

### B. Main-Thread Resource Flooding
Immediately after returning the microtask, the background promise initiated:
- Compiling the 660 KB WebAssembly module via `sql.js` (~25ms).
- Reading `KJV+.sqlite3` (9.8 MB) from disk via the vault adapter (~35ms).
- Allocating 10 MB in the WASM heap and copying memory (`new SQL.Database()`, ~40ms).
- Reading `RST+.sqlite3` (11 MB) from disk via the vault adapter (~10ms).
- Allocating 11 MB in the WASM heap and copying memory (~25ms).
- Executing PRAGMAs and SQLite queries on both databases (~25ms).

Because Node/Electron has a single main thread, flooding the task and microtask queues during Obsidian's boot sequence causes massive contention with note indexing, layout creation, and other plugins.

### C. The Flawed Helper Contract
Why was database initialization put into `onload()` in the first place?
Because `ensureDb()` was implemented with a fragile contract:
```typescript
// Old implementation in engine.ts:
async ensureDb(translation: 'KJV' | 'RST', timeoutMs = 30000) {
    const cached = this.databases.get(translation);
    if (cached?.isLoaded) return cached;

    const loadPromise = this.loadingPromises.get(translation);
    if (loadPromise) {
        return await Promise.race([...]);
    }

    // Bug: If not already loading, it gave up immediately!
    return null;
}
```
Because `ensureDb()` returned `null` instead of triggering a load on demand, the rest of the plugin depended on `loadDb()` having already been started during `onload()`.

---

## 3. The 5 Core Optimization Patterns

### Pattern 1: Lean `onload()` (Only What Is Immediately Needed)
`onload()` should only register metadata and event listeners:
- Load settings (`await this.loadSettings()`).
- Register commands (`this.addCommand(...)`).
- Register settings tabs (`this.addSettingTab(...)`).
- Register ribbon icons or status bar items.

**Never** perform the following inside `onload()`:
- Disk I/O for heavy databases or assets.
- Network requests.
- WebAssembly compilation or runtime instantiation.
- Synchronous parsing of large data structures.

---

### Pattern 2: True On-Demand (Lazy) Loading
Every resource loader must be self-healing: if an asset is not yet loaded, calling `ensureResource()` should load it on the fly and return the promise:

```typescript
async ensureDb(translation: 'KJV' | 'RST', timeoutMs = 30000): Promise<DatabaseInstance | null> {
    // 1. If already cached and ready, return synchronously
    const cached = this.databases.get(translation);
    if (cached?.isLoaded) {
        return cached;
    }

    // 2. loadDb() returns an active promise if already loading, or kicks off a new load
    const loadPromise = this.loadDb(translation);

    let timer: number;
    try {
        return await Promise.race([
            loadPromise,
            new Promise<null>((_, reject) => {
                timer = window.setTimeout(
                    () => reject(new Error(`Database load timeout: ${translation}`)),
                    timeoutMs
                );
            }),
        ]);
    } finally {
        window.clearTimeout(timer!);
    }
}
```

This decouples the plugin's functionality from startup time. If a user doesn't search during a session, 0 bytes are read and 0MB of RAM is allocated.

---

### Pattern 3: Deferred Background Warming (`onLayoutReady` + Timeout)
If you want cache warming so the first user interaction is instant, defer it until Obsidian has completely finished starting up:

```typescript
async onload(): Promise<void> {
    await this.loadSettings();
    this.addCommand(...);
    this.addSettingTab(...);

    // Defers background warming until Obsidian has rendered the UI
    // and settled background indexing tasks.
    this.app.workspace.onLayoutReady(() => {
        window.setTimeout(() => {
            void this.preloadDatabases();
        }, 3000);
    });
}
```

**Why this works:**
- `onLayoutReady` fires only *after* workspace layout is rendered and active notes are displayed.
- Obsidian's startup timer finishes *before* `onLayoutReady` callbacks run.
- The 3-second delay ensures file indexing, sync plugins (e.g., Git), and Dataview have finished their initial burst.

---

### Pattern 4: Intent-Driven Pre-Warming & Concurrency
Trigger asset loading as early in the user interaction flow as possible, and run independent tasks concurrently:

1. **Pre-warm on modal open:**  
   When the user presses the search hotkey, the modal UI opens instantly (`< 1ms`). Kick off `ensureDb()` in `onOpen()`:
   ```typescript
   onOpen() {
       this.searchInput.focus();

       // Preload in parallel while the user reads the UI and types their query
       const dbEngine = this.plugin.getDbEngine();
       void dbEngine.ensureDb('KJV');
       void dbEngine.ensureDb('RST');
   }
   ```
   By the time the user types 2-3 characters and the debounce timer expires, the databases are already loaded.

2. **Load dependencies concurrently:**  
   Avoid sequential awaits (`await loadA(); await loadB();`). Use `Promise.all`:
   ```typescript
   const [kjvDb, rstDb] = await Promise.all([
       dbEngine.ensureDb('KJV', 5000).catch(() => null),
       dbEngine.ensureDb('RST', 5000).catch(() => null),
   ]);
   ```

---

### Pattern 5: Platform-Accelerated Decoding (Desktop vs Mobile)
If inlining assets (e.g. WASM or large JSON as base64):
- In JavaScript, `atob()` + a manual typed-array copy loop over 660 KB takes **~40ms**.
- In Electron/Node on Desktop, `Buffer.from(base64, 'base64')` takes **~0.6ms** (**64x faster**).

Always feature-detect and accelerate when running on desktop while retaining safe fallbacks for mobile:

```typescript
const base64 = DATA_URL.slice(DATA_URL.indexOf(',') + 1);

// Fast-path for Obsidian Desktop (Electron)
const nodeBuffer = (typeof window !== 'undefined'
    ? (window as unknown as { Buffer?: { from(data: string, enc: string): Uint8Array } }).Buffer
    : undefined);

let binaryBuffer: ArrayBuffer;
if (typeof nodeBuffer?.from === 'function') {
    const buf = nodeBuffer.from(base64, 'base64');
    binaryBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
} else {
    // Fallback for Obsidian Mobile (iOS / Android)
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    binaryBuffer = bytes.buffer;
}
```

---

## 4. Before & After Benchmark

| Metric | Version 1.1.6 (Before) | Optimized (After) | Improvement |
| :--- | :--- | :--- | :--- |
| **`onload()` Execution Time** | ~200–269 ms | **~0.51 ms** | **> 99% reduction** |
| **WASM Base64 Decode Time** | 40.56 ms | **0.63 ms** | **64x faster** |
| **Startup Disk I/O** | 21 MB read on launch | **0 MB** on launch | **100% eliminated** |
| **Startup Memory Footprint** | ~25 MB WASM heap allocated | **0 MB** allocated | **Deferred on demand** |
| **Search UI Latency** | Instant | **Instant** (pre-warmed during typing) | Zero regression |

---

## 5. Developer Checklist for Obsidian Startup Audits

When inspecting your own plugin or reviewing a PR:

- [ ] **Is `onload()` synchronous or minimal?**  
  Does it finish in `< 5ms`? Only `await this.loadSettings()` should be present.
- [ ] **Are there hidden synchronous loops?**  
  Look for base64 decoders, cryptographic hashing, or large array mapping called during initial module load or `onload()`.
- [ ] **Is heavy work deferred to `onLayoutReady`?**  
  Does any background indexing or warming wait for `app.workspace.onLayoutReady` plus a small debounce/timeout?
- [ ] **Can features work if initialized lazily?**  
  Does opening a modal or running a command load its own required dependencies if they aren't loaded yet?
- [ ] **Are parallel dependencies loaded with `Promise.all`?**  
  Avoid chaining sequential `await`s when independent assets can be loaded simultaneously.
- [ ] **Are desktop optimizations enabled safely?**  
  Use `Buffer` when available on desktop, without violating `obsidianmd/no-nodejs-modules` or breaking mobile compatibility.
