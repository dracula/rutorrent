// Unit tests for the pure functions in Dracula/init.js. ruTorrent splices the
// file into a PHP response, so it cannot be a module: node:vm evaluates the
// real file and reads the top-level functions off the sandbox. The
// DOM-wrapping functions are not tested.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const SRC = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"Dracula",
	"init.js",
);

// The globals init.js touches at module scope; a new one has to be added
// here.
function loadTheme() {
	const noop = () => {};
	const sandbox = {
		plugin: { allDone: noop },
		thePlugins: { get: () => ({}) },
		theWebUI: { settings: {}, getStatusIcon: () => ["", ""], version: "5.3.7" },
		dStatus: { started: 1, paused: 2, checking: 4, hashing: 8, error: 16 },
		dxSTable: { prototype: { create: noop, renameColumnById: noop } },
		RGBackground: function () {},
		rGraph: undefined,
		ALIGN_LEFT: 0,
		$: undefined,
		console: { warn: noop, log: noop },
		document: {
			// A palette color is read through a throwaway element.
			documentElement: { appendChild: noop, removeChild: noop },
			addEventListener: noop,
			querySelectorAll: () => [],
			getElementById: () => null,
			createElement: () => ({
				style: {},
				appendChild: noop,
				setAttribute: noop,
				parentNode: { removeChild: noop },
			}),
			head: { appendChild: noop },
		},
		setTimeout: noop,
		clearTimeout: noop,
		MutationObserver: function () {
			return { observe: noop, disconnect: noop };
		},
		// An empty `color` is a palette that has not loaded.
		getComputedStyle: () => ({ getPropertyValue: () => "", color: "" }),
		Image: function () {},
		matchMedia: () => ({
			addEventListener: noop,
			addListener: noop,
			matches: false,
		}),
	};
	sandbox.window = sandbox;
	vm.createContext(sandbox);
	vm.runInContext(readFileSync(SRC, "utf8"), sandbox, { filename: SRC });
	return sandbox;
}

const theme = loadTheme();

// Evaluating the file is a smoke test.
test("init.js evaluates against a stub ruTorrent and exposes its helpers", () => {
	for (const fn of [
		"draculaRatioLimit",
		"draculaMinorError",
		"draculaErrorIcon",
		"draculaStoppedTorrent",
		"draculaUserSizedColumn",
		"draculaOlderThan",
		"draculaIconKind",
		"draculaCssUrl",
		"draculaMobileRateAt",
		"draculaCountsTooltip",
		"draculaVisualScale",
		"draculaSharedWords",
		"draculaDropWords",
		"draculaTrimEllipsis",
	])
		assert.equal(typeof theme[fn], "function", `${fn} is missing`);
});

test("the theme version is a plain semver string", () => {
	assert.match(theme.DRACULA_VERSION, /^\d+\.\d+\.\d+$/);
	assert.match(theme.DRACULA_RUTORRENT_MIN, /^\d+\.\d+\.\d+$/);
});

// "5.10" sorts below "5.9" as text.
test("draculaOlderThan compares versions as numbers, not as text", () => {
	assert.equal(theme.draculaOlderThan("5.1.12", "5.2.0"), true);
	assert.equal(theme.draculaOlderThan("5.2.0", "5.2.0"), false);
	assert.equal(theme.draculaOlderThan("5.3.12", "5.2.0"), false);
	assert.equal(theme.draculaOlderThan("5.9.0", "5.10.0"), true);
	assert.equal(theme.draculaOlderThan("5.10.0", "5.9.0"), false);
	assert.equal(theme.draculaOlderThan("4.3.11", "5.2.0"), true);
	// A version with parts missing reads them as zero rather than as NaN.
	assert.equal(theme.draculaOlderThan("5.2", "5.2.0"), false);
});

// The `mnu_add` and `mnu_create` labels as ruTorrent and its create plugin
// ship them.
test("draculaSharedWords finds the noun whatever the language does with it", () => {
	const cases = [
		["Add Torrent", "Create Torrent", ["torrent"]],
		["Torrent dazu", "Create Torrent", ["torrent"]],
		["Добавить торрент", "Новый торрент", ["торрент"]],
		["토렌트 추가", "토렌트 생성", ["토렌트"]],
		["添加 Torrent", "创建 Torrent", ["torrent"]],
		["Torrent hozzáadása", "Torrent létrehozása", ["torrent"]],
		["Додај торент", "Направи торент", ["торент"]],
		// French shares the article too.
		["Ajouter un torrent", "Créer un torrent", ["un", "torrent"]],
	];
	// `Array.from` re-homes the result: node:vm gives the sandbox its own realm.
	for (const [add, create, want] of cases)
		assert.deepEqual(
			Array.from(theme.draculaSharedWords(add, create)),
			want,
			add,
		);
});

// Labels that share nothing are left to the stylesheet to clip.
test("draculaSharedWords finds nothing rather than guessing", () => {
	assert.deepEqual(Array.from(theme.draculaSharedWords("Dodaj", "Utwórz")), []);
	assert.deepEqual(
		Array.from(theme.draculaSharedWords("Pievienot torentu", "Create Torrent")),
		[],
	);
	assert.deepEqual(Array.from(theme.draculaSharedWords("Add Torrent", "")), []);
	assert.deepEqual(
		Array.from(theme.draculaSharedWords(undefined, "Create Torrent")),
		[],
	);
});

// Only plugin buttons carry the dots in the label.
test("draculaTrimEllipsis takes the dots a plugin writes into a label", () => {
	assert.equal(
		theme.draculaTrimEllipsis("Create Torrent..."),
		"Create Torrent",
	);
	assert.equal(
		theme.draculaTrimEllipsis("RSS Downloader..."),
		"RSS Downloader",
	);
	// The single character as well as the three dots.
	assert.equal(theme.draculaTrimEllipsis("Plugins…"), "Plugins");
	assert.equal(theme.draculaTrimEllipsis("Settings"), "Settings");
	// Dots and nothing else name no command, so they stay.
	assert.equal(theme.draculaTrimEllipsis("..."), "...");
});

test("draculaDropWords takes the noun and leaves the verb", () => {
	assert.equal(theme.draculaDropWords("Add Torrent", ["torrent"]), "Add");
	assert.equal(theme.draculaDropWords("Torrent dazu", ["torrent"]), "dazu");
	assert.equal(
		theme.draculaDropWords("Ajouter un torrent", ["un", "torrent"]),
		"Ajouter",
	);
	// Nothing to drop is not a reason to touch the label.
	assert.equal(theme.draculaDropWords("Remove", ["torrent"]), "Remove");
	assert.equal(theme.draculaDropWords("Remove", []), "Remove");
});

// Trimming comes first: the noun is compared as a bare word.
test("trimming before dropping is what shortens a plugin's label", () => {
	const words = theme.draculaSharedWords("Add Torrent", "Create Torrent");
	assert.equal(
		theme.draculaDropWords(
			theme.draculaTrimEllipsis("Create Torrent..."),
			words,
		),
		"Create",
	);
});

// A label reduced to nothing says less than one that has to be clipped.
test("draculaDropWords never empties a label", () => {
	assert.equal(theme.draculaDropWords("Torrent", ["torrent"]), "Torrent");
});

// The budget is by area, so a small canvas may be dense.
test("draculaRatioLimit: a small meter gets all the density it asks for", () => {
	assert.ok(theme.draculaRatioLimit(100, 20) > 10);
});

test("draculaRatioLimit: never below 1, never past the 8192 side limit", () => {
	assert.equal(theme.draculaRatioLimit(20000, 20000), 1);
	assert.equal(theme.draculaRatioLimit(4096, 1), 2);
	assert.ok(theme.draculaRatioLimit(0, 0) >= 1);
});

test("draculaRatioLimit: stays inside the 8,000,000 pixel budget", () => {
	for (const [w, h] of [
		[100, 20],
		[800, 300],
		[1920, 400],
		[4000, 2000],
	]) {
		const r = theme.draculaRatioLimit(w, h);
		assert.ok(w * r * h * r <= 8000001, `${w}x${h} @ ${r}`);
	}
});

// An allowlist: an unknown phrasing lands in the loud bucket.
test("draculaMinorError: announce noise and a tracker takedown are minor", () => {
	assert.equal(
		theme.draculaMinorError({ msg: "Tracker: [network error: ETIMEDOUT]" }),
		true,
	);
	assert.equal(
		theme.draculaMinorError({
			msg: "Tracker: [No DHT nodes available for peer search.]",
		}),
		true,
	);
	// `chkstate` arrives as a string.
	assert.equal(theme.draculaMinorError({ chkstate: "4" }), true);
	assert.equal(theme.draculaMinorError({ chkstate: 4 }), true);
});

test("draculaMinorError: a real data error is never quiet", () => {
	// rTorrent's exact wording when the file is deleted under a torrent.
	assert.equal(
		theme.draculaMinorError({
			msg: "Download registered as completed, but hash check returned unfinished chunks.",
		}),
		false,
	);
	assert.equal(theme.draculaMinorError({ msg: "" }), false);
	assert.equal(theme.draculaMinorError({}), false);
	// "Tracker" has to be the start of the message, not merely present in it.
	assert.equal(
		theme.draculaMinorError({ msg: "Files missing. Tracker: fine" }),
		false,
	);
	// A chkstate that is not 4 says nothing about severity.
	assert.equal(theme.draculaMinorError({ chkstate: "7" }), false);
});

test("draculaErrorIcon: matches the three upstream error classes and nothing else", () => {
	assert.equal(theme.draculaErrorIcon("Status_Error"), true);
	assert.equal(theme.draculaErrorIcon("Status_Error_Up"), true);
	assert.equal(theme.draculaErrorIcon("Status_Error_Down"), true);
	assert.equal(theme.draculaErrorIcon("Status_Warning"), false);
	assert.equal(theme.draculaErrorIcon("Status_Stopped"), false);
	assert.equal(theme.draculaErrorIcon(""), false);
});

test("draculaStoppedTorrent: only started, checking or hashing count as running", () => {
	assert.equal(theme.draculaStoppedTorrent({ state: 0 }), true);
	// The paused bit alone does not mean running: upstream reaches
	// Status_Paused only when started is set too.
	assert.equal(theme.draculaStoppedTorrent({ state: 2 }), true);
	assert.equal(theme.draculaStoppedTorrent({ state: 16 }), true); // error alone
	assert.equal(theme.draculaStoppedTorrent({ state: 1 }), false);
	assert.equal(theme.draculaStoppedTorrent({ state: 3 }), false); // started|paused
	assert.equal(theme.draculaStoppedTorrent({ state: 4 }), false);
	assert.equal(theme.draculaStoppedTorrent({ state: 8 }), false);
	assert.equal(theme.draculaStoppedTorrent({ state: 19 }), false);
});

// The profile carries a width for every column whether or not anyone chose it,
// so the declaration it was saved from is what tells the two apart.
test("draculaUserSizedColumn: only a width unlike the declaration is the user's", () => {
	// Saved exactly what upstream declares: nobody touched it.
	assert.equal(theme.draculaUserSizedColumn([110], 0, "110px"), false);
	// Dragged away from the declaration.
	assert.equal(theme.draculaUserSizedColumn([309], 0, "200px"), true);
	// No width worth the name, and config() would not apply it either.
	assert.equal(theme.draculaUserSizedColumn([3], 0, "70px"), false);
	assert.equal(theme.draculaUserSizedColumn(null, 0, "70px"), false);
	assert.equal(theme.draculaUserSizedColumn([10], 5, "70px"), false);
	// A declaration that cannot be read leaves the column alone.
	assert.equal(theme.draculaUserSizedColumn([80], 0, undefined), true);
	assert.equal(theme.draculaUserSizedColumn([80], 0, "auto"), true);
});

test("draculaIconKind: only tracklabels URLs classify, and by their parameter", () => {
	assert.equal(
		theme.draculaIconKind("plugins/tracklabels/action.php?label=x"),
		"label",
	);
	assert.equal(
		theme.draculaIconKind("plugins/tracklabels/action.php?tracker=y"),
		"tracker",
	);
	assert.equal(
		theme.draculaIconKind("plugins/tracklabels/action.php?other=z"),
		null,
	);
	assert.equal(theme.draculaIconKind("some/other/url?label=x"), null);
	assert.equal(theme.draculaIconKind(""), null);
	assert.equal(theme.draculaIconKind(null), null);
});

// The Trackers tab keeps the icon URL in an inline background.
test("draculaCssUrl: unwraps a background whatever the browser quoted it with", () => {
	const target = "plugins/tracklabels/action.php?tracker=debian.org";
	assert.equal(theme.draculaCssUrl(`url("${target}")`), target);
	assert.equal(theme.draculaCssUrl(`url('${target}')`), target);
	assert.equal(theme.draculaCssUrl(`url(${target})`), target);
	assert.equal(theme.draculaCssUrl(`  url( "${target}" )  `), target);
});

test("draculaCssUrl: anything that is not one plain url() answers empty", () => {
	assert.equal(theme.draculaCssUrl("none"), "");
	assert.equal(theme.draculaCssUrl(""), "");
	assert.equal(theme.draculaCssUrl(null), "");
	assert.equal(theme.draculaCssUrl(undefined), "");
	assert.equal(theme.draculaCssUrl("linear-gradient(red, blue)"), "");
	// A stack of layers: the row is painting something of its own as well.
	assert.equal(theme.draculaCssUrl("url(a.png), url(b.png)"), "");
});

// The plugin writes ` ↑` and ` ↓` before `theConverter.speed`, upload first.
test("draculaMobileRateAt: finds a reading, arrow and unit included", () => {
	const line = "Downloading ↓130.0 KiB/s | ETA 5h 5m";
	const found = theme.draculaMobileRateAt(line, 0);
	assert.equal(found.direction, "down");
	assert.equal(line.substr(found.start, found.length), "↓130.0 KiB/s");
});

test("draculaMobileRateAt: both readings of a line, in the order written", () => {
	const line = "Seeding ↑1.5 MiB/s ↓130.0 KiB/s | Ratio 0.377";
	const up = theme.draculaMobileRateAt(line, 0);
	assert.equal(up.direction, "up");
	assert.equal(line.substr(up.start, up.length), "↑1.5 MiB/s");

	const down = theme.draculaMobileRateAt(line, up.start + up.length);
	assert.equal(down.direction, "down");
	assert.equal(line.substr(down.start, down.length), "↓130.0 KiB/s");
});

// A rate at the very end has no space to stop at, and a zero rate is written as
// nothing at all rather than as a reading of zero.
test("draculaMobileRateAt: the last reading runs to the end of the line", () => {
	const line = "Seeding ↑1.5 MiB/s";
	const found = theme.draculaMobileRateAt(line, 0);
	assert.equal(line.substr(found.start, found.length), "↑1.5 MiB/s");
});

test("draculaMobileRateAt: a line without a rate finds nothing", () => {
	assert.equal(theme.draculaMobileRateAt("Seeding | Ratio 0.377", 0), null);
	assert.equal(theme.draculaMobileRateAt("", 0), null);
	assert.equal(theme.draculaMobileRateAt(null, 0), null);
	// An arrow with nothing after it is not a reading.
	assert.equal(theme.draculaMobileRateAt("Seeding ↓", 0), null);
});

// rTorrent 0.9.8 reports no open file count, and upstream hides it.
test("draculaCountsTooltip: a count with no value takes its label with it", () => {
	assert.equal(
		theme.draculaCountsTooltip("Open Connections", [
			{ label: "HTTP", value: "0" },
			{ label: "Sockets", value: "22" },
			{ label: "File Descriptors", value: "" },
		]),
		"Open Connections\nHTTP: 0\nSockets: 22",
	);
});

test("draculaCountsTooltip: a zero is a value and stays", () => {
	assert.equal(
		theme.draculaCountsTooltip("Open Connections", [
			{ label: "HTTP", value: "0" },
		]),
		"Open Connections\nHTTP: 0",
	);
});

test("draculaCountsTooltip: with nothing to report only the title is left", () => {
	assert.equal(
		theme.draculaCountsTooltip("Open Connections", [
			{ label: "HTTP", value: "" },
			{ label: "Sockets", value: "" },
			{ label: "File Descriptors", value: "" },
		]),
		"Open Connections",
	);
	assert.equal(
		theme.draculaCountsTooltip("Open Connections", []),
		"Open Connections",
	);
});

test("draculaVisualScale: falls back to 1 when the viewport reports nothing", () => {
	assert.equal(theme.draculaVisualScale(), 1);
});

// A row's tooltip. rTorrent leaves `msg` an empty string on a torrent with
// nothing wrong, and the daemon's own text is what goes under the name.
test("draculaTorrentNote: a message goes on its own line under the name", () => {
	assert.equal(
		theme.draculaTorrentNote(
			"debian-13.6.0-amd64-netinst.iso",
			"Tracker: [No DHT nodes available for peer search.]",
		),
		"debian-13.6.0-amd64-netinst.iso\n" +
			"Tracker: [No DHT nodes available for peer search.]",
	);
});

test("draculaTorrentNote: nothing to report leaves the name alone", () => {
	assert.equal(theme.draculaTorrentNote("alpine.iso", ""), "alpine.iso");
	assert.equal(theme.draculaTorrentNote("alpine.iso", "   "), "alpine.iso");
	assert.equal(theme.draculaTorrentNote("alpine.iso", undefined), "alpine.iso");
});

// The plugin writes the status line as one string; the lines below follow
// its template.

test("draculaMobileRatioAt: finds the value, whatever precedes it", () => {
	const at = (text, word = "Ratio") => theme.draculaMobileRatioAt(text, word);

	const plain = at("Seeding | Ratio 0.377");
	assert.equal(plain.value, 0.377);
	assert.equal(
		"Seeding | Ratio 0.377".substr(plain.start, plain.length),
		"0.377",
	);

	// A tracker message follows the value, so it ends at a space, not at the end.
	const withMessage = at("Seeding | Ratio 1.250 | ");
	assert.equal(withMessage.value, 1.25);
	assert.equal(withMessage.length, 5);

	// Speeds sit between the state and the separator.
	const withSpeeds = at("Seeding ↑12.3 KiB/s | Ratio 2.000");
	assert.equal(withSpeeds.value, 2);

	// The word is the user's language, never assumed.
	assert.equal(at("Раздаётся | Рейтинг 0.500", "Рейтинг").value, 0.5);
});

test("draculaMobileRatioAt: finds nothing rather than guessing", () => {
	const at = (text, word = "Ratio") => theme.draculaMobileRatioAt(text, word);

	// A downloading torrent shows an ETA and carries no ratio at all.
	assert.equal(at("Downloading | ETA ∞"), null);
	// The plugin writes ∞ for an unknown ratio: no number, no side of 1.
	assert.equal(at("Seeding | Ratio ∞"), null);
	// The word alone, with nothing behind it.
	assert.equal(at("Seeding | Ratio "), null);
	assert.equal(at("Seeding | Ratio"), null);
	// Nothing to read.
	assert.equal(at(""), null);
	assert.equal(at(null), null);
	assert.equal(at("Seeding | Ratio 1.0", ""), null);
	assert.equal(at("Seeding | Ratio 1.0", null), null);
});

test("draculaMobileRatioAt: 1.000 is met, 0.999 is not", () => {
	const value = (text) => theme.draculaMobileRatioAt(text, "Ratio").value;
	assert.equal(value("Ratio 0.999") >= 1, false);
	assert.equal(value("Ratio 1.000") >= 1, true);
	assert.equal(value("Ratio 1.001") >= 1, true);
	assert.equal(value("Ratio 0.000") >= 1, false);
	// A ratio past ten still parses whole, not truncated at the dot.
	assert.equal(value("Ratio 12.500"), 12.5);
});

test("draculaMobileSeparatorAt: points at the bar, not at its spaces", () => {
	const at = (text, from = 0) => theme.draculaMobileSeparatorAt(text, from);

	const line = "Seeding | Ratio 0.377 | ";
	const first = at(line);
	assert.equal(line[first], "|");
	assert.equal(line.substr(first - 1, 3), " | ");

	// Both of the plugin's separators are reachable by walking forward.
	const second = at(line, first + 1);
	assert.equal(line[second], "|");
	assert.notEqual(second, first);
	assert.equal(at(line, second + 1), -1);
});

test("draculaSpeedUnitAt: the seam is the one space the converter writes", () => {
	const at = (text) => theme.draculaSpeedUnitAt(text);

	const rate = "1.2 MiB/s";
	assert.equal(rate.slice(0, at(rate) - 1), "1.2");
	assert.equal(rate.slice(at(rate)), "MiB/s");

	// The unit is whatever the user's language calls it, and "/s" rides with it.
	const russian = "340.0 КиБ/с";
	assert.equal(russian.slice(at(russian)), "КиБ/с");

	// A whole number and a long one both split at the same seam.
	assert.equal("15 B/s".slice(at("15 B/s")), "B/s");
	assert.equal("1024.75 GiB/s".slice(at("1024.75 GiB/s")), "GiB/s");
});

test("draculaSpeedUnitAt: anything that is not a rate splits nowhere", () => {
	const at = (text) => theme.draculaSpeedUnitAt(text);

	// A rate of zero is the empty string, not "0 B/s".
	assert.equal(at(""), -1);
	assert.equal(at(null), -1);
	assert.equal(at(undefined), -1);
	// No seam at all.
	assert.equal(at("1.2MiB/s"), -1);
	// Something that is not a number in front of it.
	assert.equal(at("about 1.2 MiB/s"), -1);
	assert.equal(at(" 1.2 MiB/s"), -1);
	assert.equal(at("- MiB/s"), -1);
});

test("draculaMobileSeparatorAt: a bar without its spaces is not one", () => {
	const at = (text, from = 0) => theme.draculaMobileSeparatorAt(text, from);

	// What the plugin writes is " | ". Anything else came from the daemon, in
	// a state string or a speed, and is text rather than structure.
	assert.equal(at("Seeding|Ratio 0.377"), -1);
	assert.equal(at("Seeding |Ratio 0.377"), -1);
	assert.equal(at("Seeding| Ratio 0.377"), -1);

	// A downloading line has one separator; a bare state has none.
	assert.equal(at("Downloading | ETA ∞") >= 0, true);
	assert.equal(at("Hashing"), -1);

	// Nothing to read.
	assert.equal(at(""), -1);
	assert.equal(at(null), -1);

	// A negative or absent start is the beginning of the string.
	assert.equal(at("Seeding | Ratio 1.0", -5), at("Seeding | Ratio 1.0", 0));
});
