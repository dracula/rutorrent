// Four places where a rule and the script have to agree, and nothing on screen
// would look broken if they stopped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { read, SHEETS } from "./theme-files.mjs";

// --- The two state rows whose `icon` name upstream reversed -----------------
//
// `icon="inactive"` is the Stopped row from ruTorrent 5.2.2 and the Inactive
// row below it, so keying either glyph to the attribute paints one half of the
// supported range with the other row's icon. The ids are the core's state keys
// (`js/category-list.js`) and its filtering depends on them.

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

// --- A palette fallback is the palette --------------------------------------
//
// `draculaPaletteColor` reads a custom property and takes its second argument
// when that resolves to nothing, which is what happens whenever it is called
// before the sheets are on the page. The favicon is drawn as init.js is read —
// close enough to that edge that the ordering is not worth depending on — and a
// fallback that had drifted from the palette would paint the wrong colour with
// nothing on the page looking wrong.

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

// --- The bundled monospace face is opted into, never defaulted to -----------
//
// A browser fetches a face when a rendered element resolves to it, and on a
// phone one does: style.css carries both the JetBrains Mono faces and the log
// panel's `font-family`, and both are live until the mobile plugin disables the
// theme. Naming the face on bare :root is what makes that window cost 31,432
// bytes the mobile interface never draws.

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

// --- No sheet gives the list table a width ----------------------------------
//
// From 5.2.0 a column drag computes the new width from the width the browser
// rendered and stores it as that column's declaration (`js/stable.js:662`), so
// the two have to stay equal. `table-layout: fixed` hands any slack out in
// proportion to the declared widths, which turns a table given a width of its
// own into a feedback loop: the column jumps hundreds of pixels for a pixel of
// mouse movement and refuses to narrow once the row fills its pane. Nothing on
// screen looks wrong until someone drags a border.
//
// Media blocks are cut before the scan. The phone lays the table out from its
// content and has no border to drag, and the correction in init.js covers the
// drag wherever a rendered width and a declared one come apart anyway.

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
