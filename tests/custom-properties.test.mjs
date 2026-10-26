// Theme-owned custom properties resolve for the interface that reads them:
// the mobile plugin loads plugins.css alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	OWNED,
	css,
	definitions,
	reachableFrom,
	read,
	references,
} from "./theme-files.mjs";

const allDefined = new Set(css.flatMap(({ text }) => [...definitions(text)]));
const allReferenced = new Set(css.flatMap(({ text }) => [...references(text)]));

const ENTRY_POINTS = {
	desktop: ["style.css", "stable.css", "plugins.css"],
	"the mobile plugin": ["plugins.css"],
};

// Each exemption has a reader this repo cannot see.
const EXEMPT = new Map([
	// Read by init.js through getComputedStyle at startup, never by CSS.
	["--dracula-version", "read by draculaCheckVersions"],
	["--dracula-version-stable", "read by draculaCheckVersions"],
	["--dracula-version-plugins", "read by draculaCheckVersions"],
	// The progress bar's ends are interpolated in JS.
	["--dracula-progress-start", "read by dxSTable.prototype.create in init.js"],
	["--dracula-progress-end", "read by dxSTable.prototype.create in init.js"],
	// Written into flot's options; they reach a canvas.
	[
		"--dracula-graph-down-earlier",
		"read by rGraph.prototype.create in init.js",
	],
	["--dracula-graph-up-earlier", "read by rGraph.prototype.create in init.js"],
	// Upstream's panel-label contract, read by `css/panel-label.css`.
	["--icon-letter-color", "read by upstream css/panel-label.css"],
	["--icon-letter-background-color", "read by upstream css/panel-label.css"],
	["--icon-letter-border-color", "read by upstream css/panel-label.css"],
	// palette.css records the whole spec, used or not.
	["--dracula-current-line", "palette record: shares its hex with Comment"],
	[
		"--dracula-floating",
		"palette record: shares its hex with Background Light",
	],
	["--dracula-bg-lighter", "palette record: no surface here is this shade"],
	["--dracula-bg-darker", "palette record: no surface here is this shade"],
	["--dracula-line-highlight", "palette record: no line highlight here"],
	["--alucard-current-line", "palette record: shares its hex with Comment"],
	["--alucard-floating", "palette record: not a surface this interface has"],
	["--alucard-bg-lighter", "palette record: no surface here is this shade"],
	["--alucard-bg-darker", "palette record: no surface here is this shade"],
	["--alucard-line-highlight", "palette record: no line highlight here"],
	[
		"--alucard-yellow",
		"palette record: Dark's yellow has readers, Light's has none yet",
	],
	[
		"--alucard-pink",
		"palette record: Dark's pink has readers, Light's has none yet",
	],
	["--functional-red", "palette record: chrome colours, measured and not used"],
	[
		"--functional-orange",
		"palette record: chrome colours, measured and not used",
	],
	[
		"--functional-green",
		"palette record: chrome colours, measured and not used",
	],
	[
		"--functional-cyan",
		"palette record: chrome colours, measured and not used",
	],
	[
		"--functional-purple",
		"palette record: chrome colours, measured and not used",
	],
]);

test("every name the theme owns and references is defined somewhere in it", () => {
	const missing = [...allReferenced].filter(
		(n) => OWNED.test(n) && !allDefined.has(n),
	);
	assert.deepEqual(
		missing,
		[],
		`referenced but never defined: ${missing.join(", ")}`,
	);
});

test("every name an interface reads is defined in a sheet that interface loads", () => {
	for (const [ui, entries] of Object.entries(ENTRY_POINTS)) {
		const texts = reachableFrom(entries).map(read);
		const defined = new Set(texts.flatMap((t) => [...definitions(t)]));
		const missing = [
			...new Set(texts.flatMap((t) => [...references(t)])),
		].filter((n) => OWNED.test(n) && !defined.has(n));
		assert.deepEqual(
			missing,
			[],
			`${ui} reads but cannot resolve: ${missing.join(", ")}`,
		);
	}
});

test("no name the theme owns is defined and then never used", () => {
	const dead = [...allDefined].filter(
		(n) => OWNED.test(n) && !allReferenced.has(n) && !EXEMPT.has(n),
	);
	assert.deepEqual(dead, [], `defined but never used: ${dead.join(", ")}`);
});

test("the exemption list has not gone stale", () => {
	// An exemption for a name that no longer exists misleads the next reader.
	const gone = [...EXEMPT.keys()].filter((n) => !allDefined.has(n));
	assert.deepEqual(
		gone,
		[],
		`exempted but no longer defined, drop from EXEMPT: ${gone.join(", ")}`,
	);
});
