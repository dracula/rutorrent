// One version in many places: each file's header, the three stamped sheets,
// init.js and the @import URLs. The five imported sheets stamp nothing at
// runtime, so only these tests read their headers.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	FILES,
	SHEETS,
	VERSION_HEADER,
	read,
	withoutComments,
} from "./theme-files.mjs";

const declaredVersion = () =>
	read("init.js").match(/DRACULA_VERSION\s*=\s*"([^"]+)"/);

test("every shipped file states its version in its header", () => {
	for (const name of FILES) {
		const m = read(name).match(VERSION_HEADER);
		assert.ok(m, `${name} has no "Version X.Y.Z" line in its header`);
	}
});

test("the header version agrees across the shipped files", () => {
	const seen = FILES.map((name) => [name, read(name).match(VERSION_HEADER)[1]]);
	const [, first] = seen[0];
	for (const [name, v] of seen)
		assert.equal(v, first, `${name} says ${v}, ${seen[0][0]} says ${first}`);
});

test("the machine-readable stamps agree with the headers", () => {
	const declared = declaredVersion();
	assert.ok(declared, "init.js has no DRACULA_VERSION constant");

	const stamps = {
		"style.css": /--dracula-version:\s*"([^"]+)"/,
		"stable.css": /--dracula-version-stable:\s*"([^"]+)"/,
		"plugins.css": /--dracula-version-plugins:\s*"([^"]+)"/,
	};
	for (const [name, pattern] of Object.entries(stamps)) {
		const m = read(name).match(pattern);
		assert.ok(m, `${name} does not stamp its version on :root`);
		assert.equal(
			m[1],
			declared[1],
			`${name} stamps ${m[1]} but init.js is ${declared[1]}`,
		);
	}
	assert.equal(
		declared[1],
		read("init.js").match(VERSION_HEADER)[1],
		"init.js header and DRACULA_VERSION disagree",
	);
});

// An @import whose version stops moving is served from cache.
test("every @import asks for the version the theme is on", () => {
	const declared = declaredVersion()[1];
	let found = 0;
	for (const name of SHEETS) {
		// Every @import, including a new one.
		for (const m of withoutComments(read(name)).matchAll(/@import\s+[^;]*;/g)) {
			found++;
			const statement = m[0].replace(/\s+/g, " ").trim();
			const asked = statement.match(/\?v=([^"')\s]+)/);
			assert.ok(
				asked,
				`${name}: ${statement} carries no ?v=, so an edit to the imported ` +
					`sheet keeps its URL and the browser answers from cache`,
			);
			assert.equal(
				asked[1],
				declared,
				`${name}: ${statement} asks for ${asked[1]}, the theme is ${declared}`,
			);
		}
	}
	// Exact: another import is a decision worth a look at this test.
	assert.equal(
		found,
		8,
		`expected 8 @imports across the sheets, found ${found}`,
	);
});

// The imports are the only way the imported sheets reach a page.
test("the sheets that carry the imports still carry them", () => {
	const carries = (sheet, target) =>
		assert.match(
			read(sheet),
			new RegExp(`@import\\s+url\\("${target.replace(".", "\\.")}`),
			`${sheet} no longer imports ${target}`,
		);
	for (const target of ["palette.css", "fonts.css", "icons.css"])
		carries("style.css", target);
	for (const target of ["palette.css", "fonts.css", "icons.css", "mobile.css"])
		carries("plugins.css", target);
});
