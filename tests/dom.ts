/**
 * Test-only DOM environment helpers.
 *
 * Obsidian extends HTMLElement with helpers like createDiv/createEl/setText.
 * These don't exist in jsdom, so the DOM tests install a minimal compatible
 * subset on the prototype before rendering results.
 */

interface ElementOptions {
	cls?: string;
	text?: string;
	attr?: Record<string, string>;
}

type ElementTag = keyof HTMLElementTagNameMap;

function applyOptions<T extends HTMLElement>(el: T, options?: ElementOptions): T {
	if (options?.cls) el.className = options.cls;
	if (options?.text !== undefined) el.textContent = options.text;
	if (options?.attr) {
		for (const [name, value] of Object.entries(options.attr)) {
			el.setAttribute(name, value);
		}
	}
	return el;
}

function createChild<T extends HTMLElement>(
	parent: HTMLElement,
	tag: ElementTag,
	options?: ElementOptions
): T {
	const child = document.createElement(tag) as T;
	applyOptions(child, options);
	parent.appendChild(child);
	return child;
}

/** Install the Obsidian DOM helper subset (idempotent). */
export function installObsidianDomHelpers(): void {
	const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
	if (proto.__bibleSearchDomHelpers) return;
	proto.__bibleSearchDomHelpers = true;

	proto.empty = function (this: HTMLElement): void {
		this.textContent = '';
	};
	proto.setText = function (this: HTMLElement, text: string): void {
		this.textContent = text;
	};
	proto.appendText = function (this: HTMLElement, text: string): void {
		this.appendChild(document.createTextNode(text));
	};
	proto.createDiv = function (this: HTMLElement, options?: ElementOptions): HTMLDivElement {
		return createChild<HTMLDivElement>(this, 'div', options);
	};
	proto.createSpan = function (this: HTMLElement, options?: ElementOptions): HTMLSpanElement {
		return createChild<HTMLSpanElement>(this, 'span', options);
	};
	proto.createEl = function <T extends HTMLElement>(
		this: HTMLElement,
		tag: ElementTag,
		options?: ElementOptions
	): T {
		return createChild<T>(this, tag, options);
	};
	proto.addClass = function (this: HTMLElement, ...classes: string[]): void {
		this.classList.add(...classes);
	};
	proto.removeClass = function (this: HTMLElement, ...classes: string[]): void {
		this.classList.remove(...classes);
	};
}
