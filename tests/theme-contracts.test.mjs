// Places where a rule and the script have to agree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { read, SHEETS } from "./theme-files.mjs";

// --- The Stopped and Inactive rows ---
// Upstream reversed their `icon` names at 5.2.2, so the glyphs key on the ids.

test("the Stopped and Inactive rows take their icon from the id", () => {
	const text = read("style.css");

	for (const [id, glyph] of [
		["-_-_-wfa-_-_-", "--icon-status-stopped"],
		["-_-_-iac-_-_-", "--icon-status-inactive"],
	])
		assert.match(
			text,
			new RegExp(
				`panel-label#${id}\\s*\\{[^}]*--status-image:\\s*var\\(${glyph}\\)`,
			),
			`no rule gives #${id} ${glyph}`,
		);

	for (const name of ["inactive", "paused"])
		assert.doesNotMatch(
			text,
			new RegExp(`panel-label\\[icon="${name}"\\][^{]*\\{[^}]*--status-image`),
			`icon="${name}" sets --status-image, and below 5.2.2 it is the other row`,
		);
});

// --- A palette fallback is the palette ---
// The favicon can draw before the sheets apply, so a fallback must match the
// palette.

test("every palette fallback in init.js is the value palette.css publishes", () => {
	const palette = read("palette.css");
	const calls = [
		...read("init.js").matchAll(
			/draculaPaletteColor\(\s*"(--[a-z0-9-]+)"\s*,\s*"(#[0-9a-fA-F]{6})"\s*\)/g,
		),
	];
	assert.ok(calls.length, "no draculaPaletteColor call carries a fallback");
	for (const [, name, fallback] of calls) {
		const declared = palette.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
		assert.ok(declared, `${name} is not defined in palette.css`);
		assert.equal(
			fallback.toLowerCase(),
			declared[1].toLowerCase(),
			`init.js falls back to ${fallback} for ${name}, palette.css says ${declared[1]}`,
		);
	}
});

// --- The bundled monospace face is opt-in ---
// On a phone the log panel would fetch it before the mobile plugin disables
// the theme.

test("--font-mono names the bundled face only behind the desktop mark", () => {
	const fonts = read("fonts.css");

	const base = fonts.match(/:root\s*\{[^}]*--font-mono:\s*([^;]+);/);
	assert.ok(base, "fonts.css declares no --font-mono on :root");
	assert.doesNotMatch(
		base[1],
		/JetBrains/,
		"the default --font-mono names the bundled face, so a phone fetches it",
	);

	assert.match(
		fonts,
		/:root\.dracula-desktop\s*\{[^}]*--font-mono:\s*"JetBrains Mono"/,
		"no rule gives the marked page the bundled face",
	);

	assert.match(
		read("init.js"),
		/classList\.add\("dracula-desktop"\)/,
		"init.js never puts the mark on, so the bundled face is unreachable",
	);
});

// --- No sheet gives the list table a width ---
// A column drag stores the rendered width as the declared one, so a sized
// table feeds the drag its own output. Media blocks are cut: the phone has no
// border to drag.

test("no rule sizes .stable table", () => {
	for (const sheet of SHEETS) {
		const css = read(sheet)
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");

		for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
			if (!/\.stable\s+table(?![\w-])/.test(selector)) continue;
			assert.doesNotMatch(
				body,
				/(?:^|[;\s])(?:min-|max-)?width\s*:/,
				`${sheet} gives .stable table a width, which breaks the column drag`,
			);
		}
	}
});
