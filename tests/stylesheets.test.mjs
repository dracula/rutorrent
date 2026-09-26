// What the stylesheets may contain: how much !important, which selectors may be
// written twice, and whether the hand-encoded SVGs decode.
import { test } from "node:test";
import assert from "node:assert/strict";
import { css, read, selectorOwners, withoutComments } from "./theme-files.mjs";

// --- !important does not creep ----------------------------------------------
//
// stylelint's declaration-no-important is switched off in stylelint.config.mjs,
// and this replaces it. An override theme genuinely needs !important: it is the
// only thing that outranks the inline styles ruTorrent writes. The useful
// signal is not the count but the count *growing*, where a warning per use is
// just a wall to skim past.
//
// A ratchet, not a limit. Lower these when a use is removed; raising one takes
// an argument in the commit message.
const IMPORTANT_BUDGET = {
	// Seven of these are the file-type icons, and they lose without it for the
	// reason the three beside them already do: `.stable-icon` clears the
	// background-image from a later sheet at the same specificity, so a plain
	// class never paints. The size travels inside the `background` shorthand
	// for the same reason — the shorthand resets `background-size`, and an
	// important reset outranks a separate declaration after it.
	"style.css": 42,
	// Three, none of which a later rule at equal specificity could win. The
	// dragged heading's border answers `.stable-active-header`, which upstream
	// marks !important itself (`css/stable.css:132`). The detail tabs' numeric
	// columns are right-aligned from JS, one inline style per cell. And below
	// 5.2.0 the column resize mark carries a height the script computes into
	// `style`, which no normal declaration outranks.
	"stable.css": 3,
	// Two. The second is check_port's hidden segments: the plugin empties one and
	// calls jQuery's `.hide()`, writing a plain inline `display: none`, while the
	// same elements carry Bootstrap's `d-lg-block` — `display: block !important`.
	// An important declaration outranks an inline one that is not, so a hidden
	// separator stays in the flow with its inline `margin: 0 3px`. Only
	// !important outranks !important.
	"plugins.css": 2,
	// Three. Two are Bootstrap's rather than the plugin's and sit in one rule:
	// being last of the three sheets outranks every rule the plugin writes, but
	// not a utility class that carries !important on its own declarations. See
	// the filter count's pill, where the utility forces both of them.
	//
	// The third is the icon font. `plugins/mobile/mobile.css:9` sets the family
	// on `.bi:before` with !important, and an emptied `content` does not release
	// it — the pseudo-element still lays out and the browser still fetches
	// 134,044 bytes for its metrics.
	"mobile.css": 3,
	// Four, all the same fight: `.stable-body td div` in ruTorrent below 5.2.0
	// pins every cell's box with `height: 16px !important` and
	// `margin: 0 2px !important`. The cell clips at `overflow: hidden`, so the
	// height cuts a descender off, and the margin stands the row's text 1.5px
	// left of the reference. Only !important outranks !important. Every value
	// is the reference's own — 19px for an ordinary cell, 22px for the name,
	// 16px for the progress bar, 3.5px of margin on each side.
	"legacy.css": 4,
	// Declarations only, no selectors to fight over.
	"palette.css": 0,
	"icons.css": 0,
};

// Comments are stripped before counting. Counting the raw text instead makes
// every mention of the word in prose part of the budget, so rewording a comment
// breaks the test and the numbers drift away from the declarations they are
// supposed to track.
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
	// A budget above the real count stops being a ratchet and silently permits
	// drift back up to it.
	for (const [name, budget] of Object.entries(IMPORTANT_BUDGET)) {
		const found = importantUses(name);
		assert.equal(
			found,
			budget,
			`${name} now has ${found} uses, budget says ${budget} — lower it`,
		);
	}
});

// --- No selector is styled from two sheets by accident ----------------------
//
// stylelint's no-duplicate-selectors works inside one file and cannot see
// across sheets. The three sheets are split by area — main, table, plugins — so
// the same selector in two of them is worth a second look every time.
//
// Both entries below are deliberate and each says why at its own rule.
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

// --- The inline SVGs are encoded correctly ----------------------------------
//
// There are no image files in this theme; every glyph is a data URI written by
// hand. A raw `#` is the dangerous one: it opens a fragment, so the URL
// truncates there and the icon silently vanishes rather than erroring.

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
	// Guards the guard: without it, a pattern that stops matching leaves this
	// test passing by examining nothing at all.
	assert.ok(
		count > 40,
		`only ${count} inline SVGs found — the pattern is probably wrong`,
	);
});
