// What the stylesheets may contain: how much !important, which selectors may be
// written twice, and whether the hand-encoded SVGs decode.
import { test } from "node:test";
import assert from "node:assert/strict";
import { css, read, selectorOwners, withoutComments } from "./theme-files.mjs";

// --- !important does not creep ---
// A ratchet, not a limit: lower a budget when a use goes. Raising one takes
// an argument in the commit message.
const IMPORTANT_BUDGET = {
	// Seven are the file-type icons: `.stable-icon` clears the image from a
	// later sheet.
	"style.css": 42,
	// The dragged heading's border, which upstream marks !important; the detail
	// tabs' inline alignment; and below 5.2.0 the resize mark's inline height.
	"stable.css": 3,
	// check_port's hidden segments carry Bootstrap's !important `d-lg-block`.
	"plugins.css": 2,
	// Two are a Bootstrap utility's; the third is the icon font the plugin sets
	// with !important.
	"mobile.css": 3,
	// Below 5.2.0 upstream pins every cell's div with an !important height and
	// margin.
	"legacy.css": 4,
	// Declarations only, no selectors to fight over.
	"palette.css": 0,
	"icons.css": 0,
};

// Comments are stripped before counting.
const importantUses = (name) =>
	(withoutComments(read(name)).match(/!important/g) || []).length;

test("!important stays inside its audited budget", () => {
	for (const [name, budget] of Object.entries(IMPORTANT_BUDGET)) {
		const found = importantUses(name);
		assert.ok(
			found <= budget,
			`${name} has ${found} uses of !important, budget is ${budget}. ` +
				`Adding one needs a reason; if the reason is good, raise the budget here.`,
		);
	}
});

test("the !important budget is not stale", () => {
	// A budget above the count permits drift back up to it.
	for (const [name, budget] of Object.entries(IMPORTANT_BUDGET)) {
		const found = importantUses(name);
		assert.equal(
			found,
			budget,
			`${name} now has ${found} uses, budget says ${budget} — lower it`,
		);
	}
});

// --- No selector is styled from two sheets by accident ---
// stylelint's no-duplicate-selectors cannot see across files.
const CROSS_FILE_ALLOWED = new Map([
	[
		":root",
		"each sheet stamps its own version, which is the point of the check in init.js",
	],
	[
		"#StatusBar",
		"background must load after the plugin sheets, layout need not — see the notes at both rules",
	],
]);

test("no selector is styled from two sheets without a reason", () => {
	const shared = [...selectorOwners()]
		.filter(([sel, files]) => files.size > 1 && !CROSS_FILE_ALLOWED.has(sel))
		.map(([sel, files]) => `${sel} in ${[...files].join(" + ")}`);
	assert.deepEqual(
		shared,
		[],
		`styled from more than one sheet: ${shared.join("; ")}`,
	);
});

test("the cross-sheet allowance is not stale", () => {
	const owners = selectorOwners();
	const pointless = [...CROSS_FILE_ALLOWED.keys()].filter(
		(sel) => !owners.has(sel) || owners.get(sel).size < 2,
	);
	assert.deepEqual(
		pointless,
		[],
		`allowed but no longer shared, drop from CROSS_FILE_ALLOWED: ${pointless.join(", ")}`,
	);
});

// --- The inline SVGs are encoded correctly ---
// A raw `#` opens a fragment and truncates the URL.

test("every inline SVG data URI decodes to a well-formed svg element", () => {
	let count = 0;
	for (const { name, text } of css) {
		for (const m of text.matchAll(/url\("data:image\/svg\+xml,([^"]*)"\)/g)) {
			count++;
			const raw = m[1];
			assert.ok(
				!raw.includes("#"),
				`${name}: an inline SVG contains a raw # — it must be %23, or the URL truncates there`,
			);
			let decoded;
			assert.doesNotThrow(() => {
				decoded = decodeURIComponent(raw);
			}, `${name}: an inline SVG is not valid percent-encoding`);
			assert.match(
				decoded,
				/^<svg[\s\S]*<\/svg>$/,
				`${name}: a decoded SVG does not open and close with <svg>`,
			);
		}
	}
	// Guards the guard: a pattern that stops matching would pass by examining
	// nothing.
	assert.ok(
		count > 40,
		`only ${count} inline SVGs found — the pattern is probably wrong`,
	);
});
