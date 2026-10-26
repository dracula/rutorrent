// Reading and parsing shared by the structural checks.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const THEME = join(ROOT, "Dracula");

// Read from the directory, so no sheet goes unchecked. A sheet missing from
// `extra-files` in release-please-config.json keeps an old version, which
// version.test.mjs catches.
export const SHEETS = readdirSync(THEME)
	.filter((name) => name.endsWith(".css"))
	.sort();
export const FILES = [...SHEETS, "init.js"];

export const read = (name) => readFileSync(join(THEME, name), "utf8");
export const css = SHEETS.map((name) => ({ name, text: read(name) }));

export const VERSION_HEADER = /^\s*\*\s*Version\s+(\d+\.\d+\.\d+)\b/m;

// A match inside a comment is not code.
export const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");

// The namespaces the theme both defines and reads; other names are
// upstream's contract.
export const OWNED = /^--(?:dracula|alucard|functional|variant|font|icon)-/;

export function definitions(text) {
	text = withoutComments(text);
	const found = new Set();
	// A definition follows the start of a line, a `{` or a `;`.
	for (const m of text.matchAll(/(?:^|[{;])\s*(--[a-zA-Z0-9-]+)\s*:/gm))
		found.add(m[1]);
	// `@property` defines a name too, and carries its initial value in the block
	// rather than after a colon, so the pattern above cannot see it.
	for (const m of text.matchAll(/@property\s+(--[a-zA-Z0-9-]+)/g))
		found.add(m[1]);
	return found;
}

export function references(text) {
	text = withoutComments(text);
	const found = new Set();
	// `\s*` after `var(` is load-bearing: upstream and this theme both wrap
	// long var() calls across lines, and the name can start on the next one.
	for (const m of text.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) found.add(m[1]);
	return found;
}

// Follows the @import URLs from a set of entry sheets.
export function reachableFrom(entries) {
	const seen = new Set();
	for (const queue = [...entries]; queue.length;) {
		const name = queue.shift();
		if (seen.has(name)) continue;
		seen.add(name);
		const text = withoutComments(read(name));
		for (const m of text.matchAll(/@import\s+url\("([^"?]+)/g))
			queue.push(m[1]);
	}
	return [...seen];
}

// The selectors one sheet styles. The pattern takes everything before a `{`, so
// an at-rule prelude and a declaration split across lines reach it too, and
// neither of those is a selector.
function* selectorsIn(text) {
	for (const m of withoutComments(text).matchAll(
		/(?:^|[}\n])\s*([^{}@\n][^{}]*?)\s*\{/g,
	)) {
		const sel = m[1].replace(/\s+/g, " ").trim();
		if (sel && !sel.startsWith("@") && !sel.includes(";")) yield sel;
	}
}

// Every selector in the sheets, mapped to the sheets that style it.
export function selectorOwners() {
	const seen = new Map();
	for (const { name, text } of css)
		for (const sel of selectorsIn(text)) {
			if (!seen.has(sel)) seen.set(sel, new Set());
			seen.get(sel).add(name);
		}
	return seen;
}

export const paletteText = css.find(({ name }) => name === "palette.css").text;

export const paletteHex = new Map(
	[...paletteText.matchAll(/(--[a-z]+-[a-z-]+)\s*:\s*#([0-9a-fA-F]{6})/g)].map(
		([, name, hex]) => [name, hex.toLowerCase()],
	),
);
