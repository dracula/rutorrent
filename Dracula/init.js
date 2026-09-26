/*
 * Dracula Theme for ruTorrent — behaviour
 * Version 0.3.1 · built against ruTorrent 5.3   # x-release-please-version
 * https://draculatheme.com
 *
 * Checks at startup that the stylesheets beside it carry the same version — see
 * draculaCheckVersions. This file cannot be served stale: ruTorrent inlines it
 * into a PHP response (`plugins/theme/init.php:27`) while the sheets sit behind
 * a cached URL.
 *
 * Carries every behavioural change the theme makes: keyboard handling, the
 * status classification, dialog geometry, the context menu, the status bar, the
 * favicon and the graph colours.
 *
 * ruTorrent appends this file to its own script bundle, so everything below
 * runs against globals the WebUI has already defined. The block below declares
 * them so a linter reading the file on its own does not report every use as an
 * undefined variable, and so a reader can see what the theme depends on.
 */

/* global plugin, thePlugins, theWebUI, theUILang, theConverter, theContextMenu, theDialogManager, getSelection */
/* global dStatus, askYesNo, RGBackground, dxSTable, rGraph, ALIGN_LEFT */
/* global document, setTimeout, clearTimeout, requestAnimationFrame, MutationObserver, MouseEvent, Intl, $, window, getComputedStyle, Image, console */

// Bump together with the stamps on :root in each sheet: this file compares
// itself against them at startup.
var DRACULA_VERSION = "0.3.1"; // x-release-please-version
// The oldest ruTorrent the theme is checked on — every 5.x release from here up
// has been raised on a stand and measured against 5.3.12.
var DRACULA_RUTORRENT_MIN = "5.0.0";

// Compared a component at a time as numbers: "5.10" sorts below "5.9" as text
// and above it as a version, and ruTorrent has already passed 5.9.
function draculaOlderThan(version, floor)
{
	var a = String(version).split("."), b = String(floor).split(".");
	for(var i = 0; i < 3; i++)
	{
		var x = parseInt(a[i], 10) || 0;
		var y = parseInt(b[i], 10) || 0;
		if(x !== y)
			return x < y;
	}
	return false;
}

// getPropertyValue hands back the token stream, quotes included.
function draculaStampedVersion(name)
{
	return getComputedStyle(document.documentElement)
		.getPropertyValue(name).trim().replace(/^["']|["']$/g, "");
}

// The three sheets are served under a URL ruTorrent versions by *its own*
// release (`js/plugins.js:3` — `?v=` plus theWebUI.version with the dots
// stripped), so updating the theme changes no character of the URL and a
// browser is free to keep serving yesterday's CSS. This file cannot go stale
// the same way, being inlined into a PHP response rather than fetched, and that
// asymmetry is what makes the check possible: the fresh half sees the cached
// half and says so.
//
// The symptom otherwise is not obvious — new class names arrive from a new
// init.js, the old sheet has no rules for them, and icons simply vanish.
// `enabled` is the flag thePlugins keeps per plugin; the mobile UI clears it
// through v.disable(). Absent object means nothing said otherwise, so the theme
// is treated as on.
function draculaThemeSwitchedOff()
{
	var theme = (window.thePlugins && typeof thePlugins.get === "function")
		? thePlugins.get("theme")
		: null;
	return !!(theme && theme.enabled === false);
}

function draculaCheckVersions()
{
	var sheets = {
		"style.css":   draculaStampedVersion("--dracula-version"),
		"stable.css":  draculaStampedVersion("--dracula-version-stable"),
		"plugins.css": draculaStampedVersion("--dracula-version-plugins")
	};

	var stale = [];
	for(var name in sheets)
		if(sheets[name] !== DRACULA_VERSION)
			stale.push(name + " " + (sheets[name] || "(missing or not loaded)"));

	/* A disabled theme is not a stale theme. The mobile plugin takes the page
	   over by disabling every plugin outside its own keepEnabled list, `theme`
	   included (`plugins/mobile/init.js:2138`), and this file keeps running
	   regardless because ruTorrent splices it into the response
	   (`plugins/theme/init.php:27`). What is left is two of the three sheets
	   gone, no version stamp to read, and a red banner on a page the theme was
	   never painting. Counting the sheets does not separate the two cases:
	   plugins.css is linked twice and one copy survives. */
	if(stale.length && !draculaThemeSwitchedOff())
	{
		var msg = "Dracula theme " + DRACULA_VERSION + ": stylesheet mismatch — " +
			stale.join(", ") + ". Reload with Ctrl+Shift+R; if that does not " +
			"fix it, the theme files are from different releases.";
		// noty falls back to the Log tab when $.noty is absent (`common.js:996`),
		// so the message lands somewhere either way.
		if(typeof window.noty === "function")
			window.noty(msg, "error");
		if(window.console && console.warn)
			console.warn(msg);
	}

	var rt = (window.theWebUI && theWebUI.version) || "";
	if(rt && draculaOlderThan(rt, DRACULA_RUTORRENT_MIN) &&
		window.console && console.warn)
		console.warn("Dracula theme " + DRACULA_VERSION + " needs ruTorrent " +
			DRACULA_RUTORRENT_MIN + " or newer; this is " + rt +
			". Some of the layout will be wrong.");
}

/* === Graphs stay sharp when the page is zoomed === */

/* Two different zooms, needing different handling.

   Ctrl+= is full page zoom: the browser changes devicePixelRatio, re-lays the
   page out in CSS pixels and re-evaluates media queries. A pinch on a touchpad
   or touchscreen is visual-viewport zoom and does none of that — it magnifies
   the composited output like a lens. At a pinch of 3, devicePixelRatio stays 1,
   visualViewport.scale goes to 3 and the CSS box is unchanged.

   The compositor re-rasterises text and SVG at the new scale, which is why
   everything else stays sharp. A canvas is a bitmap and cannot. So the
   effective density a canvas has to match is devicePixelRatio times the visual
   scale, not devicePixelRatio alone. */
function draculaVisualScale()
{
	var viewport = window.visualViewport;
	return (viewport && viewport.scale) || 1;
}

/* How far a given canvas may be scaled up before the allocation stops being
   reasonable. Budgeted by area, not by a flat ceiling: a flat ceiling throttles
   a 100x20 status-bar meter as hard as a full-tab graph, though the meter at
   ten times over is still only 200,000 pixels. Chrome reaches devicePixelRatio
   5 at maximum zoom and a pinch multiplies on top of that, so a ceiling of 4
   leaves the meter five times too small with both at maximum.

   The side limit keeps every dimension inside what engines will allocate at
   all; past that a canvas fails and draws nothing, which is worse than soft. */
function draculaRatioLimit(width, height)
{
	var maxPixels = 8000000;
	var maxSide = 8192;

	var w = Math.max(1, width);
	var h = Math.max(1, height);

	var byArea = Math.sqrt(maxPixels / (w * h));
	var bySide = Math.min(maxSide / w, maxSide / h);

	return Math.max(1, Math.min(byArea, bySide));
}

/* Without this, every flot graph in the product — the CPU meter, Speed, Trafic
   — turns soft the moment the page is zoomed and stays soft. Two lines of flot
   0.8.3 explain it.

   Its Canvas constructor reads the ratio exactly once:

       i = window.devicePixelRatio || 1;
       this.pixelRatio = i / backingStoreRatio;

   and resize() early-outs when the CSS size has not changed:

       if (this.width  != t) { i.width  = t * n; i.style.width  = t + "px"; ... }
       if (this.height != e) { i.height = e * n; i.style.height = e + "px"; ... }

   Zooming changes devicePixelRatio but not the size in CSS pixels, so the
   guards never fire, the backing store keeps the ratio it was born with, and
   the browser scales the bitmap up to fill the box. Redrawing cannot clear
   that: every later draw goes into the same undersized buffer, and
   plot.resize() compares the same unchanged dimensions.

   flot never exports Canvas, but hands the class to plugin init() as
   `classes.Canvas`, which is the one way to reach it. Refreshing pixelRatio
   there and clearing the cached dimensions makes the original resize() rebuild
   the buffer at the new ratio. Registered at module scope on purpose: the theme
   declares runlevel 5 and loads ahead of the plugins that draw graphs, so
   init() is still called for their plots; inside allDone it would be too late
   for the CPU graph.

   The patch alone is not enough: a density change fires **no** window resize
   event, so nothing calls resize(). Both watchers below exist for that, one per
   kind of zoom. */
if(typeof $ !== "undefined" && $.plot && $.plot.plugins)
{
	$.plot.plugins.push({
		name: "draculaSharpCanvas",
		version: "1.0",
		init: function(plot, classes)
		{
			var canvasClass = classes && classes.Canvas;
			if(!canvasClass || canvasClass.prototype.draculaSharpCanvas)
				return;

			canvasClass.prototype.draculaSharpCanvas = true;
			var originalResize = canvasClass.prototype.resize;

			canvasClass.prototype.resize = function(width, height)
			{
				var context = this.context;
				var backing = context.webkitBackingStorePixelRatio ||
					context.mozBackingStorePixelRatio ||
					context.msBackingStorePixelRatio ||
					context.oBackingStorePixelRatio ||
					context.backingStorePixelRatio || 1;
				var ratio = ((window.devicePixelRatio || 1) *
					draculaVisualScale()) / backing;
				var limit = draculaRatioLimit(width, height);

				if(ratio > limit)
					ratio = limit;

				if(Math.abs(ratio - this.pixelRatio) > 0.001)
				{
					this.pixelRatio = ratio;
					// the original only resizes when these differ from the
					// arguments, and at a pure zoom they would not
					this.width = 0;
					this.height = 0;
				}

				originalResize.call(this, width, height);
			};
		}
	});
}

/* Redraw every flot graph on the page at the current ratio. flot stores the
   plot object on its placeholder, so the graphs can be found without knowing
   which plugin owns them. resize() sizes the canvases; setupGrid and draw are
   what flot requires after one, or the new buffer stays empty. */
function draculaResizeAllPlots()
{
	$("canvas.flot-base").each(function()
	{
		var plot = $(this).parent().data("plot");
		if(!plot)
			return;

		plot.resize();
		plot.setupGrid();
		plot.draw();
	});
}

/* Zoom, and a window dragged to a monitor of a different density, both change
   devicePixelRatio without firing a single window resize event. A media query
   on the current ratio is the only event for it, and it has to be re-armed each
   time because the query stops matching the moment the ratio moves.

   draculaRatioQuery is module scope deliberately. Held only in a local, the
   MediaQueryList becomes collectable when the function returns, and a collected
   one silently stops delivering events — the first zoom is caught and no
   later one is. */
var draculaRatioQuery = null;

function draculaOnPixelRatioChange()
{
	draculaResizeAllPlots();
	draculaWatchPixelRatio();
}

function draculaWatchPixelRatio()
{
	if(!window.matchMedia)
		return;

	if(draculaRatioQuery)
	{
		if(draculaRatioQuery.removeEventListener)
			draculaRatioQuery.removeEventListener("change", draculaOnPixelRatioChange);
		else if(draculaRatioQuery.removeListener)
			draculaRatioQuery.removeListener(draculaOnPixelRatioChange);
	}

	draculaRatioQuery = window.matchMedia(
		"(resolution: " + (window.devicePixelRatio || 1) + "dppx)");

	if(draculaRatioQuery.addEventListener)
		draculaRatioQuery.addEventListener("change", draculaOnPixelRatioChange);
	else if(draculaRatioQuery.addListener)
		draculaRatioQuery.addListener(draculaOnPixelRatioChange);
}

/* A pinch never touches devicePixelRatio, so the media query above never fires
   for it. visualViewport does emit resize while the scale changes, which is the
   hook.

   Debounced because a pinch emits continuously while the fingers move and each
   redraw reallocates two canvases per graph. */
var draculaPinchTimer = null;

function draculaWatchVisualViewport()
{
	var viewport = window.visualViewport;
	if(!viewport || !viewport.addEventListener)
		return;

	viewport.addEventListener("resize", function()
	{
		if(draculaPinchTimer)
			clearTimeout(draculaPinchTimer);

		draculaPinchTimer = setTimeout(function()
		{
			draculaPinchTimer = null;
			draculaResizeAllPlots();
		}, 150);
	});
}

/* === Reading the palette ===================================================
 *
 * One way in, three shapes out: channels for what upstream interpolates, a CSS
 * string for what is written into markup, and a lazy `RGBackground` for what is
 * handed to upstream's own gradient. All three go through the one probe below,
 * so a colour resolves the same way wherever it is read.
 *
 * Reading the declaration text instead does not work: a `color-mix()` comes
 * back as its own source, `color-mix(in srgb, …)`, which upstream's colour
 * parser cannot read and a canvas will not always accept. Applying the name to
 * an element and reading it back is what resolves it.
 */

/* A palette colour as channels.

   The `, transparent` fallback separates a missing sheet from a real colour:
   without palette.css the name resolves to nothing, the probe comes back at
   zero alpha, and the caller is left with whatever upstream chose. */
function draculaPaletteChannels(name)
{
	var probe = document.createElement("span");
	probe.style.color = "var(" + name + ", transparent)";
	probe.style.display = "none";
	document.documentElement.appendChild(probe);
	var value = getComputedStyle(probe).color;
	probe.parentNode.removeChild(probe);

	var parts = value.match(/[\d.]+/g);
	if(!parts || parts.length < 3)
		return null;
	if(parts.length > 3 && parseFloat(parts[3]) === 0)
		return null;

	// `color(srgb …)` carries each channel as a fraction; `rgb()` carries bytes.
	var scale = value.indexOf("color(") === 0 ? 255 : 1;
	return [
		Math.round(parseFloat(parts[0]) * scale),
		Math.round(parseFloat(parts[1]) * scale),
		Math.round(parseFloat(parts[2]) * scale)
	];
}

/* A palette colour as a CSS string, for the places it is written into markup
   rather than interpolated. `rgb(r, g, b)` rather than the hex it may have been
   declared as: one form out, whatever went in. */
function draculaPaletteColor(name, fallback)
{
	var channels = draculaPaletteChannels(name);
	return channels ? "rgb(" + channels.join(", ") + ")" : fallback;
}

/* An `RGBackground` that reads its colour the first time something asks for it.

   The read cannot happen when the table is built: palette.css arrives through
   an @import, which is a fetch of its own, and `dxSTable.prototype.create` runs
   before it lands — measured at 1656ms with three sheets on the page and the
   palette not among them, where the name resolves to nothing. On a cold cache
   that window reaches past the first paint, so deferring is not enough on its
   own; `draculaRepaintProgress` covers the bars drawn inside it.

   Only a resolved answer is held. `fallback` is upstream's own pair, for a page
   carrying no palette at all, and caching it would hold the page on `#FFFF00`
   to `#99D699` (`css/stable.css:179`) for good. Holding a resolved answer does
   matter: the gradient is recomputed for every row on every pass, and a probe
   element per channel per row is not. */
function draculaPaletteBackground(name, fallback)
{
	var colour = new RGBackground();
	var resolved = null;
	Object.defineProperty(colour, "channels", {
		get: function()
		{
			if(!resolved)
				resolved = draculaPaletteChannels(name);
			return resolved || fallback;
		},
		set: function() {}
	});
	return colour;
}

/* Put the palette on the bars that were already drawn without it.

   A progress cell is rewritten only when its value changed (`stable.js:1301`),
   and the colour goes in as an inline style from `progressStyle`
   (`stable.js:1286`). So a bar drawn while palette.css was still in flight holds
   upstream's pair until its torrent moves, which for a finished one is never.

   The width on screen carries the percentage, so a bar recolours from what it
   already shows, through the table's own colours so the result matches what the
   next update produces. One pass is enough: it runs only once the palette
   answers, and a row painted after that reads the resolved colour itself.

   The container is the element `create` was handed (`webui.js:467`) rather than
   `table.dCont`, which is a jQuery object from 5.2.0 and a DOM element before
   it. */
function draculaRepaintProgress(ele, table, attempt)
{
	if(!draculaPaletteChannels("--dracula-progress-start"))
	{
		attempt = (attempt || 0) + 1;
		if(attempt < 8)
			setTimeout(function()
			{
				draculaRepaintProgress(ele, table, attempt);
			}, 250 * attempt);
		return;
	}

	$(ele).find(".meter-value").each(function()
	{
		var percent = parseFloat(this.style.width);
		if(isNaN(percent))
			return;

		this.style.backgroundColor = new RGBackground()
			.setGradient(table.prgStartColor, table.prgEndColor, percent)
			.getColor();
	});
}

/* === Status bar meters === */

/* The meters colour themselves by how full they are: the plugin interpolates
   between prgStartColor and prgEndColor at the current percentage and writes
   the result as an inline style. Upstream ramps green to red; this theme ramps
   Pink to Purple, so an idle meter is light and a full one deep, and every
   value between stays inside one palette family rather than passing through the
   muddy tones a green-to-red ramp gives at 50%.

   The ends are palette names rather than colours: nothing here is written as a
   hex, and a change to the hue in palette.css reaches the meter.

   The repaint is not decoration: this runs from allDone, by which time the
   meter has drawn itself once with upstream's colours and would keep them until
   its next poll. Recomputing from the width already on screen fixes that at
   once, through the plugin's own RGBackground so the interpolation matches what
   the next poll will produce. */
function draculaRecolorMeter(name, elementId, startName, endName)
{
	var plg = thePlugins.get(name);
	if(!plg || !plg.enabled)
		return;

	plg.prgStartColor = draculaPaletteBackground(
		startName,
		plg.prgStartColor && plg.prgStartColor.channels
	);
	plg.prgEndColor = draculaPaletteBackground(
		endName,
		plg.prgEndColor && plg.prgEndColor.channels
	);

	if(!elementId)
		return;

	var bar = document.getElementById(elementId);
	if(!bar)
		return;

	var percent = parseFloat(bar.style.width);
	if(isNaN(percent))
		return;

	bar.style.backgroundColor = new RGBackground()
		.setGradient(plg.prgStartColor, plg.prgEndColor, percent)
		.getColor();
}

/* The CPU graph draws soft, and the cause is a race rather than the drawing.
   flot sizes its canvas from the holder at creation time, but upstream injects
   the theme's stylesheet from JS after the page has painted — so the canvas is
   built at upstream's 16px while the holder ends up at this theme's 20px.
   `#meter-cpu-holder canvas { height: 100% }` in plugins.css then stretches it,
   which is 16 rows of pixels resampled into 20: it hides the gap and keeps the
   softness.

   flot's own resize() rebuilds the canvas at the holder's real size, 100x16 ->
   100x20, after which it draws sharp and the height rule becomes a no-op.
   Retried a few times because the stylesheet may still be in flight when
   allDone runs; each attempt is skipped once the canvas already matches. */
function draculaResharpenCpuGraph(attempt)
{
	var plg = thePlugins.get("cpuload");
	if(!plg || !plg.graph || !plg.graph.resize)
		return;

	var holder = document.getElementById("meter-cpu-holder");
	var canvas = holder && holder.querySelector("canvas");
	if(!holder || !canvas)
		return;

	if(Math.abs(canvas.height - holder.getBoundingClientRect().height) > 0.5)
		plg.graph.resize();

	attempt = (attempt || 0) + 1;
	if(attempt < 4)
		setTimeout(function() { draculaResharpenCpuGraph(attempt); }, 400 * attempt);
}

/* === Status bar tooltips ===
 *
 * One function per section, each guarding its own element, so the updater
 * that drives them stays a list of calls. ruTorrent rewrites these titles as
 * it refreshes, so they are re-applied rather than set once.
 */

function draculaDiskTooltip(pane)
{
	if(!pane)
		return;
	var orig = pane.getAttribute("title") || "";
	if(orig.indexOf("Disk Space") === 0)
		return;
	// The diskspace plugin builds this from "%USED%/%TOTAL% (%FREE% free)", so
	// the first value is used space, not free. Matched on structure rather than
	// on words, which are translated.
	var dp = orig.match(/^\s*([^/]+?)\s*\/\s*([^(]+?)\s*(?:\(([^)]*)\))?\s*$/);
	if(!dp)
		return;
	// The bracketed part reads "26.2 GiB free"; only the amount is kept, the
	// trailing word being localized and already supplied by the label.
	var free = dp[3] ? (dp[3].match(/[\d.,]+\s*\S+/) || [dp[3]])[0] : "";
	pane.title = "Disk Space\nUsed: " + dp[1] +
		(free ? "\nFree: " + free : "") +
		"\nTotal: " + dp[2];
}

function draculaCpuTooltip(pane)
{
	if(!pane)
		return;
	var orig = pane.getAttribute("title") || "";
	if(orig.indexOf("CPU Load:") !== 0)
		pane.title = "CPU Load: " + orig;
}

/* A title from the counts that have one. Anything whose value is empty is left
   out entirely rather than printed as a label with nothing behind it. */
function draculaCountsTooltip(title, counts)
{
	var lines = [title];
	for(var i = 0; i < counts.length; i++)
	{
		if(counts[i] && counts[i].value !== "")
			lines.push(counts[i].label + ": " + counts[i].value);
	}
	return lines.join("\n");
}

/* `webui.js:2179` fills the three counts from `stopen`, and a daemon that does
   not report one answers -1: upstream then **hides** that element instead of
   writing a zero (`:2182`). Hiding leaves the old text in place, so the text
   alone would print a stale figure after a count disappears — the inline
   `display` jQuery's `.hide()` writes is the signal to read. */
function draculaConnectionsTooltip(cell)
{
	if(!cell)
		return;
	var read = function(id, label)
	{
		var el = document.getElementById(id);
		if(!el || el.style.display === "none")
			return { label: label, value: "" };
		return { label: label, value: el.textContent.replace(/\D/g, "") };
	};
	cell.title = draculaCountsTooltip("Open Connections", [
		read("stopen_http_count", "HTTP"),
		read("stopen_sock_count", "Sockets"),
		read("stopen_fd_count", "File Descriptors")
	]);
}

function draculaTorrentsTooltip(cell)
{
	if(!cell)
		return;
	var rows = document.getElementById("viewrows");
	var size = document.getElementById("viewrows_size");
	if(!rows || !size)
		return;
	var parts = rows.textContent.split("/");
	cell.title = "Filtered Torrents: " + (parts[0] || "0") +
		"\nTotal Torrents: " + (parts[1] || "0") +
		"\nTotal Size: " + size.textContent;
}

function draculaPortTooltip(pane)
{
	if(!pane)
		return;
	// check_port states: 0 = still checking, 1 = closed, 2 = open. Tested for
	// pstatus2 rather than for "not pstatus1", which reports a verdict while
	// the check is still running.
	var status = pane.querySelector(".pstatus2") ? "Open"
		: pane.querySelector(".pstatus1") ? "Closed"
		: "Checking...";
	pane.title = "Port Status: " + status;
}

/* === Status bar behaviour === */

// Built with RegExp rather than a /\s+/ literal so the complexity analyser
// parses the function below correctly; with the literal it reads the rest of
// the file as part of it. Same expression either way.
var draculaWhitespace = new RegExp("\\s+");

// "0 http" reads as a quantity of nothing; "http: 0" reads as a label and a
// value. Re-applied on updates, the core rewriting the values as it refreshes.
function draculaFlipOnce(cell)
{
	var vals = cell.querySelectorAll(".stval");
	for(var i = 0; i < vals.length; i++)
	{
		var parts = vals[i].textContent.trim().split(draculaWhitespace);
		if(parts.length === 2 && !isNaN(parts[0]))
			vals[i].textContent = parts[1] + ": " + parts[0];
		if(i > 0)
			vals[i].style.marginLeft = "12px";
	}
}

function draculaFlipConnectionValues(cell)
{
	if(!cell)
		return;
	var flip = function() { draculaFlipOnce(cell); };
	flip();
	new MutationObserver(flip).observe(cell,
		{ childList: true, subtree: true, characterData: true });
}

/* The four report cells carry their whole reading in `title` — see
   draculaDiskTooltip and its siblings above — and `title` needs a hover, which a
   touch screen has none of. On a narrow screen those cells are also collapsed to
   their icon so the bar fits, which would leave a phone with four icons and no
   numbers at all.

   A tap opens the same string in a panel above the bar. The two speed cells are
   not in the list: a tap there already opens the throttle menu. */
var draculaPopoverCells = ["meter-disk-pane", "meter-cpu-pane", "st_fd", "port-pane"];

// Either condition alone is enough. No hover means the titles are unreachable
// whatever the width; under 768px the cells are collapsed and have nothing else
// to show.
function draculaWantsPopovers()
{
	return !!(window.matchMedia &&
		window.matchMedia("(hover: none), (max-width: 767.98px)").matches);
}

function draculaStatusPopover()
{
	var node = document.getElementById("dracula-status-popover");
	if(node)
		return node;
	node = document.createElement("div");
	node.id = "dracula-status-popover";
	node.setAttribute("role", "tooltip");
	node.hidden = true;
	document.body.appendChild(node);
	return node;
}

function draculaHideStatusPopover()
{
	var node = document.getElementById("dracula-status-popover");
	if(node)
	{
		node.hidden = true;
		node.removeAttribute("data-dracula-cell");
	}
}

function draculaStatusPopoverShows(id)
{
	var node = document.getElementById("dracula-status-popover");
	return !!(node && !node.hidden &&
		node.getAttribute("data-dracula-cell") === id);
}

// Placed after it is filled and shown: width is unknown until the text is in,
// and a hidden element measures zero.
function draculaShowStatusPopover(cell)
{
	var text = cell.getAttribute("title");
	if(!text)
		return;
	var node = draculaStatusPopover();
	node.textContent = text;
	node.hidden = false;
	node.setAttribute("data-dracula-cell", cell.id);

	var bar = document.getElementById("StatusBar");
	var barTop = bar ? bar.getBoundingClientRect().top : window.innerHeight;
	var cellBox = cell.getBoundingClientRect();
	var width = node.getBoundingClientRect().width;

	node.style.bottom = (window.innerHeight - barTop + 4) + "px";
	node.style.left = Math.max(4,
		Math.min(cellBox.left + (cellBox.width - width) / 2,
			window.innerWidth - width - 4)) + "px";
}

// The panel carries the id of the cell it belongs to, so a viewport change is a
// re-placement rather than a loss.
function draculaPlaceStatusPopover()
{
	var node = document.getElementById("dracula-status-popover");
	if(!node || node.hidden)
		return;
	var cell = document.getElementById(node.getAttribute("data-dracula-cell"));
	// draculaShowStatusPopover refuses a cell with no title and would leave the
	// panel standing at coordinates that no longer describe anything.
	if(cell && cell.getAttribute("title"))
		draculaShowStatusPopover(cell);
	else
		draculaHideStatusPopover();
}

/* A rotation reports the width and height it is leaving, not the ones it is
   arriving at, so a placement made now lands against geometry that is about to
   move. The second pass catches the settled layout. */
var draculaPlaceTimer = null;

function draculaPlaceStatusPopoverSettled()
{
	draculaPlaceStatusPopover();
	if(draculaPlaceTimer)
		clearTimeout(draculaPlaceTimer);
	draculaPlaceTimer = setTimeout(function()
	{
		draculaPlaceTimer = null;
		draculaPlaceStatusPopover();
	}, 300);
}

// Under the system's own press-and-hold, so the panel is up before iOS would
// start a selection instead.
var DRACULA_HOLD = 350;

function draculaStatusCellPopovers()
{
	// A touch settles the panel by itself, and the click the browser sends
	// afterwards would toggle it a second time. The stamp expires on its own, so
	// a touch that never produces a click cannot leave the mouse path blocked.
	var touchSettledAt = 0;

	draculaPopoverCells.forEach(function(id)
	{
		var cell = document.getElementById(id);
		if(!cell)
			return;

		var pressedAt = 0;
		var wasOpen = false;

		cell.addEventListener("pointerdown", function(e)
		{
			if(e.pointerType === "mouse" || !draculaWantsPopovers())
				return;
			pressedAt = Date.now();
			wasOpen = draculaStatusPopoverShows(id);
			// Without capture a finger that slides off the cell delivers pointerup
			// elsewhere, and the panel is left up with nothing to close it.
			if(cell.setPointerCapture)
				cell.setPointerCapture(e.pointerId);
			draculaShowStatusPopover(cell);
		});

		// A press outliving DRACULA_HOLD is a hold and ends with the finger. A
		// shorter one is a tap: it leaves the panel where it is, unless it landed
		// on the cell already showing, which makes it the closing half of a toggle.
		cell.addEventListener("pointerup", function()
		{
			if(!pressedAt)
				return;
			var held = Date.now() - pressedAt >= DRACULA_HOLD;
			pressedAt = 0;
			touchSettledAt = Date.now();
			if(held || wasOpen)
				draculaHideStatusPopover();
		});

		// The browser has taken the gesture for its own — a scroll, most often.
		// Nothing was chosen, so nothing stays open.
		cell.addEventListener("pointercancel", function()
		{
			pressedAt = 0;
			touchSettledAt = Date.now();
			draculaHideStatusPopover();
		});

		cell.addEventListener("click", function(e)
		{
			if(!draculaWantsPopovers())
				return;
			// Without this the document listener below closes the panel in the
			// same click that opened it.
			e.stopPropagation();
			if(Date.now() - touchSettledAt < 700)
				return;
			if(draculaStatusPopoverShows(id))
				draculaHideStatusPopover();
			else
				draculaShowStatusPopover(cell);
		});
	});
	document.addEventListener("click", draculaHideStatusPopover);
	// It is placed from the cell's box and the bar's top, both of which move when
	// the window does. Safari's toolbar returning at the bottom edge — where the
	// bar sits — is enough to fire this during a tap on the bar itself.
	window.addEventListener("resize", draculaPlaceStatusPopover);
	window.addEventListener("orientationchange", draculaPlaceStatusPopoverSettled);
}

/* The row scrolls once the tabs stop fitting — eleven of them ask for 802px
   against a 390px screen — and nothing says so: the last visible tab ends at the
   edge like a row that is complete. Only a coarse pointer needs telling, since
   a desktop scrollbar is already drawn and stays drawn.

   The track is a sibling of the row, not a part of it. `#tabbar` is the
   scroller, so anything painted inside travels with the tabs; `#tdetails` is a
   flex column (`css/style.css:532`), which lands the track under the row with no
   positioning of its own. */
function draculaTabScrollIndicator()
{
	var bar = document.getElementById("tabbar");
	if(!bar || !bar.parentNode)
		return;

	var track = document.createElement("div");
	track.id = "dracula-tab-scroll";
	bar.parentNode.insertBefore(track, bar.nextSibling);

	function update()
	{
		var room = bar.clientWidth;
		var content = bar.scrollWidth;
		if(content - room <= 1)
		{
			track.classList.remove("dracula-tabs-overflow");
			return;
		}
		track.classList.add("dracula-tabs-overflow");
		// A thumb narrower than a finger's width says nothing, so it has a floor;
		// the travel is then measured against what is left of the track rather
		// than the whole of it, or the thumb would run past the end.
		var width = Math.max(16, room * room / content);
		track.style.setProperty("--dracula-tab-thumb-width", width + "px");
		track.style.setProperty("--dracula-tab-thumb-left",
			(bar.scrollLeft / (content - room)) * (room - width) + "px");
	}

	bar.addEventListener("scroll", update);
	window.addEventListener("resize", update);
	// Plugins append their tabs after this file runs, and one can arrive or leave
	// while the page is up.
	if(window.MutationObserver)
		new MutationObserver(update).observe(bar, { childList: true });
	update();
}

// Upstream binds the speed limit menu to right-click alone, which is
// undiscoverable on a block that looks like a button. Left-click opens it too.
function draculaSpeedClickOpensMenu(el)
{
	if(!el)
		return;
	el.addEventListener("click", function(e)
	{
		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();
		var target = this, x = e.clientX, y = e.clientY;
		setTimeout(function()
		{
			target.dispatchEvent(new MouseEvent("contextmenu",
				{ bubbles: true, clientX: x, clientY: y }));
		}, 50);
	});
}

// Keyboard access to the context menus. `objects.js:389` and `:409` bind
// `focus -> blur()` to every command, and the menu is rebuilt from scratch on
// each open, so clearing the handlers once at startup clears nothing that will
// exist a second later — the hook has to be the opening itself.
//
// Menus get their own layer rather than the generic roving group the other
// regions use, for two reasons that only appear once a menu has submenus. That
// group's selector is `a.menu-cmd`, while a submenu's parent is `a.exp`
// (objects.js:367), so those entries are unreachable; and its descendant
// selector reaches *into* an open submenu, folding those entries into the
// parent level's arrow order instead of their own.
//
// So each level is handled separately, direct children only, and the arrows
// mean what they mean in a menu: Down and Up walk the level, Right opens a
// submenu and steps into it, Left closes it and steps back out, Escape closes
// everything and returns to whatever opened the menu.
//
// Opening and closing go through upstream's own `openSubmenu`/`closeSubmenu`
// (objects.js:425, :440), called with a synthetic `{ currentTarget: li }` — they
// read only that property, and reusing them keeps the keyboard's submenu
// positioning identical to the mouse's, including the flips upstream does near
// the edges of the window.
var draculaMenuOpener = null;

function draculaMenuItems(menu)
{
	return Array.prototype.filter.call(
		menu.querySelectorAll(":scope > li > a.menu-cmd:not(.dis), :scope > li > a.exp"),
		function(el)
		{
			var rect = el.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0;
		});
}

function draculaCloseMenu()
{
	theContextMenu.hide();
	if(draculaMenuOpener && document.contains(draculaMenuOpener))
		draculaMenuOpener.focus({ preventScroll: true });
}

function draculaOpenSubmenu(link)
{
	var li = link.parentElement;
	var submenu = li && li.querySelector(":scope > ul.CMenu");
	if(!submenu)
		return;
	theContextMenu.openSubmenu({ currentTarget: li });
	link.setAttribute("aria-expanded", "true");
	draculaPrepareMenuLevel(submenu, link);
	var first = draculaMenuItems(submenu)[0];
	if(first)
		first.focus({ preventScroll: true });
}

function draculaPrepareMenuLevel(menu, parentLink)
{
	menu.setAttribute("role", "menu");

	// Upstream binds `focus -> blur()` to every command as it builds them
	// (objects.js:389, :409), and the menu is rebuilt on each open, so this
	// runs per level, per open.
	var items = Array.prototype.slice.call(
		menu.querySelectorAll(":scope > li > a.menu-cmd, :scope > li > a.exp"));
	$(items).off("focus");
	items.forEach(function(item)
	{
		item.removeAttribute("onfocus");
		item.onfocus = null;
		item.setAttribute("role", "menuitem");
		item.tabIndex = -1;
		if(item.classList.contains("dis"))
			item.setAttribute("aria-disabled", "true");
		if(item.classList.contains("exp"))
		{
			item.setAttribute("aria-haspopup", "menu");
			item.setAttribute("aria-expanded", "false");
		}
	});

	if(menu.getAttribute("data-dracula-menu"))
		return;
	menu.setAttribute("data-dracula-menu", "1");

	menu.addEventListener("keydown", function(ev)
	{
		// A submenu sits inside its parent, so without this every level answers
		// the same key press.
		if(ev.target.parentElement.parentElement !== menu)
			return;

		var list = draculaMenuItems(menu);
		var index = list.indexOf(ev.target);
		var expandable = ev.target.classList.contains("exp");

		switch(ev.key)
		{
			case "ArrowDown":
			case "ArrowUp":
				if(index < 0 || !list.length)
					return;
				ev.preventDefault();
				var step = (ev.key === "ArrowDown") ? 1 : -1;
				var next = (index + step + list.length) % list.length;
				list[next].focus({ preventScroll: true });
				return;

			case "Home":
			case "End":
				if(!list.length)
					return;
				ev.preventDefault();
				list[ev.key === "Home" ? 0 : list.length - 1].focus({ preventScroll: true });
				return;

			case "ArrowRight":
				if(!expandable)
					return;
				ev.preventDefault();
				draculaOpenSubmenu(ev.target);
				return;

			case "ArrowLeft":
				if(!parentLink)
					return;
				ev.preventDefault();
				theContextMenu.closeSubmenu({ currentTarget: parentLink.parentElement });
				parentLink.setAttribute("aria-expanded", "false");
				parentLink.focus({ preventScroll: true });
				return;

			case "Enter":
			case " ":
				ev.preventDefault();
				if(expandable)
				{
					draculaOpenSubmenu(ev.target);
					return;
				}
				ev.target.click();
				// A mouse click closes the menu through the document mouseup
				// handler installed at objects.js:308. A keypress sends no
				// mouseup, so the menu would stay open over the thing it just
				// acted on.
				draculaCloseMenu();
				return;

			case "Escape":
				ev.preventDefault();
				draculaCloseMenu();
				return;
		}
	});
}

function draculaPrepareContextMenu()
{
	var menu = document.querySelector("ul.CMenu");
	if(!menu)
		return;

	draculaPrepareMenuLevel(menu, null);
	draculaFillMenuHotkeys(menu);

	var first = draculaMenuItems(menu)[0];
	if(first)
		first.focus({ preventScroll: true });
}

function draculaWatchContextMenu()
{
	if(!window.theContextMenu || typeof theContextMenu.show !== "function")
		return;
	var show = theContextMenu.show;
	theContextMenu.show = function()
	{
		// Remember who opened it, so Escape has somewhere to go back to.
		draculaMenuOpener = (document.activeElement && document.activeElement !== document.body)
			? document.activeElement : null;
		var result = show.apply(this, arguments);
		// The menu is animated open, so the commands are styled and measured a
		// tick later; preparing on the next task keeps `dis` accurate.
		setTimeout(draculaPrepareContextMenu, 0);
		return result;
	};
}

// Dialogs. `theDialogManager.setModalState` shows a backdrop and raises a
// z-index (`objects.js:199`) and does nothing whatever about focus: it is never
// moved into the window, never held there, and never handed back. Measured on
// `tskConsole`, five presses of Tab from the top walk off the last button and
// land on `body` — the page behind the backdrop, where every control is
// reachable from the keyboard, invisible under the dim, and unclickable.
//
// Escape already closes a dialog, and that is upstream's, so nothing here binds
// it.
//
// One layer covers all thirty-nine windows because the fault is in the manager
// rather than in any of them — including the six plugins that share
// `tskConsole`: create, dump, mediainfo, screenshots, spectrogram and unpack.
var draculaDialogStack = [];

// `offsetParent` is null for anything positioned fixed, which dialogs are, so
// visibility is asked of the boxes the element actually paints.
function draculaDialogFocusables(dlg)
{
	var candidates = dlg.querySelectorAll(
		"a[href], button, input:not([type=hidden]), select, textarea, [tabindex]");
	return Array.prototype.filter.call(candidates,
		function(el)
		{
			return !el.disabled && el.tabIndex >= 0 && el.getClientRects().length > 0;
		});
}

// The close cross is first in every dialog's markup and the last thing anyone
// opens a window to do, so the focus does not start there. A field beats a
// button: a window with something to type in is asking to be typed in.
function draculaFocusFirstInDialog(dlg)
{
	var items = draculaDialogFocusables(dlg);
	var wanted = items.filter(function(el)
	{
		return !el.classList.contains("dlg-close");
	});
	var field = wanted.filter(function(el)
	{
		return el.tagName === "INPUT" || el.tagName === "SELECT" ||
			el.tagName === "TEXTAREA";
	})[0];
	var target = field || wanted[0] || items[0];
	if(!target)
	{
		// A window with nothing to operate still has to take the focus, or Tab
		// carries on from wherever it was before the window opened.
		dlg.tabIndex = -1;
		dlg.focus({ preventScroll: true });
		return false;
	}
	target.focus({ preventScroll: true });
	return true;
}

// Only a modal window holds the focus. A modeless one — Settings, Add Torrent,
// the RSS rules manager — leaves the page usable behind it on purpose, and
// keeping the focus in would be a different bug from the one being fixed.
function draculaTopModalDialog()
{
	for(var i = draculaDialogStack.length - 1; i >= 0; i--)
		if(draculaDialogStack[i].modal)
			return draculaDialogStack[i].dlg;
	return null;
}

function draculaTrapDialogTab(ev)
{
	var dlg = draculaTopModalDialog();
	if(!dlg)
		return;
	var items = draculaDialogFocusables(dlg);
	if(!items.length)
		return;

	var edge = ev.shiftKey ? items[0] : items[items.length - 1];
	var wrap = ev.shiftKey ? items[items.length - 1] : items[0];
	// Focus already outside the window — the page behind it, or nothing at all —
	// comes back to the end the key is travelling towards.
	if(document.activeElement === edge || !dlg.contains(document.activeElement))
	{
		ev.preventDefault();
		wrap.focus({ preventScroll: true });
	}
}

// Where a caret can still go, so a field can tell "move me" from "move the
// caret". Only the types that have a selection are asked: reading
// `selectionStart` on a number or an email throws in Chrome.
var DRACULA_CARET_TYPES = /^(text|search|url|tel|password)$/;

function draculaTextEdge(el, back)
{
	var carries = el.tagName === "TEXTAREA" ||
		(el.tagName === "INPUT" &&
			DRACULA_CARET_TYPES.test((el.type || "text").toLowerCase()));
	if(!carries)
		return true;
	return back ? el.selectionEnd === 0 : el.selectionStart === el.value.length;
}

// Which way an arrow moves the focus in a dialog, or zero when the control under
// it has the better claim on that key.
//
// A dialog is a form, and in a form the arrows are how it is walked. Two rules
// carry the whole of it:
//
//   - A field gives an arrow up at the edge of its text and not before. The
//     caret has first claim; when there is nowhere left to move it, the key
//     means "leave". Without this the Trackers box in Create Torrent and the URL
//     box in Add Torrent hold all four arrows and cannot be left at all.
//   - A list and a spinner do not change value on the way past. A keypress meant
//     to move should not silently alter a setting, and Piece size sits in the
//     middle of the tab order of a window whose whole purpose is what it builds.
//     The value stays theirs to set: Enter or Space opens the list and the
//     browser's own arrows pick inside it.
//
// A radio group and a slider keep all four: for both, the arrows are the only
// way to operate them from the keyboard, and Tab still leaves.
function draculaDialogArrowStep(el, key)
{
	var back = (key === "ArrowLeft" || key === "ArrowUp");
	if(!back && key !== "ArrowRight" && key !== "ArrowDown")
		return 0;
	var step = back ? -1 : 1;

	var type = (el.type || "").toLowerCase();
	if(type === "radio" || type === "range")
		return 0;
	if(el.tagName === "TEXTAREA" || el.tagName === "INPUT")
		return draculaTextEdge(el, back) ? step : 0;
	return step;
}

// The arrows move inside the window, which is what the rest of the interface
// does inside a region. They run on the dialog that has the focus rather than on
// the topmost modal one, so a modeless window — Settings, Add Torrent — is
// walked the same way while the page behind it stays reachable by Tab.
function draculaDialogArrows(ev)
{
	var entry = draculaDialogStack.filter(function(open)
	{
		return open.dlg.contains(document.activeElement);
	})[0];
	if(!entry)
		return;

	var step = draculaDialogArrowStep(document.activeElement, ev.key);
	if(!step)
		return;

	var items = draculaInVisualOrder(draculaDialogFocusables(entry.dlg));
	if(!items.length)
		return;

	// The window itself holds the focus when it opened with nothing in it worth
	// focusing — `tskConsole` swaps its buttons as a task runs and can be empty
	// for a moment. An arrow then enters the window from the end it points at,
	// rather than doing nothing and leaving the keyboard stuck.
	var at = items.indexOf(document.activeElement);
	if(at < 0)
	{
		ev.preventDefault();
		(step > 0 ? items[0] : items[items.length - 1]).focus({ preventScroll: true });
		return;
	}

	// Round, because Tab goes round in the same window and a window is a closed
	// set. Stopping at the ends leaves a dead key at each one, and the last
	// control is often a field: the URL box in Add Torrent is last, so a stop
	// there reads as a field that cannot be left.
	var target = items[(at + step + items.length) % items.length];
	ev.preventDefault();
	target.focus({ preventScroll: true });
}

function draculaDialogKeys(ev)
{
	if(ev.altKey || ev.ctrlKey || ev.metaKey)
		return;
	if(ev.key === "Tab")
		draculaTrapDialogTab(ev);
	else
		draculaDialogArrows(ev);
}

// The header carries the window's name, and it changes while the window is up:
// `tskConsole` reads "Running..." and then "Done.". Pointing at it by id keeps
// the name current instead of copying a word that goes stale.
function draculaNameDialog(dlg)
{
	dlg.setAttribute("role", "dialog");
	var header = dlg.querySelector(".dlg-header");
	if(!header)
		return;
	if(!header.id)
		header.id = dlg.id + "-dracula-title";
	dlg.setAttribute("aria-labelledby", header.id);
}

function draculaWatchDialogs()
{
	if(!window.theDialogManager || typeof theDialogManager.show !== "function")
		return;

	var show = theDialogManager.show;
	theDialogManager.show = function(id)
	{
		var opener = document.activeElement;
		var result = show.apply(this, arguments);
		var dlg = document.getElementById(id);
		if(!dlg)
			return result;

		// Upstream's own test for whether a window dims the page (`objects.js:220`),
		// read from the window rather than from the manager: `isModalState` answers
		// for any window that is up, not for this one.
		var modal = !!$(dlg).data("modal");
		// Two things in a window refuse the focus in the instant they take it,
		// which is what leaves the arrows dead: upstream blurs every `.Button` in
		// a window it builds (`objects.js:141`), and the path picker blurs itself
		// (`plugins/_getdir/init.js:22`). Measured, a `focus()` on one fires focus
		// and blur back to back and the page is left on `body`, from where no
		// further key reaches the window at all.
		//
		// Both are jQuery focus handlers and the blur is the only one either
		// carries. The field beside the picker is deliberately not touched: its
		// own focus handler closes the directory list.
		draculaUnblur($(dlg).find(".Button, .browseButton"));
		draculaNameDialog(dlg);
		if(modal)
			dlg.setAttribute("aria-modal", "true");
		draculaDialogStack.push({
			id: id,
			dlg: dlg,
			modal: modal,
			opener: (opener && opener !== document.body) ? opener : null,
		});

		// A window is filled as it opens, and its controls can be swapped a moment
		// later: `tskConsole` shows one set of buttons while a task runs and
		// another when it finishes, so the first look can find nothing with a box
		// to focus. The look is repeated for a few frames rather than guessed at
		// with a longer timer.
		var settle = function(left)
		{
			if(draculaFocusFirstInDialog(dlg) || left <= 0)
				return;
			requestAnimationFrame(function() { settle(left - 1); });
		};
		setTimeout(function() { settle(5); }, 0);
		return result;
	};

	var hide = theDialogManager.hide;
	theDialogManager.hide = function(id)
	{
		var result = hide.apply(this, arguments);
		for(var i = draculaDialogStack.length - 1; i >= 0; i--)
		{
			if(draculaDialogStack[i].id !== id)
				continue;
			var entry = draculaDialogStack.splice(i, 1)[0];
			// Only when the focus is still inside the window that is closing, or
			// nowhere: a dialog closed from elsewhere has not taken it, and pulling
			// it back would be the theft this is meant to prevent.
			if(entry.opener && document.contains(entry.opener) &&
				(entry.dlg.contains(document.activeElement) ||
					document.activeElement === document.body))
				entry.opener.focus({ preventScroll: true });
			break;
		}
		return result;
	};

	// Captured, so the window has the keys before a region's own keydown sees
	// them: a dialog opened over the torrent list sits inside no region, but the
	// list's handler is bound to a container the focus can still be within.
	document.addEventListener("keydown", draculaDialogKeys, true);

	// Upstream turns Enter anywhere in a window into a click on its OK button,
	// excluding a textarea and nothing else (`objects.js:158`). On a list or a
	// button that is wrong twice over: the key belongs to the control under it,
	// and the window is submitted by a press meant to open a dropdown. Measured
	// on Create Torrent, where Enter on Piece size opened the list and raised
	// "You must fill in all required fields" in the same breath.
	//
	// Caught on the way down so upstream's handler on the window never sees it.
	// The default action is untouched — the list still opens, the button is still
	// pressed — and Enter in a field still submits, which is what it is for.
	document.addEventListener("keypress", function(ev)
	{
		if(ev.key !== "Enter" || !draculaDialogStack.length)
			return;
		var el = ev.target;
		if(!el || !/^(SELECT|BUTTON|A)$/.test(el.tagName))
			return;
		var inside = draculaDialogStack.filter(function(open)
		{
			return open.dlg.contains(el);
		})[0];
		if(inside)
			ev.stopPropagation();
	}, true);

	// A control that hides itself takes the focus down with it. Add Torrent's
	// label list does exactly that: choosing its second option swaps the list for
	// a text field (`content.js:174`), and an arrow that reaches that option
	// leaves the page on `body` with the window still open and nothing focused.
	//
	// The place is kept rather than the element, and the focus lands on whatever
	// now stands there — which is the field that replaced it. Only a fall to
	// `body` is caught: a click on the page behind a modeless window is a move
	// somewhere, and moving it back would be the theft this guards against.
	// Measured on the way in, where the control is certainly still on screen. By
	// the time it loses the focus it can already be hidden, and a hidden element
	// measures as a zero box at the origin — nowhere near where it stood, and
	// nearest to whatever sits highest and leftmost in the window.
	var lastBox = null;
	document.addEventListener("focusin", function(ev)
	{
		if(!draculaDialogStack.length)
			return;
		var entry = draculaDialogStack[draculaDialogStack.length - 1];
		if(!entry.dlg.contains(ev.target))
			return;
		var r = ev.target.getBoundingClientRect();
		lastBox = { el: ev.target, x: r.left + r.width / 2, y: r.top + r.height / 2 };
	});

	document.addEventListener("focusout", function(ev)
	{
		if(!draculaDialogStack.length)
			return;
		var entry = draculaDialogStack[draculaDialogStack.length - 1];
		if(!entry.dlg.contains(ev.target))
			return;
		var box = ev.target.getBoundingClientRect();
		var was = (lastBox && lastBox.el === ev.target && !box.width)
			? lastBox
			: { x: box.left + box.width / 2, y: box.top + box.height / 2 };

		setTimeout(function()
		{
			if(document.activeElement !== document.body)
				return;
			if(!document.contains(entry.dlg) || entry.dlg.offsetParent === null)
				return;
			var items = draculaDialogFocusables(entry.dlg);
			if(!items.length)
				return;
			var nearest = items[0];
			var best = Infinity;
			items.forEach(function(el)
			{
				var r = el.getBoundingClientRect();
				var dx = r.left + r.width / 2 - was.x;
				var dy = r.top + r.height / 2 - was.y;
				var distance = dx * dx + dy * dy;
				if(distance < best)
				{
					best = distance;
					nearest = el;
				}
			});
			nearest.focus({ preventScroll: true });
		}, 0);
	});
}

// Which toolbar button the open menu belongs to, so a second click on that
// button closes it and a click on another one still opens its own.
var draculaOpenMenuButton = null;

function draculaMenuIsOpen()
{
	return !!(window.theContextMenu && theContextMenu.obj && theContextMenu.obj.is(":visible"));
}

// A toolbar button that opens one of upstream's own menus from an inline
// onclick — the magnifier through `theSearchEngines.show()`, and below
// ruTorrent 5.1.0 the plugins button through `theWebUI.showPluginsMenu()`.
//
// The document mouseup that closes a menu skips anything carrying
// `top-menu-item` (`objects.js:308`), which both of these do, so a second click
// reaches the inline handler with the menu still open and rebuilds it in place.
// Closing on that click is what the Bootstrap dropdown does for the plugins
// button from 5.1.0 up.
//
// Capturing, because the handler to head off is the element's own.
function draculaMenuButtonToggles(button)
{
	if(!button || button.getAttribute("data-dracula-toggle"))
		return;
	button.setAttribute("data-dracula-toggle", "1");

	button.addEventListener("click", function(ev)
	{
		if(draculaOpenMenuButton === button && draculaMenuIsOpen())
		{
			ev.preventDefault();
			ev.stopImmediatePropagation();
			draculaOpenMenuButton = null;
			draculaCloseMenu();
			return;
		}
		draculaOpenMenuButton = button;
	}, true);
}

function draculaToolbarMenusToggle()
{
	draculaMenuButtonToggles(document.getElementById("mnu_search"));

	// From 5.1.0 the plugins button is a Bootstrap dropdown, which toggles on
	// its own and must not be answered twice.
	var plugins = document.getElementById("mnu_plugins");
	if(plugins && !plugins.hasAttribute("data-bs-toggle"))
		draculaMenuButtonToggles(plugins);
}

// The F1 help screen has to carry the theme's bindings too. Upstream builds
// that dialog as one Bootstrap row of `.col-4` key / `.col-8` action pairs
// (content.js:299), which with these entries added stands 300px wide and 773px
// tall in a 961px-high window.
//
// So it is rebuilt as two groups side by side, the split the content already
// has: what you can do, and how to move around. Upstream's eleven keep the left
// and their shipped order; these follow on the right. The cells are moved
// rather than recreated, so the six actions that are links keep their handlers.

// Inter's four plain arrows are not one family. As ink at 14px bold:
// U+2190/2192 draw 8.5x3.4 with a 0.63px shaft, U+2191/2193 draw 9.9x10.4 with
// a 1.75px shaft — 4.4 times the ink and a shaft nearly three times as thick,
// so "left up right down" reads as two tiny dashes between two heavy arrows.
// Metrics hide it: all four report the same 17px line box.
//
// U+2B05/2B06/27A1/2B07 are the set that holds together — ink areas 43.6, 43.2,
// 43.7, 43.2, a spread of 1.012 — and they are solid. U+FE0E pins text
// presentation: both U+2B05 and U+27A1 are Emoji=Yes, so a system whose
// fallback offers a colour glyph would otherwise paint one, and it changes
// nothing where the text face wins. Written as escapes on purpose: U+FE0E is
// invisible, and a literal here looks like a plain arrow someone can "tidy up"
// back into one.
var draculaArrow = {
	left:  "\u2B05\uFE0E",
	up:    "\u2B06\uFE0E",
	right: "\u27A1\uFE0E",
	down:  "\u2B07\uFE0E"
};

// One line each, measured against the 216px column the dialog's 720px gives:
// the longest, "Open or apply the focused item", is 208px. Keep new entries
// inside that, or this side of the screen wraps and reads as prose.
var draculaKeyHelp = [
	["Tab", "Move between the regions"],
	[draculaArrow.left + " " + draculaArrow.up + " " + draculaArrow.right + " " + draculaArrow.down,
		"Move inside the region"],
	["Home / End", "First or last item in the region"],
	["Enter", "Open or apply the focused item"],
	["Space", "Toggle selection, or activate"],
	["Ctrl-Enter", "Context menu, or add a filter"],
	["Menu / Shift-F10", "Context menu, as a right click"],
	["Shift-" + draculaArrow.up + " " + draculaArrow.down, "Extend the selection"],
	["Shift-Enter", "Select a range of filters"],
	[draculaArrow.left + " " + draculaArrow.right, "In Files, leave or open a folder"],
	["Escape", "Close the menu and go back"]
];

// What travels out of one of upstream's cells is the element inside it, not the
// cell: for six of the eleven that element is the `<a>` carrying the onclick.
function draculaHelpCell(cell)
{
	if(cell.firstElementChild)
		return cell.firstElementChild;
	var span = document.createElement("span");
	span.textContent = cell.textContent.trim();
	return span;
}

// A `<dl>` because a list of term-and-meaning is what this is, and because it
// lets the stylesheet size the key column to its own content. Bootstrap's flat
// third is too little for "Ctrl-Enter" and far too much for "Tab" at the 250px
// each group gets here.
function draculaHelpGroup(title, pairs)
{
	var group = document.createElement("div");
	group.className = "col-12 col-md-6 dracula-help-group";

	var heading = document.createElement("div");
	heading.className = "dracula-help-title";
	heading.textContent = title;
	group.appendChild(heading);

	var list = document.createElement("dl");
	list.className = "dracula-help-list";
	pairs.forEach(function(pair)
	{
		var key = document.createElement("dt");
		key.appendChild(pair[0]);
		var action = document.createElement("dd");
		action.appendChild(pair[1]);
		list.appendChild(key);
		list.appendChild(action);
	});
	group.appendChild(list);
	return group;
}

function draculaFillKeyHelp()
{
	var dlg = document.getElementById("dlgHelp");
	if(!dlg || dlg.getAttribute("data-dracula-keys"))
		return;
	var row = dlg.querySelector(".row");
	if(!row)
		return;
	dlg.setAttribute("data-dracula-keys", "1");

	var cells = Array.prototype.slice.call(row.children);
	var commands = [];
	for(var i = 0; i + 1 < cells.length; i += 2)
		commands.push([draculaHelpCell(cells[i]), draculaHelpCell(cells[i + 1])]);

	// Upstream lists Del ninth, in the middle of the Ctrl group. Read down the
	// column the modifier keys belong together with the single keys after them,
	// so it moves to the end of what upstream supplied — under Ctrl-Z, above the
	// letters appended below. Matched on the key text, the literal "Del" at
	// `content.js:311`, rather than on its position in the list.
	//
	// Its wording is rephrased at the same time: upstream's
	// `Delete_current_torrents` reads "Delete current torrent(s)", the one line
	// in the column speaking in parenthesised plurals, sitting directly above
	// lines that say "the selected torrents" for the same set. Only the help
	// screen is touched; `theUILang` is left alone, since the menus and every
	// translation read from it.
	for(var d = 0; d < commands.length; d++)
	{
		if(commands[d][0].textContent.trim() !== "Del")
			continue;
		commands[d][1].textContent = "Delete the selected torrents";
		commands.push(commands.splice(d, 1)[0]);
		break;
	}

	// The torrent actions join Commands rather than Navigation: the screen is
	// grouped by what a key does, and these act on a selection rather than
	// moving around.
	draculaTorrentActions.forEach(function(entry)
	{
		var key = document.createElement("span");
		key.className = "fw-bold";
		key.textContent = entry[0].toUpperCase();
		var text = document.createElement("span");
		text.textContent = entry[2];
		commands.push([key, text]);
	});

	var moves = draculaKeyHelp.map(function(pair)
	{
		var key = document.createElement("span");
		key.className = "fw-bold";
		key.textContent = pair[0];
		var text = document.createElement("span");
		text.textContent = pair[1];
		return [key, text];
	});

	// Both groups are built first, which is what empties the old cells; only
	// then is the row cleared of the husks and given the two groups. Commands
	// keep the left, navigation follows on the right.
	var actions = draculaHelpGroup("Commands", commands);
	var movement = draculaHelpGroup("Navigation", moves);
	row.textContent = "";
	row.appendChild(actions);
	row.appendChild(movement);
}

// Upstream styles `span.htkey`, a hotkey slot inside menu commands, and never
// fills it. Matching is by the command's own text against the language table
// rather than by position, because plugins insert commands of their own.
//
// Only what is really bound goes in here. `dxSTable.keyEvents` (`stable.js:809`)
// handles three keys and no more: Delete, Ctrl-A and Ctrl-Z. Properties takes
// no "Enter" hint — Enter on a row reaches `ondblclick`, which is `showDetails`
// and opens the details panel, while Properties is `showProperties`.
function draculaFillMenuHotkeys(menu)
{
	if(!window.theUILang)
		return;
	var keys = {};
	if(theUILang.Delete) keys[theUILang.Delete] = "Del";
	if(theUILang.Remove) keys[theUILang.Remove] = "Del";
	if(theUILang.Start) keys[theUILang.Start] = "S";
	if(theUILang.Pause) keys[theUILang.Pause] = "P";
	if(theUILang.Stop) keys[theUILang.Stop] = "T";
	if(theUILang.updateTracker) keys[theUILang.updateTracker] = "U";
	if(theUILang.Force_recheck) keys[theUILang.Force_recheck] = "R";

	Array.prototype.forEach.call(menu.querySelectorAll("a.menu-cmd"), function(cmd)
	{
		if(cmd.querySelector("span.htkey"))
			return;
		var hint = keys[cmd.textContent.trim()];
		if(!hint)
			return;
		var span = document.createElement("span");
		span.className = "htkey";
		span.textContent = hint;
		cmd.appendChild(span);
	});
}

// Upstream's separators sit where its source order puts them, not where this
// theme's three-zone layout leaves the groups: the one before RSS divides
// nothing, the auto margin having already opened ~390px between the search and
// settings groups, while Go and the activity indicator are pressed together
// with no mark at all. The second stands in front of the Plugins dropdown, so
// the bar ends `RSS Settings │ Plugins ▾ Help` and the caret reads as though it
// could open either Plugins or Help.
//
// style.css hides the strays; the replacements go in here as real
// `div.TB_Separator` elements, so they take the width, colour and inset the
// theme already gives every other separator rather than a second definition
// that would have to be kept in step.
function draculaInsertSeparator(before)
{
	if(!before || before.previousElementSibling &&
		before.previousElementSibling.classList.contains("TB_Separator"))
		return;
	var rule = document.createElement("div");
	rule.className = "TB_Separator";
	rule.setAttribute("data-dracula-separator", "1");
	before.parentNode.insertBefore(rule, before);
}

function draculaFixToolbarSeparators()
{
	draculaInsertSeparator(document.getElementById("ind"));
	draculaInsertSeparator(document.getElementById("mnu_help"));
}

// Whatever two labels have in common, lower-cased and in the order the first
// one uses them. Splitting on whitespace is what makes this work outside the
// Latin scripts: Korean writes "토렌트 추가" and "토렌트 생성" with the space
// already there.
function draculaSharedWords(first, second)
{
	var shared = [];
	if(!first || !second)
		return shared;
	var other = String(second).toLowerCase().split(draculaWhitespace);
	var words = String(first).toLowerCase().split(draculaWhitespace);
	for(var i = 0; i < words.length; i++)
	{
		if(words[i] && other.indexOf(words[i]) >= 0 && shared.indexOf(words[i]) < 0)
			shared.push(words[i]);
	}
	return shared;
}

function draculaDropWords(text, words)
{
	if(!text || !words.length)
		return text;
	var parts = String(text).split(draculaWhitespace);
	var kept = [];
	for(var i = 0; i < parts.length; i++)
	{
		if(words.indexOf(parts[i].toLowerCase()) < 0)
			kept.push(parts[i]);
	}
	// A label emptied says less than one that has to be clipped.
	return kept.length ? kept.join(" ") : text;
}

/* Buttons a plugin adds write the ellipsis into the label itself
   (`plugins.js:370`); the ones ruTorrent builds carry it in the tooltip alone
   (`content.js:15`). Down the expanded bar that difference never shows, every
   label there being hidden. In the panel the two kinds sit in one grid, where
   Create, RSS Downloader and Plugins trailing dots that Settings and Help do
   not reads as three commands behaving differently rather than as three that
   open a dialog.

   Runs before the noun is dropped, so the noun is a bare word by the time it is
   compared: "Create Torrent..." ends in a token that matches no dictionary
   entry until the dots are off it. */
function draculaTrimEllipsis(text)
{
	var trimmed = String(text).replace(/\s*[.…]+$/, "");
	return trimmed || text;
}

/* Below 768px the toolbar folds into a panel where Add, Create and Remove share
   a row three cells wide, and a cell there holds 78px of label beside its 28px
   icon. "Add Torrent" measures 81px and "Create Torrent..." 113px, so both
   would be clipped. Standing together in one row they do not need the noun:
   Add, Create and Remove say what they do, and what they do it to is the row.

   The noun is derived rather than listed. Add and Create name the same thing
   with different verbs, so whatever their two labels share is the thing — and
   the derivation reads the strings ruTorrent itself ships, which no list here
   could stay in step with. It yields the noun in 24 of the 27 languages, across
   every script and word order among them: "Add Torrent"/"Create Torrent" gives
   Torrent, "Torrent dazu"/"Create Torrent" gives Torrent, "Добавить
   торрент"/"Новый торрент" gives торрент, "Ajouter un torrent"/"Créer un
   torrent" gives both un and torrent. Polish translates neither label with the
   noun, Latvian and Bengali only one of the two; there the two labels share
   nothing, the labels are left alone and the stylesheet clips them.

   Only the `d-inline d-md-none` span is rewritten. It is built for this panel
   and nothing else — `d-md-none` hides it from 768px up — so the expanded bar
   and every tooltip keep the full wording. */
function draculaShortenMenuLabels()
{
	var lang = window.theUILang || {};
	var words = draculaSharedWords(lang.mnu_add, lang.mnu_create);
	// The noun goes from the row that no longer needs it. The other cells stand
	// alone and keep theirs: "RSS Downloader" beside Settings names a thing,
	// where Add beside Create and Remove names an action on the obvious one.
	var torrentRow = { mnu_add: 1, mnu_create: 1, mnu_remove: 1 };
	var labels = document.querySelectorAll("#top-menu .nav-link > .d-md-none");
	for(var i = 0; i < labels.length; i++)
	{
		var text = draculaTrimEllipsis(labels[i].textContent);
		if(words.length && torrentRow[labels[i].parentNode.id])
			text = draculaDropWords(text, words);
		labels[i].textContent = text;
	}
}

// The search box has two behaviours and the toolbar shows neither: with "Local
// Torrents" chosen the field filters the list live on every keystroke
// (webui.js:497 -> updateQuickSearch), and with an engine chosen it does nothing
// until Enter or Go.
//
// So the source is named in three places that cost no layout: a badge in front
// of the magnifier, the field's own placeholder, and the button's tooltip.
//
// For a real engine the badge is that engine's favicon, at the native 16px the
// sidebar pins them to. "Local Torrents" gets the list glyph, that case not
// being a search at all. "all", "public" and "private" are covered below.
function draculaSearchSource()
{
	var engines = window.theSearchEngines;
	if(!engines)
		return null;
	var current = engines.current;
	var lang = window.theUILang || {};

	// getEngName covers the three group names and an engine key, but returns a
	// raw -1 for local search, which upstream never named.
	if(current === -1 || current === "-1")
		return { name: lang.innerSearch || "Local Torrents", icon: "var(--icon-list)", local: true };

	var name = (typeof engines.getEngName === "function")
		? engines.getEngName(current) : current;
	// Not the magnifier the sidebar substitutes for these three images: this
	// badge sits immediately left of the big magnifier, where a small copy of it
	// reads as a stutter rather than as information. These three mean "several
	// engines at once", which is what the tracker rows' network glyph says.
	if(current === "all" || current === "public" || current === "private")
		return { name: name, icon: "var(--icon-peer-network)", local: false };

	return {
		name: name,
		icon: "url(\"./plugins/extsearch/images/" + current + ".png\")",
		local: false
	};
}

function draculaSyncSearchSource()
{
	var source = draculaSearchSource();
	var button = document.getElementById("mnu_search");
	var field = document.getElementById("query");
	if(!source || !button || !field)
		return;

	var badge = document.getElementById("dracula-search-source");
	if(!badge)
	{
		badge = document.createElement("div");
		badge.id = "dracula-search-source";
		badge.setAttribute("aria-hidden", "true");
		button.parentNode.insertBefore(badge, button);
	}
	badge.style.backgroundImage = source.icon;

	// Attributes rather than text nodes on purpose: #t is watched for childList
	// changes to keep the roving tab order fresh, and rewriting a text node here
	// would wake that observer on every selection change.
	field.placeholder = source.local
		? "Filter the list"
		: "Search " + source.name;
	button.title = (window.theUILang && theUILang.mnu_search ? theUILang.mnu_search : "Search")
		+ ": " + source.name;
	button.setAttribute("aria-haspopup", "menu");
}

// The selection is written in four places — `set()` plus three direct
// assignments inside extsearch's own correction pass — so wrapping the setter
// alone would miss three of them. An accessor over a private field catches
// every write and stays invisible to the code doing the writing.
function draculaWatchSearchSource()
{
	var engines = window.theSearchEngines;
	if(!engines)
		return;
	try
	{
		var value = engines.current;
		Object.defineProperty(engines, "current", {
			configurable: true,
			enumerable: true,
			get: function(){ return value; },
			set: function(next)
			{
				value = next;
				draculaSyncSearchSource();
			}
		});
	}
	catch(e)
	{
		// A future ruTorrent could make the property non-configurable. The label
		// is worth having even if it can then only be right at load.
	}
	draculaSyncSearchSource();
}

// Region five: the status bar. Almost all of it is read-only text, but the two
// speed cells are real controls — clicking either opens its throttle menu.
//
// That menu opens on a `contextmenu` event carrying pointer coordinates. A
// keyboard has no pointer, so the cell's own box supplies them and the menu
// lands under the control it belongs to.
function draculaSpeedMenuFromKeyboard(cell)
{
	var rect = cell.getBoundingClientRect();
	cell.dispatchEvent(new MouseEvent("contextmenu", {
		bubbles: true,
		clientX: Math.round(rect.left + rect.width / 2),
		clientY: Math.round(rect.bottom)
	}));
}

function draculaStatusBarKeys()
{
	var bar = document.getElementById("StatusBar");
	if(!bar)
		return;
	bar.setAttribute("role", "region");
	bar.setAttribute("aria-label", "Status");

	var cells = ["st_up", "st_down"].map(function(id){ return document.getElementById(id); })
		.filter(Boolean);
	if(!cells.length)
		return;
	cells.forEach(function(cell)
	{
		cell.setAttribute("role", "button");
		cell.setAttribute("aria-haspopup", "menu");
		if(!cell.getAttribute("aria-label"))
		{
			cell.setAttribute("aria-label",
				(cell.id === "st_up" ? "Upload" : "Download") + " speed, opens the throttle menu");
		}
	});

	draculaRovingGroup(bar, "#st_up, #st_down", {
		activate: function(cell){ draculaSpeedMenuFromKeyboard(cell); }
	});
}

// ruTorrent refuses keyboard focus on much of its own chrome:
// `addButtonToToolbar` binds `focus: (ev) => ev.target.blur()` to every toolbar
// button (plugins.js:364), and `attachPageToTabs` does the same to every
// plugin-added detail tab (plugins.js:271). The effect is that the toolbar and
// four of the eleven detail tabs cannot be reached from a keyboard at all, and
// no stylesheet can mark focus on an element that never holds it.
//
// It is done two ways, and both have to be undone:
//   - the core toolbar buttons carry an inline `onfocus="this.blur()"`
//     attribute in index.html, which no amount of jQuery `off()` can reach;
//   - everything added later binds a jQuery handler instead.
//
// `off("focus")` clears every jQuery focus handler on these elements, which is
// safe because the blur is the only one any of them carries in 5.3.7.
// Context-menu commands (objects.js:389, :409) do the same thing but are
// rebuilt on each open, so they are handled by draculaPrepareMenuLevel.
var draculaFocusThieves = "#t a.nav-link, #tabbar li.nav-item a";

function draculaUnblur(nodes)
{
	nodes.off("focus").each(function()
	{
		// Both spellings: the attribute is what the parser read, the property is
		// what it compiled into. Clearing one alone leaves the other in place.
		this.removeAttribute("onfocus");
		this.onfocus = null;
	});
}

function draculaRestoreKeyboardFocus()
{
	draculaUnblur($(draculaFocusThieves));
}

// The keyboard model: five regions — toolbar, sidebar, torrent list, detail
// panel, status bar — where Tab moves between regions and the arrows move
// inside one. This function is the mechanism every region is wired to.
//
// Unaided, 5.3.7 offers 26 tab stops and 25 of them are two rows — 14 toolbar
// controls and 11 detail tabs — so Tab never leaves the first row. A roving
// tabindex is the standard answer: exactly one control in a region is tabbable,
// and an arrow key moves both the focus and that single stop.
//
// The pattern bends around two controls, and the rule is the same for both — a
// control keeps the axis it needs and gives up the other:
//   - a text field owns Left/Right, which move its caret, so the row moves on
//     Up/Down instead;
//   - a <select> owns Up/Down, which change its value, so it moves on
//     Left/Right. Space and Enter still open it, and inside the open list the
//     browser's own Up/Down pick an option.
// Neither control becomes unreachable and neither loses a key it needs.

// Arrow order follows what is on screen, not what is in the markup. The two
// differ in the toolbar by this theme's doing: the three-zone layout moves the
// search and settings groups past each other with flex `order`, so the DOM runs
// …Stop, RSS, Settings, Plugins, Help, Search, field, Go while the eye reads
// …Stop, Search, field, Go, RSS, Settings, Plugins, Help.
//
// Items are grouped into visual rows by their vertical centre and sorted left
// to right within a row, which reads correctly for a horizontal bar, for the
// vertical sidebar, and for a toolbar wrapped onto two lines. Bucketing rather
// than comparing centres pairwise keeps the comparator transitive.
function draculaInVisualOrder(items)
{
	return items.map(function(el)
	{
		var rect = el.getBoundingClientRect();
		return { el: el, row: Math.round((rect.top + rect.height / 2) / 8), left: rect.left };
	}).sort(function(a, b)
	{
		return (a.row - b.row) || (a.left - b.left);
	}).map(function(entry){ return entry.el; });
}

function draculaRovingItems(container, itemSelector)
{
	return draculaInVisualOrder(
		Array.prototype.filter.call(container.querySelectorAll(itemSelector),
			function(el)
			{
				var rect = el.getBoundingClientRect();
				return rect.width > 0 && rect.height > 0 && !el.disabled;
			}));
}

// Which control holds the region's single tab stop. Keep whatever already has
// it, so a plugin adding a button mid-session cannot move the user's place;
// otherwise ask the caller, and fall back to the first control.
function draculaRovingSync(container, itemSelector, preferred)
{
	var items = draculaRovingItems(container, itemSelector);
	if(!items.length)
		return items;
	var current = items.filter(function(el){ return el.tabIndex === 0; })[0];
	if(!current && preferred)
		current = preferred(items);
	if(!current)
		current = items[0];
	// Every matched control is pinned, not only the ones the arrows visit.
	// Otherwise a hidden or disabled control keeps its own tabindex and becomes
	// a second stop in the region the moment it is enabled — the sidebar's
	// "save view" button ships disabled and does exactly that.
	Array.prototype.forEach.call(container.querySelectorAll(itemSelector), function(el)
	{
		el.tabIndex = (el === current) ? 0 : -1;
	});
	return items;
}

// options.preferred(items) — which control should hold the stop to begin with.
// options.activate(el, ev)  — what Enter and Space do. Without it they fall
//                             through to a link's own click, which is right for
//                             the two rows of <a> but not for the sidebar.
function draculaRovingGroup(container, itemSelector, options)
{
	if(!container || container.getAttribute("data-dracula-roving"))
		return;
	container.setAttribute("data-dracula-roving", "1");
	options = options || {};
	var preferred = options.preferred;
	var activate = options.activate;

	draculaRovingSync(container, itemSelector, preferred);

	// Clicking a control makes it the region's stop, so Tab returns to where the
	// user last was rather than to the start of the row.
	container.addEventListener("focusin", function(ev)
	{
		var items = draculaRovingItems(container, itemSelector);
		if(items.indexOf(ev.target) < 0)
			return;
		items.forEach(function(el){ el.tabIndex = (el === ev.target) ? 0 : -1; });
	});

	container.addEventListener("keydown", function(ev)
	{
		// Modifiers are let through only for activation, where Ctrl and Shift
		// mean what they mean for a click — add to the selection, extend it.
		var activating = (ev.key === " " || ev.key === "Enter");
		if((ev.altKey || ev.ctrlKey || ev.metaKey) && !activating)
			return;

		var items = draculaRovingItems(container, itemSelector);
		var index = items.indexOf(ev.target);
		if(index < 0)
			return;

		var tag = ev.target.tagName;
		var typing = (tag === "INPUT" && !/^(button|submit|checkbox|radio)$/i.test(ev.target.type))
			|| tag === "TEXTAREA";
		var picking = (tag === "SELECT");

		// A text field owns the arrows only while there is text left to walk. At
		// the edge of the value it hands them back, so the row carries on, and
		// an empty field is at both edges at once and never traps anything.
		// Without this the search box is a dead end: Left and Right do nothing
		// visible and only Up or Down escapes.
		var atStart = true, atEnd = true;
		if(typing)
		{
			var value = String(ev.target.value || "");
			var from = ev.target.selectionStart, to = ev.target.selectionEnd;
			// A selection is a range to collapse, not an edge to leave from.
			var collapsed = (from === to);
			atStart = collapsed && from === 0;
			atEnd = collapsed && to === value.length;
		}
		// null means "this key is not handled here" — distinct from a
		// negative index, which means "wrapped past the start".
		var target = null;

		switch(ev.key)
		{
			case "ArrowRight": if(!typing || atEnd) target = index + 1; break;
			case "ArrowLeft":  if(!typing || atStart) target = index - 1; break;
			case "ArrowDown":  if(!picking) target = index + 1; break;
			case "ArrowUp":    if(!picking) target = index - 1; break;
			case "Home":       if(!typing && !picking) target = 0; break;
			case "End":        if(!typing && !picking) target = items.length - 1; break;
			case " ":
			case "Enter":
				if(activate)
				{
					ev.preventDefault();
					activate(ev.target, ev);
					return;
				}
				// A link does not activate on Space the way a button does, and
				// every control in these two rows is an <a>. Enter is handled
				// here too, not for activation — that works already — but for
				// what happens after it.
				//
				// Restricted to links on purpose: Enter in the search field has
				// to reach upstream's handler and run the search.
				if(tag !== "A")
					return;
				ev.preventDefault();
				var link = ev.target;
				link.click();
				// Upstream blurs the detail tabs on click (common.js:858) to
				// keep the ring off after a mouse click. From the keyboard that
				// drops focus to the body and loses the row, so it is restored
				// after the click handler has run, leaving the mouse alone.
				//
				// Only when nothing else claimed it: the magnifier opens a menu
				// that takes focus on its first command, and an unconditional
				// restore drags focus straight back out of it.
				setTimeout(function()
				{
					var now = document.activeElement;
					if(!now || now === document.body || now === document.documentElement)
						link.focus();
				}, 0);
				return;
			default: return;
		}

		if(target === null || target === index)
			return;
		if(target < 0)
			target = items.length - 1;
		if(target >= items.length)
			target = 0;

		ev.preventDefault();
		items.forEach(function(el){ el.tabIndex = (el === items[target]) ? 0 : -1; });
		items[target].focus();
	});
}

// The detail tabs are a real tab set, so they are labelled as one. Upstream's
// markup already pairs them with their panels — the tab is `li#tab_gcont` and
// its panel is `div#gcont` — so aria-controls needs no new bookkeeping, only
// the prefix removed.
//
// aria-selected follows upstream rather than leading it: selection is marked by
// a `selected` class ruTorrent puts on the li, so the class is what is watched
// and mirrored. Painting is untouched — Bootstrap styles these by class.
function draculaSyncTabRoles()
{
	var bar = document.getElementById("tabbar");
	if(!bar)
		return;
	bar.setAttribute("role", "tablist");

	Array.prototype.forEach.call(bar.querySelectorAll("li.nav-item"), function(li)
	{
		var link = li.querySelector("a");
		if(!link || !li.id)
			return;
		var panel = document.getElementById(li.id.replace(/^tab_/, ""));
		link.setAttribute("role", "tab");
		link.setAttribute("aria-selected", li.classList.contains("selected") ? "true" : "false");
		if(panel)
		{
			if(!link.id)
				link.id = "dracula-" + li.id;
			link.setAttribute("aria-controls", panel.id);
			panel.setAttribute("role", "tabpanel");
			panel.setAttribute("aria-labelledby", link.id);
		}
	});
}

// The sidebar — Views, State, Labels, Search, Feeds, Trackers. Unlike the
// toolbar there is no handler to remove: in 5.3.7 its 20 `panel-label` elements
// have `tabIndex` -1, no role, and a shadow root with zero focusable nodes, so
// there is nothing to focus and the whole region is built here.
//
// Selection runs off **mousedown**, not click (category-list-elements.js:168),
// so a synthetic `.click()` on a label changes nothing. Enter and Space
// dispatch mousedown instead, passing the modifiers through so Ctrl and Shift
// mean the same from the keyboard as from the mouse. Going through upstream's
// own event rather than its internals keeps the two from drifting apart.
//
// One compromise: the "save view" button sits inside `category-list` in
// upstream's markup, so a listbox role on the list encloses a button however
// the tab order is arranged. It is left in the arrow order, which keeps the
// region to a single tab stop and the button reachable.
function draculaLabelActivate(label, ev)
{
	label.dispatchEvent(new MouseEvent("mousedown", {
		bubbles: true,
		button: 0,
		ctrlKey: ev.ctrlKey,
		metaKey: ev.metaKey,
		shiftKey: ev.shiftKey
	}));
}

function draculaSyncSidebarRoles()
{
	var list = document.querySelector("category-list");
	if(!list)
		return;
	list.setAttribute("role", "listbox");
	list.setAttribute("aria-label", "Torrent filters");
	// Ctrl-click already adds to the selection, so say so.
	list.setAttribute("aria-multiselectable", "true");

	Array.prototype.forEach.call(list.querySelectorAll("category-panel"), function(panel)
	{
		panel.setAttribute("role", "group");
		var heading = panel.shadowRoot && panel.shadowRoot.querySelector("[part=heading]");
		var name = heading && heading.textContent.trim();
		if(name)
			panel.setAttribute("aria-label", name);
	});

	Array.prototype.forEach.call(list.querySelectorAll("panel-label"), function(label)
	{
		label.setAttribute("role", "option");
		label.setAttribute("aria-selected", label.hasAttribute("selected") ? "true" : "false");
		if(!label.hasAttribute("tabindex"))
			label.tabIndex = -1;
	});

	var save = document.getElementById("pview_save_view_button");
	if(save && !save.getAttribute("aria-label"))
		save.setAttribute("aria-label", "Save current filters as a view");
}

// The two row tables the keyboard reaches: the torrent list, and the file list
// in the detail panel. Nothing here duplicates upstream — `dxSTable.keyEvents`
// (stable.js:809) is bound to document keydown but handles exactly three keys:
// Delete, Ctrl-A and Ctrl-Z, no arrows, Space or Enter.
//
// Both are virtualised: only the rows on screen exist in the DOM, so a roving
// tabindex over rows would fight the renderer. The container is the tab stop
// instead and the current row is named by aria-activedescendant, which is the
// pattern virtualised lists exist for.
//
// Selection goes through upstream's own `selectRow`, which reads nothing from
// the row but its id (stable.js:840) — so a row scrolled out of the DOM can
// still be selected by passing `{ id: … }`. It ends by calling `onselect`, the
// same callback a mouse click ends with, so the details panel and the file menu
// follow along. Shift and Ctrl need no arithmetic here either: `selectRow`
// carries the whole range and toggle model (stable.js:848) and keeps the range
// anchor at `stSel[0]`.
//
// One implementation drives both tables. They differ in what the sideways keys
// can mean — the torrent list scrolls to a column, the file list walks the tree
// — and in nothing else.
function draculaTable(key)
{
	return (window.theWebUI && theWebUI.tables && theWebUI.tables[key])
		? theWebUI.tables[key].obj : null;
}

// The row menu, which upstream opens on a right click alone. Both tables have
// one: `trtSelect` builds the torrent menu (`webui.js:1367`) and `flsSelect`
// the file menu of priorities (`webui.js:1402`), each from its table's own
// `onselect`.
//
// It opens through upstream's own path rather than around it. `which: 3` is
// exactly what a right click sends, and that matters twice: `selectRow` keeps a
// multi-row selection intact when the row under the pointer is already in it
// (`stable.js:847`), and the two builders are what show the menu. Reimplementing
// either would mean two menus to keep in step.
//
// The menu is placed at the focused row's bottom-left, where a right click on
// its name would land. `theContextMenu.show` already pulls a menu back inside
// the window on both axes (`objects.js:441`), so a row at the bottom of the
// table needs nothing special here.
function draculaRowMenu(container, table, id)
{
	if(!table || !id)
		return;
	// Rows are virtualised, but every path that moves the focus scrolls the
	// target into view first, so the element is normally there; the container is
	// the fallback rather than a guess at coordinates.
	var anchor = document.getElementById(id) || container;
	var rect = anchor.getBoundingClientRect();
	var x = Math.round(rect.left + 24);
	var y = Math.round(rect.bottom);

	// The two tables do not place their menus the same way. `trtSelect` hands the
	// event's coordinates to `theContextMenu.show` (`webui.js:1559`), so a
	// synthetic event is enough to place the torrent menu; `flsSelect` calls it
	// bare (`webui.js:1415`), and a bare call falls back to `theContextMenu.mouse`
	// (`objects.js:446`) — the last place the pointer moved (`objects.js:307`),
	// which for a keypress is wherever the pointer happens to be resting.
	//
	// Writing that fallback is what puts the file menu on its own row, and it is
	// put back immediately: `show` applies the position synchronously before it
	// animates, and that value belongs to the pointer. A right click that follows
	// without the mouse having moved must still open where the pointer is, which
	// is the whole point of the fallback existing.
	var mouse = theContextMenu ? theContextMenu.mouse : null;
	var was = mouse ? { x: mouse.x, y: mouse.y } : null;
	if(mouse)
	{
		mouse.x = x;
		mouse.y = y;
	}

	try
	{
		table.selectRow({
			which: 3,
			metaKey: false,
			shiftKey: false,
			clientX: x,
			clientY: y
		}, { id: id });
	}
	finally
	{
		if(mouse)
		{
			mouse.x = was.x;
			mouse.y = was.y;
		}
	}
}

// Sideways movement lands on column edges rather than on a round number of
// pixels, so a step always leaves a whole column against the frame. The edges
// are summed from the heading cells because those are the only certainly-used
// widths — `colgroup` carries what was asked for, not what the table settled on.
//
// The two directions snap to different sides on purpose: a column boundary comes
// to rest against whichever edge of the port the step is moving towards, left
// going left and right going right. That is the edge the eye watches, and a
// column arriving there half shown reads as a missed step.
function draculaScrollColumn(direction, scroller, table)
{
	var edges = [0];
	var cells = table.tHeadRow[0].getElementsByTagName("td");
	var x = 0;
	for(var i = 0; i < cells.length; i++)
	{
		x += cells[i].getBoundingClientRect().width;
		edges.push(Math.round(x));
	}

	var port = scroller.clientWidth;
	var limit = scroller.scrollWidth - port;
	var at = scroller.scrollLeft;
	var target = (direction > 0) ? limit : 0;
	if(direction > 0)
	{
		// The first boundary still past the right of the port, brought back to
		// it — so the step reveals one more whole column and stops there.
		for(var f = 0; f < edges.length; f++)
			if(edges[f] > at + port + 1) { target = edges[f] - port; break; }
	}
	else
	{
		for(var b = 0; b < edges.length; b++)
			if(edges[b] < at - 1) target = edges[b];
	}
	scroller.scrollLeft = Math.max(0, Math.min(target, limit));
}

// Sideways in the file tree, where nothing scrolls: the table is
// `table-layout: fixed` and its five columns are asked for 550px inside a panel
// far wider than that, so it stretches to the port and never overflows. Right
// steps into the directory under the cursor, Left steps back out.
//
// Both go through upstream's own `ondblclick` (`webui.js:52`), the only path
// that repoints the directory and rebuilds the rows. It reads `link`, which is
// set on directory rows and absent on files (`common.js:1059`), so a file is
// declined by upstream rather than tested for here.
//
// The way back up is found by its name. Its row id is `_d_` at the top level but
// `_d_<parent path>` one level down — the same shape a real directory has — so
// the id is not the marker; `..` in the name column is.
function draculaFileTreeStep(direction, host, table)
{
	if(typeof table.ondblclick !== "function")
		return false;

	var target = null;
	if(direction < 0)
	{
		for(var i = 0; i < table.rowIDs.length; i++)
			if(table.getValueById(table.rowIDs[i], "name") === "..")
			{
				target = table.rowIDs[i];
				break;
			}
	}
	else
	{
		var id = host.getAttribute("aria-activedescendant");
		// `link` is a string on every directory row and absent on files, so its
		// type is the test; `getAttr` answers null for a row with no attributes
		// at all (stable.js:1578).
		if(id && typeof table.getAttr(id, "link") === "string" &&
			table.getValueById(id, "name") !== "..")
			target = id;
	}
	if(target === null)
		return false;

	table.ondblclick({ id: target });
	return true;
}

// Enter in the file list opens what there is to open: a directory opens by being
// stepped into, and a file, having nothing to open, offers its actions instead.
//
// A file must not reach `ondblclick`. The `data` plugin takes that over for rows
// with no `link` and starts a download (`plugins/data/init.js:8`, and its flat
// view branch downloads whatever the row is), which is not what pressing a key
// on a row asks for. The pointer keeps the download; only the key is redirected.
function draculaFileOpen(host, table, id)
{
	if(typeof table.getAttr(id, "link") === "string" &&
		typeof table.ondblclick === "function")
		table.ondblclick({ id: id });
	else
		draculaRowMenu(host, table, id);
}

// Rows are rebuilt as a table scrolls and as the server updates, so the roles
// are re-applied rather than set once.
function draculaSyncRowRoles(host, table)
{
	Array.prototype.forEach.call(
		host.querySelectorAll("table tbody:not(.stable-virtpad) tr"),
		function(row)
		{
			if(!row.id)
				return;
			row.setAttribute("role", "option");
			row.setAttribute("aria-selected", table.rowSel[row.id] ? "true" : "false");
		});
}

// Every region registers its host resolver here, because the host does not
// exist yet when the region is built and has to be claimed again later.
var draculaTableHosts = [];

function draculaSyncTableHosts()
{
	draculaTableHosts.forEach(function(claim) { claim(); });
}

// The focusable element of a row table is its scroll body, not the container
// around it. Two facts point the same way.
//
// A scroll container with no focusable child joins the tab order by itself from
// Chrome 127, so `div.stable-body` is a tab stop whether or not the theme asks
// for one — measured, Tab off `#List` lands on it. Taking it back out means
// marking it `tabindex="-1"` before Tab can reach it, and it does not exist when
// the region is built: `theWebUI` sets its tables up afterwards, and replaces a
// body again when its columns change. Making it the stop needs no such race, and
// it is the element the browser had already chosen.
//
// It also leaves the container's role alone, which `#FileList` needs: that is a
// detail panel, and `draculaSyncTabRoles` re-marks it `tabpanel` on every
// refresh — a `listbox` written on the same element would be overwritten within
// seconds.
//
// The stop is not merely tolerated, it is wanted: the torrent table is 3305px
// wide inside a 1636px port, so this is the only way to reach the right-hand
// columns from the keyboard, and Left and Right scroll it by whole columns.
//
// Options: `label` names the region to a screen reader; `sideways` is handed
// (direction, host, table) and answers whether it replaced the rows, which is
// what makes the remembered row worth forgetting; `open` is what Enter does to a
// row, defaulting to the table's own `ondblclick`.
function draculaTableKeys(containerId, key, options)
{
	var container = document.getElementById(containerId);
	if(!container || container.getAttribute("data-dracula-keys"))
		return;
	container.setAttribute("data-dracula-keys", "1");

	var label = options.label;
	var sideways = options.sideways;
	var open = options.open || function(host, table, id)
	{
		if(typeof table.ondblclick === "function")
			table.ondblclick({ id: id });
	};

	var host = function()
	{
		var body = container.querySelector(".stable-body");
		if(body && body.getAttribute("role") !== "listbox")
		{
			body.tabIndex = 0;
			body.setAttribute("role", "listbox");
			body.setAttribute("aria-multiselectable", "true");
			body.setAttribute("aria-label", label);
		}
		return body;
	};
	draculaTableHosts.push(host);
	host();

	// The body is a direct child of the container, so watching one level deep
	// catches it arriving and catches a replacement, while row redraws — which
	// happen several levels further down, on every server update — do not wake
	// this at all.
	new MutationObserver(host).observe(container, { childList: true });

	// The remembered row, which is not the selection: Ctrl and Shift move it
	// without it becoming the whole of what is selected.
	var focused = null;

	// The row is asked where it is rather than told, because no single row height
	// describes the column. `TR_HEIGHT` is `tr.height()` (stable.js:1623), a
	// jQuery content height, so padded 30px rows report 28 — and upstream sizes
	// its virtual padding with that same 28 while laying the rows out at 30. An
	// index times a height is wrong by two pixels a row either way.
	//
	// Rows are virtualised, so a distant target is not there to ask. The estimate
	// is only enough to make the renderer build it; the frame after, the row
	// itself settles the scroll.
	var bringIntoView = function(scroller, table, index)
	{
		var id = table.rowIDs[index];
		if(!id)
			return;

		// Answers whether the row is in view and needed nothing, so the caller
		// knows when to stop looking.
		var nudge = function()
		{
			var row = document.getElementById(id);
			if(!row)
				return false;
			// The heading floats at the top of the scrollport rather than
			// scrolling away, so the first place a row can be seen is under it.
			var head = scroller.querySelector("thead");
			var box = scroller.getBoundingClientRect();
			var rect = row.getBoundingClientRect();
			var ceiling = box.top + (head ? head.getBoundingClientRect().height : 0);
			if(rect.top < ceiling - 1)
				scroller.scrollTop -= ceiling - rect.top;
			else if(rect.bottom > box.bottom + 1)
				scroller.scrollTop += rect.bottom - box.bottom;
			else
				return true;
			return false;
		};

		if(nudge())
			return;
		var height = table.TR_HEIGHT || 30;
		if(!document.getElementById(id))
			scroller.scrollTop = Math.max(0, Math.min(index * height,
				scroller.scrollHeight - scroller.clientHeight));

		// The renderer rebuilds rows on its own clock and resizes the padding
		// above and below them as it goes, which moves the row after the scroll
		// that was meant to reveal it. A few frames catch the ordinary case.
		var settle = function(left)
		{
			requestAnimationFrame(function()
			{
				if(!nudge() && left > 1)
					settle(left - 1);
			});
		};
		settle(4);

		// A jump of more than three rows down a long table is not redrawn for
		// half a second (`stable.js:614`), which no number of frames will wait
		// out, so Home and End get one late look after that timer has fired.
		setTimeout(nudge, 600);
	};

	var select = function(scroller, table, id, ev, toggle)
	{
		table.selectRow({
			which: 1,
			metaKey: toggle || ev.ctrlKey || ev.metaKey,
			shiftKey: ev.shiftKey
		}, { id: id });
		focused = id;
		scroller.setAttribute("aria-activedescendant", id);
		bringIntoView(scroller, table, table.rowIDs.indexOf(id));
		draculaSyncRowRoles(scroller, table);
	};

	var forget = function(scroller)
	{
		focused = null;
		scroller.removeAttribute("aria-activedescendant");
	};

	// Upstream arms its own Delete and Ctrl-A only after the first mousedown on
	// the table (stable.js:209), which a keyboard user never sends. Arming on
	// focus is what the mouse path does one event earlier.
	//
	// `bindKeys` unbinds before it binds and the handler is one shared prototype
	// method (stable.js:97), so only the table armed last has those three keys.
	// Focus therefore claims them exactly as a mousedown on the table does.
	// The pointer moves the cursor as well. Upstream selects on mousedown
	// (stable.js:235), so the row just clicked is where the arrows have to carry
	// on from; without this they resume from wherever the keyboard was left,
	// which is not the row the user is looking at. Only rows carry an id — the
	// heading row and the virtual padding do not — so the selector is the test.
	container.addEventListener("mousedown", function(ev)
	{
		var scroller = host();
		var row = ev.target && ev.target.closest ? ev.target.closest("tr[id]") : null;
		if(!scroller || !row)
			return;
		focused = row.id;
		scroller.setAttribute("aria-activedescendant", row.id);
	});

	// `focusin` rather than `focus`, which does not bubble: the element taking
	// the focus is the body inside, not the container listening.
	container.addEventListener("focusin", function()
	{
		var table = draculaTable(key);
		var scroller = host();
		if(!table || !scroller)
			return;
		if(typeof table.bindKeys === "function")
			table.bindKeys();
		draculaSyncRowRoles(scroller, table);
	});

	container.addEventListener("keydown", function(ev)
	{
		var table = draculaTable(key);
		var scroller = host();
		if(!table || !scroller || !table.rowIDs.length)
			return;
		if(ev.altKey)
			return;

		var ids = table.rowIDs;
		var current = focused;
		if(!current || ids.indexOf(current) < 0)
			current = (table.stSel && table.stSel.length) ? table.stSel[0] : null;
		var index = (current && ids.indexOf(current) >= 0) ? ids.indexOf(current) : -1;
		// The linter is right that nothing reads this null: every case below
		// either assigns a number or returns, so the guard after the switch is
		// unreachable today. Both stay. They are the net under the next case
		// someone adds — one that forgets to assign would otherwise fall
		// through to ids[undefined] — and that is worth one dead assignment.
		// eslint-disable-next-line no-useless-assignment
		var target = null;

		switch(ev.key)
		{
			case "ArrowDown": target = (index < 0) ? 0 : Math.min(index + 1, ids.length - 1); break;
			case "ArrowUp":   target = (index < 0) ? 0 : Math.max(index - 1, 0); break;
			case "ArrowRight":
			case "ArrowLeft":
				ev.preventDefault();
				// A step that rebuilt the table leaves the remembered row naming
				// something that is gone, and upstream's range anchor with it.
				if(sideways(ev.key === "ArrowRight" ? 1 : -1, scroller, table))
					forget(scroller);
				return;
			case "Home":      target = 0; break;
			case "End":       target = ids.length - 1; break;
			case " ":
				if(index >= 0)
				{
					ev.preventDefault();
					select(scroller, table, ids[index], ev, true);
				}
				return;
			case "Enter":
				if(index < 0)
					return;
				ev.preventDefault();
				// Ctrl-Enter is free here, Enter opening the row with or without
				// it, so the menu takes it. In the sidebar Ctrl-Enter adds a
				// filter instead; Enter means a different thing in every region.
				if(ev.ctrlKey || ev.metaKey)
					draculaRowMenu(scroller, table, ids[index]);
				else
					open(scroller, table, ids[index]);
				// Opening a directory replaces the rows; opening a menu does not.
				if(table.rowIDs.indexOf(ids[index]) < 0)
					forget(scroller);
				return;
			// Both have to be taken on keydown: upstream cancels the
			// `contextmenu` event document-wide (`webui.js:244`), so the
			// browser's own path never arrives.
			case "ContextMenu":
				if(index < 0)
					return;
				ev.preventDefault();
				draculaRowMenu(scroller, table, ids[index]);
				return;
			case "F10":
				if(index < 0 || !ev.shiftKey)
					return;
				ev.preventDefault();
				draculaRowMenu(scroller, table, ids[index]);
				return;
			default: return;
		}

		if(target === null)
			return;
		ev.preventDefault();
		select(scroller, table, ids[target], ev, false);
	});
}

// The toolbar's loading indicator turns while the UI is waiting on the server
// and stands still otherwise, and it never stops halfway. CSS alone cannot do
// that: an animation ends the instant its rule stops matching, so a request
// finishing mid-turn would snap the web back to zero.
//
// So the class comes off at an iteration boundary rather than immediately. The
// keyframes hold at 360 degrees for the last third of each cycle, and a boundary
// is the end of that hold — the glyph is back at its starting angle, so removing
// the animation there moves nothing. A turn under way always finishes; one that
// has not begun never starts.
//
// What counts as "waiting" is upstream's judgement: `rtorrent.js:1598` reveals
// `#ind` only once a request has been outstanding for 500ms, and that gate is
// read here rather than reimplemented, so the timing has one source of truth.
//
// Not driven from `ajaxStart`: ruTorrent polls the server about every 2.5s
// whether or not anyone is doing anything, so a turn per round-trip would be a
// 2.4s turn starting every 2.5s — a web that never stops, reporting work nobody
// is waiting for. Background polling is not loading.
//
// The consequence is deliberate: on a fast server the web stays still, because
// nothing is slow enough to be worth reporting — 29 requests in 16s here, median
// 6ms, slowest 28ms, none near the 500ms gate. Stillness is the correct signal.
function draculaWatchLoadingIndicator()
{
	var ind = document.getElementById("ind");
	if(!ind)
		return;

	var stopWhenTurnEnds = false;

	// Motion alone reads at a glance only once you know what the glyph is, and on
	// a fast server the web is nearly always still, so the tooltip names it and
	// gives its state. A name and one word, not a manual for the mechanism.
	//
	// It follows the class rather than the request, so the word and the picture
	// cannot disagree: a request finishing mid-turn leaves the web turning for the
	// rest of that turn, and for that time it is truthfully busy.
	var setTitle = function(busy)
	{
		ind.title = "Activity Indicator\n" + (busy ? "Waiting" : "Idle");
	};
	setTitle(false);

	ind.addEventListener("animationiteration", function()
	{
		if(!stopWhenTurnEnds)
			return;
		stopWhenTurnEnds = false;
		ind.classList.remove("dracula-loading");
		setTitle(false);
	});

	new MutationObserver(function()
	{
		if(ind.style.visibility === "visible")
		{
			// A wait arriving during the rest cancels the pending stop, so
			// the web carries on into the next turn.
			stopWhenTurnEnds = false;
			ind.classList.add("dracula-loading");
			setTitle(true);
		}
		else if(ind.classList.contains("dracula-loading"))
			stopWhenTurnEnds = true;
	}).observe(ind, { attributes: true, attributeFilter: ["style"] });
}

// The tab icon. A theme cannot touch index.html, where the thirteen <link>
// elements that declare it live — one .ico, eight apple-touch sizes and four
// PNGs — but it can replace the lot from here with one inline SVG.
//
// The letterform is upstream's own, traced from images/favicon-196x196.png:
// same stem with its flared base, same top flag, same round shoulder on a thin
// neck. Tracing the raster directly follows its antialiasing and gives a lumpy
// outline; blurring a 12x upscale before the threshold gives a clean one and
// halves the path, 65 nodes against 138, the curve no longer describing noise.
//
// Two colours, both read from the palette rather than written here, which is the
// point of doing it this way: a re-themed copy of this folder changes its custom
// properties and the tab icon follows, with no JavaScript to edit.
var draculaLetterR =
	"M120 29C111 29 96 31 87 33C85 34 82 34 81 35C75 36 72 37 68 38C65 39 64 39 61 40" +
	"C58 40 57 41 55 42C54 42 53 43 53 43C52 43 50 44 49 44C46 45 45 46 43 47" +
	"C42 47 41 48 40 49C37 50 37 50 35 52C34 52 33 53 33 53C30 55 27 59 26 61" +
	"C23 67 22 72 25 77C27 80 28 80 33 83C39 85 40 86 42 88C45 91 47 96 48 102" +
	"C48 105 48 105 48 124C48 145 48 147 48 156C47 165 45 177 44 180C42 183 38 188 34 191" +
	"C33 192 32 193 31 193C30 194 29 195 28 195C27 196 25 198 23 201C20 205 20 213 23 218" +
	"C26 223 30 226 38 230C41 231 45 232 53 234C64 236 82 237 111 236C132 236 146 234 156 231" +
	"C163 228 170 223 172 218C174 212 174 204 171 200C169 197 168 196 163 194" +
	"C160 192 159 192 155 191C149 189 145 186 142 182C141 180 141 178 140 167" +
	"C138 149 137 128 138 119C139 107 141 102 146 101C149 100 153 102 158 106" +
	"C159 107 160 108 161 109C162 109 163 110 163 111C164 112 165 112 165 113" +
	"C166 113 167 114 168 115C171 117 177 120 182 121C188 123 197 123 203 121" +
	"C209 119 217 115 222 112C223 111 227 108 227 107C229 105 231 103 232 102" +
	"C232 101 233 99 234 99C236 96 238 90 239 86C241 78 241 68 239 61C238 58 236 52 235 51" +
	"C231 44 225 38 219 35C219 34 217 33 217 33C208 28 192 27 180 31C177 32 171 36 168 38" +
	"C167 39 166 40 166 41C165 41 164 42 164 42C164 43 163 44 162 45C161 46 159 47 159 48" +
	"C158 49 157 51 156 52C155 53 154 54 153 55C149 59 146 60 142 58C140 57 139 54 139 47" +
	"C137 34 135 31 129 29C127 29 122 28 120 29Z";

function draculaSetFavicon()
{
	var tile = draculaPaletteColor("--dracula-bg", "#282A36");
	var ink = draculaPaletteColor("--dracula-purple", "#BD93F9");
	var svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'>" +
		"<rect width='256' height='256' rx='56' fill='" + tile + "'/>" +
		"<path d='" + draculaLetterR + "' fill='" + ink + "'/></svg>";

	// Every one, or the browser is free to keep choosing an old one.
	var old = document.querySelectorAll("link[rel*='icon' i]");
	for(var i = 0; i < old.length; i++)
		old[i].parentNode.removeChild(old[i]);

	var href = "data:image/svg+xml," + encodeURIComponent(svg);

	var link = document.createElement("link");
	link.rel = "icon";
	link.type = "image/svg+xml";
	link.href = href;
	document.head.appendChild(link);

	// Safari does not read SVG favicons, and with upstream's links gone would
	// show nothing, so the same drawing is rasterised once and offered beside
	// it. Declared *after* the SVG on purpose: a browser that understands both
	// takes the vector and stays sharp at any zoom.
	//
	// A data: URI does not taint the canvas, so toDataURL is allowed here. The
	// whole thing is wrapped because a failure to rasterise must not cost the
	// icon that already works.
	try
	{
		var size = 64;
		var canvas = document.createElement("canvas");
		canvas.width = size;
		canvas.height = size;
		var img = new Image();
		img.onload = function()
		{
			try
			{
				canvas.getContext("2d").drawImage(img, 0, 0, size, size);
				var png = document.createElement("link");
				png.rel = "icon";
				png.type = "image/png";
				png.sizes = size + "x" + size;
				png.href = canvas.toDataURL("image/png");
				document.head.appendChild(png);
			}
			catch(e) { /* the vector is already installed; nothing to repair */ }
		};
		img.src = href;
	}
	catch(e) { /* same */ }
}

/* Called as this file is read rather than from `allDone`, which runs once every
   plugin has loaded — measured, upstream's thirteen icon links stand until
   1153ms from there and until 680ms from here. Nothing else on the page touches
   an icon link after 21ms, so there is no later writer to lose to.

   The palette has resolved by then and the icon is drawn from it. The fallbacks
   answer only if this ever runs ahead of the sheets, and a test holds them to
   the palette's own values so that it would not matter if it did. */
draculaSetFavicon();

/* A label with no picture of its own and a tracker with no favicon both draw
   nothing, for the same reason: tracklabels points those rows at
   `plugins/tracklabels/action.php?label=…` or `?tracker=…`, and with nothing to
   serve that endpoint answers 200 with a 16x16 PNG whose every pixel has alpha
   0. Nothing fails, so nothing in the DOM says the row is empty — the only way
   to know is to look at the pixels.

   Which is what this does: load the image once per URL, draw it, and ask whether
   any pixel is opaque. A row that paints nothing is marked, and plugins.css puts
   the theme's own glyph there. A CSS fallback layered underneath cannot do it:
   `::part(icon)::before` parses and paints, but a pseudo-element is painted
   after its originating element's background, so it covers the favicon rather
   than sitting behind it. */
var draculaIconInk = {};

function draculaIconKind(value)
{
	if(!value || value.indexOf("tracklabels/action.php?") < 0)
		return null;
	if(value.indexOf("?label=") >= 0)
		return "label";
	if(value.indexOf("?tracker=") >= 0)
		return "tracker";
	return null;
}

function draculaProbeIcon(url)
{
	draculaIconInk[url] = "pending";
	var img = new Image();
	img.onload = function()
	{
		var blank = true;
		try
		{
			var canvas = document.createElement("canvas");
			canvas.width = img.naturalWidth || 16;
			canvas.height = img.naturalHeight || 16;
			var context = canvas.getContext("2d");
			context.drawImage(img, 0, 0);
			var data = context.getImageData(0, 0, canvas.width, canvas.height).data;
			for(var i = 3; i < data.length; i += 4)
			{
				if(data[i] !== 0)
				{
					blank = false;
					break;
				}
			}
		}
		catch(e)
		{
			// Never call a row empty because the probe itself failed; leaving the
			// plugin's own image alone is the safe answer.
			blank = false;
		}
		draculaIconInk[url] = blank ? "blank" : "inked";
		draculaSweepIcons();
	};
	img.onerror = function() { draculaIconInk[url] = "inked"; };
	img.src = url;
}

/* The CSSOM gives a background back as `url("…")` in Chrome and Firefox, and as
   `url(…)` where nothing needs quoting. Anything that is not one plain url() —
   `none`, a gradient, a comma-separated stack — has no single URL to judge and
   answers empty. */
function draculaCssUrl(value)
{
	var m = /^\s*url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)\s*$/.exec(value || "");
	return m ? (m[1] || m[2] || m[3] || "") : "";
}

function draculaMarkBlankIcon(el, url)
{
	var kind = draculaIconKind(url);
	if(!kind)
	{
		el.removeAttribute("data-dracula-blank");
		return;
	}
	var state = draculaIconInk[url];
	if(state === undefined)
		draculaProbeIcon(url);
	else if(state === "blank")
		el.setAttribute("data-dracula-blank", kind);
	else if(state === "inked")
		el.removeAttribute("data-dracula-blank");
}

function draculaMarkIconsIn(selector, urlOf)
{
	var nodes = document.querySelectorAll(selector);
	for(var i = 0; i < nodes.length; i++)
		draculaMarkBlankIcon(nodes[i], urlOf(nodes[i]));
}

/* Three surfaces show these icons and each keeps the URL somewhere else: the
   sidebar panels in an `icon` attribute behind a `url:` prefix, the phone's
   filter list in an `img` src (`plugins/mobile/init.js:579`), and the details
   Trackers tab in an inline background written by `js/stable.js:944`. One probe
   answers for all three, being keyed by the URL rather than by the element, so a
   host already judged on one surface costs nothing on the next.

   Marking is all the first two need: the image tracklabels serves is
   transparent, not missing, so a background behind it shows through. The third
   needs a pseudo-element — see the note in stable.css. Either way only a row
   proved blank is ever marked, which is why a real favicon can never be
   covered. */
function draculaMarkFilterIcons()
{
	draculaMarkIconsIn("#torrentFilter img.filter-icon", function(el)
	{
		return el.getAttribute("src") || "";
	});
}

function draculaSweepIcons()
{
	draculaMarkLabelSeparator();
	draculaMarkIconsIn("panel-label[icon^='url:']", function(el)
	{
		return (el.getAttribute("icon") || "").slice(4);
	});
	draculaMarkFilterIcons();
	draculaMarkIconsIn("#TrackerList .stable-icon", function(el)
	{
		return draculaCssUrl(el.style.backgroundImage);
	});
}

/* A sidebar row ends in two pills, the count and the size, and ruTorrent 5.3.7
   put a `separator` part between them to hold the "/" that divides the two.
   Below that release the part does not exist and the pills sit against one
   another, so the theme draws the mark itself.
 *
 * No stylesheet can ask whether a shadow part exists, so the answer is written
 * onto the root for `style.css` to key on. It is a fact about the release, not
 * about any one row, so the first label to carry a size settles it for good.
 */
var draculaSeparatorAnswered = false;

function draculaMarkLabelSeparator()
{
	if(draculaSeparatorAnswered)
		return;
	var label = document.querySelector("panel-label[size]");
	if(!label || !label.shadowRoot)
		return;
	draculaSeparatorAnswered = true;
	if(!label.shadowRoot.querySelector("[part~=separator]"))
		document.documentElement.setAttribute("data-dracula-label-separator", "missing");
}

/* The panels are rebuilt as labels and trackers come and go, and a row can keep
   its element while its icon attribute changes. Watching `icon` alone is also
   what keeps this from looping: the sweep writes data-dracula-blank, which the
   filter ignores. */
function draculaWatchCategoryIcons()
{
	var list = document.getElementById("CatList");
	if(!list)
		return;
	new MutationObserver(draculaSweepIcons).observe(list, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ["icon"]
	});
}

/* The Trackers tab holds no rows until a torrent is selected and is rebuilt from
   scratch on every poll, so its marks have to be reapplied rather than set once.
   `style` is in the filter because that is where dxSTable puts the favicon and a
   reused row can change host without changing shape; the sweep writes only
   data-dracula-blank, which is not in the filter, so it cannot retrigger
   itself. */
function draculaWatchTrackerIcons()
{
	var list = document.getElementById("TrackerList");
	if(!list)
		return;
	new MutationObserver(draculaSweepIcons).observe(list, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ["style"]
	});
}

/* Every line of the log is a span.std carrying "[stamp] message" as one text
   node (`log()` in js/common.js), and log_history writes its "restored log"
   separators the same way. CSS cannot reach inside a text node, so the stamp
   gets an element of its own and the separators get a class; style.css decides
   the colours.

   Only a span holding exactly one text node is touched: `logHTML()` puts real
   markup in there, and rewriting that would throw the markup away. */
function draculaMarkLogEntry(node)
{
	if(!node || node.nodeType !== 1 || node.dataset.draculaLog)
		return;
	if(node.childNodes.length !== 1 || node.firstChild.nodeType !== 3)
		return;
	node.dataset.draculaLog = "1";

	var text = node.textContent;
	if(/^={3,}.*={3,}$/.test(text.trim()))
	{
		node.classList.add("dracula-log-rule");
		return;
	}

	var parts = /^(\[[^\]]*\])([\s\S]*)$/.exec(text);
	if(!parts)
		return;
	var stamp = document.createElement("span");
	stamp.className = "dracula-log-time";
	stamp.textContent = parts[1];
	node.textContent = "";
	node.appendChild(stamp);
	node.appendChild(document.createTextNode(parts[2]));
}

/* log_history replays the saved log by detaching every node and appending it
   again, so the observer sees old entries a second time. The data attribute
   keeps that from re-splitting a stamp that already has its own element. */
function draculaWatchLog()
{
	var lcont = document.getElementById("lcont");
	if(!lcont)
		return;
	Array.prototype.forEach.call(lcont.children, draculaMarkLogEntry);
	new MutationObserver(function(records)
	{
		records.forEach(function(record)
		{
			Array.prototype.forEach.call(record.addedNodes, draculaMarkLogEntry);
		});
	}).observe(lcont, { childList: true });
}

/* Called as this file is read rather than from `allDone`. The panel is drawn
   with entries in it from 154ms and style.css lands at 666ms, while `allDone`
   runs at 1190ms — from there the log spends 524ms painted in the theme with
   every stamp still the body colour. From here a stamp has its own element in
   the frame that first paints the sheet.

   `#lcont` is static markup (`index.html:254`) and no script replaces it, so it
   is on the page long before this file is read. */
draculaWatchLog();

/* Firefox reserves the torrent list's vertical scrollbar column and paints
   nothing in it on a first load: the list scrolls, 12px are taken out of the
   content, and no bar is drawn. A style recalculation creates it — switching
   the theme by hand and back is what makes it appear. Hiding and showing the
   scroller forces that recalculation without touching anything else; the rows
   do not flicker, because this runs before the list is on screen for long.

   Chrome draws the bar without any of this, and the toggle costs it one
   reflow. */
function draculaNudgeListScrollbar()
{
	var body = document.querySelector("#List div.stable-body");
	if(!body || body.scrollHeight <= body.clientHeight)
		return false;
	body.style.display = "none";
	void body.offsetHeight;
	body.style.display = "";
	return true;
}

/* Torrents arrive from the server well after allDone, so at install time there
   is nothing to overflow yet. Wait for the first list tall enough to need a bar
   and nudge once; 60 tries at half a second cover a slow first load, and a list
   that still fits its pane after that never needed one. */
function draculaWatchListScrollbar(tries)
{
	if(draculaNudgeListScrollbar() || tries > 60)
		return;
	setTimeout(function()
	{
		draculaWatchListScrollbar(tries + 1);
	}, 500);
}

plugin.draculaAllDone = plugin.allDone;
plugin.allDone = function()
{
	plugin.draculaAllDone.call(this);

	/* Everything below reaches into upstream's markup, wraps its functions and
	   binds handlers on the assumption that the theme's stylesheets are on the
	   page. When another UI has switched the theme off — the mobile plugin
	   disables it (`plugins/mobile/init.js:2138`) — none of that holds, and this
	   file keeps running anyway because ruTorrent splices it into the response.

	   `draculaCheckVersions` is the exception: it decides for itself whether
	   there is anything to report. */
	if(draculaThemeSwitchedOff())
	{
		draculaCheckVersions();
		return;
	}

	draculaWatchListScrollbar(0);

	// Once for what exists, then again whenever a plugin adds a button or a tab:
	// several arrive after allDone, each bringing its own focus handler.
	draculaRestoreKeyboardFocus();
	draculaWatchLoadingIndicator();
	draculaSweepIcons();
	draculaWatchCategoryIcons();
	draculaWatchTrackerIcons();
	var toolbar = document.getElementById("t");
	var tabbar = document.getElementById("tabbar");

	// Two of the five regions. The toolbar is a mixed row of links, a search
	// field and a select; the tab bar is a plain row of links whose stop starts
	// on whichever tab is open.
	var toolbarItems = "a.nav-link, input, select, button";
	var tabItems = "li.nav-item > a";
	if(toolbar)
	{
		toolbar.setAttribute("role", "toolbar");
		toolbar.setAttribute("aria-label", "Main toolbar");
		draculaRovingGroup(toolbar, toolbarItems);
	}
	if(tabbar)
	{
		draculaSyncTabRoles();
		draculaRovingGroup(tabbar, tabItems, { preferred: function(items)
		{
			return items.filter(function(el)
			{
				return el.parentElement.classList.contains("selected");
			})[0];
		}});
	}

	// The third region. The stop starts on whichever filter is already active,
	// so arriving by Tab puts you where the list currently is.
	var catlist = document.querySelector("category-list");
	var catItems = "panel-label, input.Button";
	if(catlist)
	{
		draculaSyncSidebarRoles();
		draculaRovingGroup(catlist, catItems, {
			preferred: function(items)
			{
				return items.filter(function(el){ return el.hasAttribute("selected"); })[0];
			},
			activate: function(el, ev)
			{
				if(el.tagName === "PANEL-LABEL")
					draculaLabelActivate(el, ev);
				else
					el.click();
			}
		});
	}

	// The file list is a region only while it is on screen: a `tabindex` on a
	// hidden element is not a tab stop, so it joins the roll when a torrent is
	// selected and the Files tab is showing, and leaves it again by itself.
	draculaTableKeys("List", "trt", {
		label: "Torrents",
		sideways: draculaScrollColumn
	});
	draculaTableKeys("FileList", "fls", {
		label: "Files",
		sideways: draculaFileTreeStep,
		open: draculaFileOpen
	});

	var refreshRegions = function()
	{
		draculaRestoreKeyboardFocus();
		draculaSyncTableHosts();
		if(toolbar) draculaRovingSync(toolbar, toolbarItems);
		if(tabbar)
		{
			draculaSyncTabRoles();
			draculaRovingSync(tabbar, tabItems);
		}
		if(catlist)
		{
			draculaSyncSidebarRoles();
			draculaRovingSync(catlist, catItems);
		}
	};

	// Plugins add buttons and tabs after allDone, and ruTorrent moves the
	// `selected` class as tabs are switched, so the class is watched alongside
	// the child lists.
	var focusObserver = new MutationObserver(refreshRegions);
	if(toolbar) focusObserver.observe(toolbar, { childList: true, subtree: true });
	if(tabbar) focusObserver.observe(tabbar,
		{ childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
	// Labels and trackers arrive from the server well after allDone, and the
	// `selected` attribute moves on every filter change; both are mirrored into
	// aria-selected.
	if(catlist) focusObserver.observe(catlist,
		{ childList: true, subtree: true, attributes: true, attributeFilter: ["selected"] });

	/* Disk: Pink when idle, Purple when full — light to deep, every value between
	   in the same family. quotaspace is gone from 5.3.7 and is not called.

	   CPU: Cyan to Purple. Cyan stays at the zero end so an idle machine matches
	   the Cyan icon beside the graph, which is why that colour was chosen; the
	   disk's ramp here would put Pink next to a Cyan icon at idle.

	   Purple at the far end rather than a warm colour, because the ramp is a
	   straight line through RGB and a line between a cool and a warm colour
	   passes through grey: Cyan to Orange gives #C5D1B5 at 50%, a grey-green in
	   a theme with none, where Cyan to Purple gives #A4BEFB and stays cool the
	   whole way. The reading is "how busy", not "how hot".

	   cpuload has no bar to repaint. In 5.3.7 it is a flot graph and these
	   colours arrive as its line colour, which flot fills underneath at partial
	   alpha, so the filled area looks muted next to the value named here. */
	draculaRecolorMeter(
		"diskspace",
		"meter-disk-value",
		"--dracula-pink",
		"--dracula-purple"
	);
	draculaRecolorMeter("cpuload", null, "--dracula-cyan", "--dracula-purple");

	draculaResharpenCpuGraph();
	draculaWatchPixelRatio();
	draculaWatchVisualViewport();

	var diskPane = document.getElementById("meter-disk-pane");
	var cpuPane = document.getElementById("meter-cpu-pane");
	var portPane = document.getElementById("port-pane");
	var stFd = document.getElementById("st_fd");
	var cells = document.querySelectorAll("#StatusBar > .status-cell");
	var torrentsCell = cells[6];
	var timeCell = cells[cells.length - 1];
	var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

	var updateTooltips = function()
	{
		draculaDiskTooltip(diskPane);
		draculaCpuTooltip(cpuPane);
		draculaConnectionsTooltip(stFd);
		draculaTorrentsTooltip(torrentsCell);
		draculaPortTooltip(portPane);
		if(timeCell)
			timeCell.title = "Local Time: " + tz;
	};

	// The disk and CPU panes have their titles rewritten by their plugins, so
	// those two are watched and re-applied; the rest are set once the bar has
	// filled in.
	var observer = new MutationObserver(updateTooltips);
	if(diskPane) observer.observe(diskPane, { attributes: true, attributeFilter: ["title"] });
	if(cpuPane) observer.observe(cpuPane, { attributes: true, attributeFilter: ["title"] });
	setTimeout(updateTooltips, 2000);

	draculaFlipConnectionValues(stFd);
	draculaSpeedClickOpensMenu(document.getElementById("st_up"));
	draculaSpeedClickOpensMenu(document.getElementById("st_down"));
	draculaStatusCellPopovers();
	draculaTabScrollIndicator();
	draculaStatusBarKeys();
	draculaWatchContextMenu();
	draculaWatchDialogs();
	draculaToolbarMenusToggle();
	draculaFillKeyHelp();
	draculaFixToolbarSeparators();
	draculaShortenMenuLabels();
	draculaWatchSearchSource();
	// Before the toolbar wrapper: that one calls resizeTop through the property,
	// and the floor has to be neutralised by the time it does.
	draculaLowerListFloor();
	draculaFixHiddenToolbarHeight();
	draculaTouchDividers();
	draculaTorrentActionKeys();
	draculaCheckVersions();
}

// Keys for the five common torrent actions. Upstream binds three in total
// (`stable.js:809` — Delete, Ctrl-A, Ctrl-Z), leaving Start, Pause, Stop,
// Reannounce and Force recheck mouse-only.
//
// Bare letters, Ctrl not being the theme's to spend: Ctrl-P is Settings
// (`webui.js:273`), Ctrl-O is Add Torrent, Ctrl-F is search, and Ctrl-S, Ctrl-R
// and Ctrl-T are the browser's — the mnemonic letters are exactly the
// unavailable ones. Unmodified they are free, every letter case in upstream's
// global handler being guarded by `metaKey`.
//
// This is the shape Delete has — live everywhere, held off while you type —
// which `stable.js:812` guards with `!e.fromTextCtrl` and
// `!theDialogManager.isModalState()`. `fromTextCtrl` is jQuery's, added by the
// patched `$.event.fix` at `common.js:81` for `input`, `textarea` and `a`; a
// native listener never sees it, so the test is written out in
// draculaTypingInto.
//
// It is written out slightly wider: `select` and contenteditable are added
// because these keys are *letters*. Delete does nothing in a `<select>`, but `s`
// jumps it to the first option starting with s — and would start the torrents
// at the same time.
//
// The third element is the whole help line, not a prefix, because Reannounce
// cannot take the shared ending: "Update trackers the selected torrents" is not
// a sentence. Recheck stays last so the destructive one is at the bottom.
var draculaTorrentActions = [
	["s", "start",         "Start the selected torrents"],
	["p", "pause",         "Pause the selected torrents"],
	["t", "stop",          "Stop the selected torrents"],
	["u", "updateTracker", "Reannounce to the trackers"],
	["r", "recheck",       "Force recheck the selected torrents"]
];

function draculaTypingInto(target)
{
	if(!target || !target.tagName)
		return false;
	if(target.isContentEditable)
		return true;
	return /^(INPUT|TEXTAREA|SELECT|A)$/.test(target.tagName);
}

function draculaRunTorrentAction(action)
{
	var table = window.theWebUI && theWebUI.getTable ? theWebUI.getTable("trt") : null;
	var count = table ? table.selCount : 0;
	if(!count || typeof theWebUI[action] !== "function")
		return false;

	// Recheck cannot be taken back: `webui.js:1570` is a bare
	// `perform("recheck")` with no confirmation of its own, and on a large torrent
	// the rehash starts at once. One is a fair mistake to make, a whole selection
	// is not, so past one it asks first — through upstream's own helper, so the
	// dialog is the one the rest of the product uses.
	if(action === "recheck" && count > 1 && typeof window.askYesNo === "function")
	{
		askYesNo("Force recheck",
			"Recheck " + count + " torrents? Rehashing cannot be stopped.",
			function() { theWebUI.recheck(); });
		return true;
	}

	theWebUI[action]();
	return true;
}

function draculaTorrentActionKeys()
{
	document.addEventListener("keydown", function(ev)
	{
		if(ev.ctrlKey || ev.altKey || ev.metaKey || ev.shiftKey || ev.repeat)
			return;
		if(draculaTypingInto(ev.target))
			return;
		if(window.theDialogManager && theDialogManager.isModalState())
			return;

		var key = String(ev.key).toLowerCase();
		for(var i = 0; i < draculaTorrentActions.length; i++)
		{
			if(draculaTorrentActions[i][0] !== key)
				continue;
			if(draculaRunTorrentAction(draculaTorrentActions[i][1]))
				ev.preventDefault();
			return;
		}
	});
}

// `getStatusIcon` (`webui.js:1993`) returns [iconName, word] and is the only
// place either is chosen, so both halves are corrected in one wrap.
//
// The icon name is only ever used as a CSS class — no caller across `js/` or
// `plugins/` branches on it — so new names are safe. The word is not so free:
// `scheduler/init.js:57` compares it against theUILang.Seeding and
// theUILang.Downloading to decide what to restart after a schedule change, so
// those two are left exactly as upstream wrote them.
//
// rTorrent raises one error bit for unrelated things and only the text tells
// them apart: "Tracker: [network error: ETIMEDOUT]" and "Tracker: [No DHT nodes
// available for peer search.]" say nothing about the data, yet look exactly like
// a torrent whose files have gone.
//
// An allowlist of the benign, not a blocklist of the dangerous, and deliberately
// so: a blocklist would let an unfamiliar phrasing pass quietly as a nuisance
// and dress a real loss in orange. An allowlist errs towards alarm.
function draculaMinorError(torrent)
{
	// The third source of the flag, and the one nothing in `state` or `msg`
	// distinguishes: rutracker_check sets it for a release it believes was taken
	// down (`rutracker_check/init.js:41`). The data is fine; the verdict is a page
	// parser's guess. chkstate arrives as a string, so this compares loosely,
	// exactly as the plugin does.
	// eslint-disable-next-line eqeqeq
	if(torrent.chkstate == 4)
		return true;
	return /^Tracker:/.test(torrent.msg || "");
}

function draculaErrorIcon(icon)
{
	return icon === "Status_Error" || icon === "Status_Error_Up" ||
		icon === "Status_Error_Down";
}

// Mirrors the one path through upstream's getStatusIcon that leaves both halves
// empty (`webui.js:1797-1822`): not checking, not hashing, not started. Reads
// the bits rather than the icon name, because by the time this is asked the
// error branch may already have overwritten the name.
function draculaStoppedTorrent(torrent)
{
	return !(torrent.state &
		(dStatus.started | dStatus.checking | dStatus.hashing));
}

// Installed from allDone rather than at file scope, and that is load-bearing:
// rutracker_check wraps getStatusIcon at its own file scope
// (`rutracker_check/init.js:60`) and returns early for chkstate 4 without
// calling through, so a file-scope wrap here would sit underneath it and never
// see that torrent. allDone runs after every plugin has loaded, which puts this
// wrap outermost.
function draculaStatusOverride()
{
	if(!window.theWebUI || typeof theWebUI.getStatusIcon !== "function")
		return;

	plugin.draculaStatusIcon = theWebUI.getStatusIcon;
	theWebUI.getStatusIcon = function(torrent)
	{
		var pair = plugin.draculaStatusIcon.call(this, torrent);
		var icon = pair[0];
		var status = pair[1];

		if(draculaErrorIcon(icon) && draculaMinorError(torrent))
			icon = "Status_Warning";

		if(draculaStoppedTorrent(torrent))
		{
			// Upstream has no stopped state: it falls through to Completed or
			// Incompleted *by percentage*, so one keypress earns a green tick
			// reading "Finished" on one row and an alarm on the next, neither
			// saying "this is not running".
			//
			// Both are stopped, and which of them finished is what the Progress
			// column is for, so the word is the same for both. Only the two
			// upstream writes here are replaced; anything a plugin substituted
			// (rutracker_check's "Probably deleted") is left to speak.
			if(status === theUILang.Finished || status === theUILang.Stopped)
				status = "Stopped";
			// A real error outranks it: a stopped torrent whose data is in
			// trouble keeps the red cross. A benign complaint about something
			// that is not running is stale news.
			if(!draculaErrorIcon(icon))
				icon = "Status_Stopped";
		}

		// A state, not something in progress. Outside the branch above because a
		// torrent on its way to paused counts as not running, and upstream's word
		// for it is neither Finished nor Stopped, so the rewrite there passes it
		// by.
		if(status === theUILang.Pausing)
			status = "Paused";

		return [icon, status];
	};
}

/* Installed as this file is read rather than from `allDone`, because the first
   torrent list is painted before `allDone` runs. `webui.js:1647` asks for a
   row's icon only inside a `processTorrents` pass, and `setRowById` touches a
   row only when that torrent's data has changed — so a row first painted
   through upstream's function keeps upstream's icon until something about that
   torrent moves, which on an idle one is a long time. Only `theWebUI` has to
   exist this early; the status words are read when the wrap is called.

   It installs whatever interface is showing. The mobile plugin calls
   `theWebUI.getStatusIcon(v)[1]` for a list row (`plugins/mobile/init.js:1880`)
   and for the details Status field (`:942`), taking element `[1]` and never
   `[0]` and computing its own icon class at `:1898`, so there the wrap changes
   the words and nothing visual. */
draculaStatusOverride();

// F4 hides the toolbar, and one branch in `theWebUI.resize` (`webui.js:2288`)
// then pushes the status bar off the bottom of the screen, where nothing can
// reach it — `html` and `body` are both `overflow: hidden`:
//
//     if ($("#t").css("display") === "none")
//         $("#maincont").height($(window).height() - 30);  // 25 bar + 5 margin
//
// Only the toolbar toggle reaches that branch; F6 and F7 never change `#t`, so
// `#maincont` keeps `height: ""` and the flex layout does the arithmetic. The 30
// describes a status bar this theme does not have — this one is 32px with a 5px
// top margin, 37 in all — so the bar ends up 7px short of the window.
//
// The correction measures the bar instead of naming a number, so changing the
// bar's padding cannot make it stale. `resizeTop` is re-run afterwards because
// the split is a fraction of the height just corrected, and it is called with
// upstream's own setting rather than a copy of its formula.
function draculaMainContentHeight()
{
	var toolbar = document.getElementById("t");
	var bar = document.getElementById("StatusBar");
	var main = document.getElementById("maincont");
	if(!toolbar || !bar || !main || getComputedStyle(toolbar).display !== "none")
		return;

	var barStyle = getComputedStyle(bar);
	var reserved = bar.getBoundingClientRect().height +
		parseFloat(barStyle.marginTop) + parseFloat(barStyle.marginBottom) +
		parseFloat(getComputedStyle(main).marginTop);

	main.style.height = Math.max(0, window.innerHeight - reserved) + "px";
	if(window.theWebUI && typeof theWebUI.resizeTop === "function")
		theWebUI.resizeTop(null,
			main.getBoundingClientRect().height * theWebUI.settings["webui.vsplit"]);
}

function draculaFixHiddenToolbarHeight()
{
	if(!window.theWebUI || typeof theWebUI.resize !== "function")
		return;
	var resize = theWebUI.resize;
	theWebUI.resize = function()
	{
		var result = resize.apply(this, arguments);
		draculaMainContentHeight();
		return result;
	};
	// Upstream registers its own `resize` as a window listener at startup
	// (`webui.js:242`), capturing the function rather than the property, so
	// wrapping the property alone leaves every window resize wrong. This listener
	// is added after upstream's and therefore runs after it.
	window.addEventListener("resize", draculaMainContentHeight);
	window.addEventListener("orientationchange", draculaMainContentHeight);
	draculaMainContentHeight();
}

/* === Dividers under a finger === */

// A landscape phone is 320 to 430px tall and a desktop window worth protecting
// from the floor below is taller than this.
var DRACULA_SHORT_VIEWPORT = 500;

// Below this a pointer that went down and came up is a tap, not a drag. Fingers
// never hold still; 6px is the slop this costs.
var DRACULA_TAP_SLOP = 6;

// True between pointerdown and release on a divider. The floor below is dropped
// while it is set, so a drag reaches both ends of the range.
var draculaDividerDragging = false;

function draculaShortViewport()
{
	return window.innerHeight <= DRACULA_SHORT_VIEWPORT;
}

/* resizeTop floors the list at `webui.list_table_min_height`, 300 by default
   (`webui.js:2269`), then caps it at the height of `#main-info`
   (`webui.js:2272`). In a landscape phone the whole main area is 230px: the
   floor claims all of it, the cap trims 5px back, and `#tdetails` is laid out
   0px tall with its tab row off screen — the panel is present, sized to nothing.

   The same floor pins a drag. In portrait a phone is 600-700px tall, so the floor
   applies in full and the divider moves down freely while refusing to rise above
   300px from the top. A handle that answers in one direction only is worse than
   one that does not move.

   The floor is right for the layout a desktop opens with, so it is dropped for
   the duration of the call rather than changed: the setting is restored
   immediately and never saved, and the arithmetic stays upstream's. */
function draculaLowerListFloor()
{
	if(!window.theWebUI || typeof theWebUI.resizeTop !== "function")
		return;
	var resizeTop = theWebUI.resizeTop;
	theWebUI.resizeTop = function(w, h)
	{
		if((!draculaShortViewport() && !draculaDividerDragging) || !theWebUI.settings)
			return resizeTop.call(this, w, h);
		var floor = theWebUI.settings["webui.list_table_min_height"];
		theWebUI.settings["webui.list_table_min_height"] = 0;
		try
		{
			return resizeTop.call(this, w, h);
		}
		finally
		{
			theWebUI.settings["webui.list_table_min_height"] = floor;
		}
	};
}

// Swaps the main area between the list and the detail panel. A short viewport
// cannot show both usefully, and this is also the fastest way to read a panel on
// a phone in either orientation. resize() runs afterwards because the speed
// graph sizes itself from its container (`webui.js:2283`).
function draculaTogglePanelFull()
{
	var details = document.getElementById("tdetails");
	if(!details || getComputedStyle(details).display === "none")
		return;
	document.body.classList.toggle("dracula-panel-full");
	if(window.theWebUI && typeof theWebUI.resize === "function")
		theWebUI.resize();
}

/* Upstream's DnD binds `mousedown`, `mousemove` and `mouseup` and nothing else
   (`objects.js:36-37`, `objects.js:50`), and `DnD.start` returns early below
   768px unless the caller passes `allowMobile`, which content.js does not
   (`objects.js:41-43`, `content.js:21`, `content.js:37`). Neither divider moves
   under a finger.

   Pointer events carry `clientX`/`clientY`, which is all these two need: both
   are constructed with `restrictX` and `restrictY`, so `DnD.run` never reads
   `movementX` and the whole drag runs through the coordinates its `onRun` uses.
   A touch bridged onto the mouse handlers instead would pass `undefined` there.

   Mouse pointers are handed straight back so the upstream path keeps them; this
   is bound beside that path, not over it. Capture is what keeps a drag alive
   after the finger leaves a 16px strip. */
function draculaDragDivider(el, onMove, onSettle, onTap)
{
	if(!el)
		return;
	var dragging = false, startX = 0, startY = 0, travelled = 0;

	el.addEventListener("pointerdown", function(e)
	{
		if(e.pointerType === "mouse")
		{
			// The drag itself stays upstream's, but upstream's DnD announces
			// nothing, and the floor below has to know a drag is running for a
			// mouse as much as for a finger. Cleared by the release bound in
			// draculaTouchDividers, wherever the button happens to come up.
			draculaDividerDragging = true;
			return;
		}
		dragging = true;
		draculaDividerDragging = true;
		travelled = 0;
		startX = e.clientX;
		startY = e.clientY;
		// A finger covers the handle it is holding, so the state has to be
		// readable at the edges of the contact: the grip goes Pink for as long as
		// the press lasts, the colour :active already gives it under a mouse.
		el.classList.add("dracula-divider-held");
		el.setPointerCapture(e.pointerId);
		e.preventDefault();
	});

	el.addEventListener("pointermove", function(e)
	{
		if(!dragging)
			return;
		travelled = Math.max(travelled,
			Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY));
		if(travelled > DRACULA_TAP_SLOP)
			onMove(e);
	});

	var release = function(e)
	{
		if(!dragging)
			return;
		dragging = false;
		draculaDividerDragging = false;
		el.classList.remove("dracula-divider-held");
		if(el.hasPointerCapture(e.pointerId))
			el.releasePointerCapture(e.pointerId);
		if(travelled > DRACULA_TAP_SLOP)
			onSettle(e);
		else if(onTap)
			onTap();
	};
	el.addEventListener("pointerup", release);
	el.addEventListener("pointercancel", release);
}

/* Toggle_details, F6, hides the panel and the divider together
   (`webui.js:2331-2335`). With the swap on, the list is hidden as well, so that
   would leave an empty main area and no divider left to tap back with. The swap
   is dropped before upstream runs. */
function draculaKeepDetailsToggleSafe()
{
	if(!window.theWebUI || typeof theWebUI.toggleDetails !== "function")
		return;
	var toggleDetails = theWebUI.toggleDetails;
	theWebUI.toggleDetails = function()
	{
		document.body.classList.remove("dracula-panel-full");
		return toggleDetails.apply(this, arguments);
	};
}

/* Where the drag puts the boundary, in list height, with both ends held short of
   swallowing the handle.

   Bottom end: the panel keeps a strip as tall as the divider itself. Without it
   the panel closes to nothing, the grip lands directly on the status bar and
   reads as part of it — a handle nobody can find is a handle that does not exist.
   The strip is the handle's own height because that is the smallest gap in which
   it still reads as the edge of a block.

   Top end: 1px rather than 0, because resizeTop returns early on `if(!w && !h)`
   (`webui.js:2457`) and a zero height reads there as "no value given", which pins
   the divider instead of letting the panel take the area. */
function draculaListHeightFor(clientY, list)
{
	var wanted = clientY - list.getBoundingClientRect().top;
	var main = document.getElementById("main-info");
	var divider = document.getElementById("VDivider");
	if(!main || !divider)
		return Math.max(1, wanted);

	var handle = divider.getBoundingClientRect().height;
	var room = main.getBoundingClientRect().height - handle * 2;
	return Math.max(1, Math.min(wanted, room));
}

/* One end of the range or the other: one of the two panes is down to a sliver.

   Upstream saves the split on every release (`content.js:46`), so without this a
   single drag to an end becomes the layout the interface opens with from then on
   — the panel gone, and nothing but the handle to say it ever existed. Covering
   one pane is a way of looking at the other, not a new default; the stored split
   is left at the last position that shows both. */
function draculaSplitAtAnEnd()
{
	var list = document.getElementById("list-table");
	var divider = document.getElementById("VDivider");
	var panel = document.getElementById("tdetails");
	if(!list || !divider || !panel)
		return false;
	var handle = divider.getBoundingClientRect().height;
	return list.getBoundingClientRect().height <= handle * 2 ||
		panel.getBoundingClientRect().height <= handle * 2;
}

function draculaTouchDividers()
{
	if(!window.theWebUI)
		return;
	draculaKeepDetailsToggleSafe();

	// A mouse drag is released wherever the button comes up, which is rarely over
	// a 5px divider, so the end of one is watched on the document. Both events are
	// bound because the flag left standing would drop the floor for good.
	var mouseReleased = function(e)
	{
		if(!e.pointerType || e.pointerType === "mouse")
			draculaDividerDragging = false;
	};
	document.addEventListener("pointerup", mouseReleased);
	document.addEventListener("pointercancel", mouseReleased);
	document.addEventListener("mouseup", mouseReleased);

	// The same two calls content.js gives the mouse (`content.js:29-33`), so a
	// touch drag and a mouse drag save the same setting.
	draculaDragDivider(document.getElementById("HDivider"),
		function(e){ theWebUI.resizeLeft(e.clientX); },
		function(){ theWebUI.setHSplitter(); },
		null);

	draculaDragDivider(document.getElementById("VDivider"),
		function(e)
		{
			// Dragging is meaningless while the list is hidden, and the
			// measurement below would read a zero box, so the swap is undone
			// first. Removing the class here forces the reflow that makes the
			// box real.
			document.body.classList.remove("dracula-panel-full");
			var list = document.getElementById("list-table");
			if(list)
				theWebUI.resizeTop(null, draculaListHeightFor(e.clientY, list));
		},
		function()
		{
			if(!draculaSplitAtAnEnd())
				theWebUI.setVSplitter();
		},
		draculaTogglePanelFull);
}

// Column headings and default widths, applied in the dxSTable.create hook at
// the bottom of this file.
//
// Headings: the Files tab ships "%", a bare symbol that says nothing next to
// Size, Done and Priority, and the torrent list calls its progress bar "Done"
// while the Files tab uses that word for a byte count. Both are the same
// TYPE_PROGRESS column, so both read "Progress".
//
// Widths are measured against real rows: at upstream's defaults "754.00 MiB"
// overflows Size, "0 (667)" overflows Seeds by 11px, and a full
// "01.03.2026 15:46:30" overflows Created On by 44px.
var draculaColumns = {
	fls: { percent: { text: "Progress" } },
	trt: {
		done:       { text: "Progress", width: "120px" },
		size:       { width: "100px" },
		// Speeds carry a unit and a "/s": "888.3 KiB/s" is 73px and a gigabit
		// line reaches "1023.99 MiB/s" at 92px, against the 56px that 70px of
		// column leaves for text — even "0.0 KiB/s" did not fit.
		dl:         { width: "110px" },
		ul:         { width: "110px" },
		// "5m 47s" is 47px and "999d 23h" is 59px, against 46px of room
		eta:        { width: "80px" },
		// Both print "connected (total)", so they size together: "12 (1234)" is
		// 61px. Upstream marks them ALIGN_RIGHT, but the bracketed pair is a
		// composite rather than a magnitude, and right-aligning lines up the
		// closing bracket instead of the number that matters.
		peers:      { width: "80px", align: ALIGN_LEFT },
		seeds:      { width: "80px", align: ALIGN_LEFT },
		// A byte column has to hold "1023.99 GiB" (77px) and, for these two, a
		// header wider still ("Downloaded" is 78px). 14px of that goes to
		// padding, so 100px leaves 8px of slack before either touches the
		// column edge.
		downloaded: { width: "115px" },
		uploaded:   { width: "115px" },
		remaining:  { width: "105px" },
		// Torrent names are long and the front of one is what identifies it, so
		// this column buys the most per pixel of any in the table. 260 cut even
		// short release names.
		name:    { width: "320px" },
		status:  { width: "115px" },
		ratio:   { width: "70px" },
		// Timestamps are TYPE_NUMBER, so dxSTable right-aligns them like a
		// magnitude. A date is read left to right and nearly fills its column,
		// which floats the short heading far right of where the value starts.
		// ALIGN_LEFT moves heading and cells together.
		created: { width: "160px", align: ALIGN_LEFT },
		// "Added" next to "Created On" reads as a different kind of value;
		// they are the same kind, so they are named the same way
		addtime: { text: "Added On", width: "160px", align: ALIGN_LEFT },
		tracker: { width: "140px" }
	}
};

// Speed and Trafic graphs both hardcode their series colors (#1C8DFF blue,
// #009900 green, and two darker variants for the previous period), none of them
// in the palette. Download takes the cyan and upload the green the theme uses
// for those directions in the status bar and the row icons; the previous-period
// series take the same hues further back, which palette.css holds as roles of
// their own.
//
// Resolved rather than named: these are written into flot's options and reach a
// canvas, which does not take a `color-mix()`.
//
// Hooked on the rGraph base rather than the two subclasses: both set
// this.datasets and only then call super.create(), so by the time this runs the
// datasets exist and the plot is built. Redrawing re-reads the options getter,
// which is what carries the new colors onto the canvas.
if(typeof rGraph !== "undefined")
{
	var draculaSeriesNames = {
		speedgraph_dl: "--dracula-cyan",
		speedgraph_ul: "--dracula-green",
		trafic_downloaded: "--dracula-cyan",
		trafic_uploaded: "--dracula-green",
		trafic_downloaded_old: "--dracula-graph-down-earlier",
		trafic_uploaded_old: "--dracula-graph-up-earlier"
	};

	// The Trafic graph builds its previous-period series by spreading the current
	// ones — `{...this.down, label: "trafic_downloaded_old"}` — which copies
	// labelTranslation too, so the legend lists "Downloaded" and "Uploaded" twice
	// with no way to tell which bar is which. The split is current period against
	// earlier: in "Per day" the bright series is today, the muted one before it.
	var draculaSeriesLabels = {
		trafic_downloaded_old: "Downloaded (earlier)",
		trafic_uploaded_old: "Uploaded (earlier)"
	};

	plugin.draculaGraphCreate = rGraph.prototype.create;
	rGraph.prototype.create = function(aOwner, webuiView)
	{
		plugin.draculaGraphCreate.call(this, aOwner, webuiView);
		var changed = false;
		for(var i = 0; i < this.datasets.length; i++)
		{
			var d = this.datasets[i];
			var name = draculaSeriesNames[d.label];
			var c = name ? draculaPaletteColor(name, null) : null;
			if(c)
			{
				d.color = c;
				changed = true;
			}
			var t = draculaSeriesLabels[d.label];
			if(t)
			{
				d.labelTranslation = t;
				// create() has already copied the old text into the static map
				rGraph.legendLabelTranslations[d.label] = t;
				changed = true;
			}
		}
		if(changed)
			this.draw(true);
	}
}

// The seedingtime plugin renames its columns after the table exists, retrying
// on a timer until every plugin has loaded, so a heading set at create time is
// overwritten a second later. Intercepting the rename keeps the list above
// authoritative no matter who renames a column or when.
plugin.draculaRenameColumn = dxSTable.prototype.renameColumnById;
dxSTable.prototype.renameColumnById = function(id, name)
{
	var patch = draculaColumns[this.prefix];
	if(patch && patch[id] && patch[id].text)
		name = patch[id].text;
	return plugin.draculaRenameColumn.call(this, id, name);
}

// Applied from the create hook rather than at load time: `styles` is the
// table's own columns array, and by then every plugin has pushed the columns it
// adds — AddTime and Tracker among them, which a load-time patch misses because
// those plugins run after this file.
//
/* `config()` lays the saved profile over the column definitions
   (`webui.js:382`) and the tables are created from that same array afterwards,
   so by the time the create hook runs a column's declared width is gone and a
   saved width has nothing left to be compared against.

   Read here instead. `config()` runs from `initFinish` once every plugin has
   loaded, so the columns AddTime and Tracker add are already in place, and it is
   the last moment before the profile covers what upstream declared. */
var draculaDeclaredWidths = {};

/* The sidebar opens with every section collapsed on a profile that has never
   held one. `webui.closed_panels` starts empty, so `panelClosed` answers
   `undefined`, `Object.assign` puts that on the element
   (`category-list-elements.js:230`), and the boolean setter runs
   `toggleAttribute("closed", undefined)`. An undefined second argument is not
   "false" there — it means no force is given, so the attribute is toggled, and
   an absent one becomes present.

   Coerced here rather than by writing the setting: nothing about the sidebar is
   the user's yet, and inventing entries for them would be a decision the theme
   has no business making. `undefined` becomes `false`, `toggleAttribute` clears
   the attribute, and the section opens.

   The list is reached through `theWebUI.categoryList` — upstream's own binding
   is a const in `createCategoryList` (`webui.js:2696`) and never global. It is
   assigned before `theWebUI.init()`, so it is already there when config runs. */
var draculaPanelsKept = false;

function draculaKeepPanelsOpen()
{
	var list = window.theWebUI && theWebUI.categoryList;
	if(draculaPanelsKept || !list || typeof list.panelClosed !== "function")
		return;
	draculaPanelsKept = true;
	var panelClosed = list.panelClosed;
	list.panelClosed = function()
	{
		return !!panelClosed.apply(this, arguments);
	};
}

/* The mobile plugin defaults to its light theme, which is the wrong default
   under a theme that only has a dark one. It reads that default late and only
   as a fallback:

     plugin.applyTheme(plugin.storedSetting('theme', validator, plugin.theme))

   so writing `plugin.theme` changes what a user who has never opened the
   setting sees, and changes nothing for one who has — the stored value wins.
   Never write the stored setting itself: that is the user's, and this is only
   the default behind it.

   The moment is available because of how the two plugins nest. Both wrap
   `theWebUI.config`; this theme is runlevel 5 and the mobile plugin 15, so the
   mobile plugin wraps the wrapper installed here, and its own wrapper reads

     plugin.config.call(this, data);   // this wrapper runs inside that call
     plugin.init();                    // and the default is read here

   which puts this call before the read with nothing to race against.

   Silent when the plugin is absent, which is every desktop page. */
function draculaDarkByDefaultOnMobile()
{
	var mobile = window.thePlugins && typeof thePlugins.get === "function"
		? thePlugins.get("mobile") : null;
	if(mobile && mobile.theme === "light")
		mobile.theme = "dark";
}

/* The phone's file list, coloured by kind like the desktop's.

   The plugin gives every entry one of two glyphs and no more: `bi-folder2-open`
   for a directory and for the way back up, `bi-file-earmark` for everything else
   (`plugins/mobile/init.js:1392`, `:1407`, `:1420`). The name is a bare text
   node beside the `<i>`, so no selector can read it and no rule can tell a
   folder from `..`, or a zip from a log. A class has to be put on.

   Read from the anchor rather than the icon: the name is the anchor's only text,
   and `&nbsp;` between them is what the trim leaves behind. `..` is the plugin's
   own spelling of the way up (`:1392`), matched as text because there is nothing
   else to match on.

   Marked, not rebuilt. Each `<i>` keeps its `bi-*` class, so an entry this
   theme has no answer for keeps the plugin's own glyph rather than turning
   into a blank square. */
function draculaMarkMobileFileIcons()
{
	var page = document.getElementById("detailsFilesPage");
	if(!page)
		return;

	Array.prototype.forEach.call(
		page.querySelectorAll("i.bi-folder2-open, i.bi-file-earmark"),
		function(icon)
		{
			var link = icon.parentElement;
			if(!link)
				return;
			// A non-breaking space is what the plugin writes between the icon and
			// the name, spelled as an escape so no editor can lose it.
			var name = link.textContent.replace(/\u00a0/g, " ").trim();

			if(icon.classList.contains("bi-folder2-open"))
			{
				if(name === "..")
					icon.classList.add("dracula-file-up");
				return;
			}
			var kind = draculaFileKind(name);
			if(kind)
				icon.classList.add("dracula-file-" + kind.toLowerCase());
		});
}

/* The list is emptied and rebuilt on every step into a directory
   (`plugins/mobile/init.js:1383`), so the marking follows the rebuild rather
   than running once.

   The plugin's own method is what carries it. Watching the container instead
   would mean waiting for markup that `plugin.init()` has not built yet, while
   the plugin object is already there to wrap — the same moment
   `draculaDarkByDefaultOnMobile` uses, and for the same reason. */
function draculaWatchMobileFiles()
{
	var mobile = window.thePlugins && typeof thePlugins.get === "function"
		? thePlugins.get("mobile") : null;
	if(!mobile || typeof mobile.drawFiles !== "function" || mobile.draculaDrawFiles)
		return;

	mobile.draculaDrawFiles = mobile.drawFiles;
	mobile.drawFiles = function()
	{
		var result = mobile.draculaDrawFiles.apply(this, arguments);
		draculaMarkMobileFileIcons();
		return result;
	};
}

/* Where the ratio's value sits inside a mobile status line, or null when the
   line carries none. The plugin builds the whole line as one string and the
   number is plain text inside it (`plugins/mobile/init.js:1907`), so nothing
   can reach the value until it is given an element of its own.

   The word is `theUILang.Ratio` and is whatever the user's language calls it,
   so it is passed in rather than written here. The number itself is not
   localised: `theConverter.round` builds it with `v + ""` (`js/common.js:344`),
   which is a full stop in every locale.

   `∞`, what the plugin writes when the ratio is unknown, fails the test and is
   left alone — it is not a number and has no side of 1 to be on. */
function draculaMobileRatioAt(text, word)
{
	if(typeof text !== "string" || typeof word !== "string" || word === "")
		return null;
	var at = text.indexOf(word + " ");
	if(at === -1)
		return null;
	var start = at + word.length + 1;
	var end = text.indexOf(" ", start);
	var raw = text.slice(start, end === -1 ? text.length : end);
	if(!/^[0-9]+(\.[0-9]+)?$/.test(raw))
		return null;
	return { start: start, length: raw.length, value: parseFloat(raw) };
}

/* One element per status line, and only for a line without one yet. The plugin
   rewrites a row's line whole on every change — `row.find('span').html(…)`,
   `plugins/mobile/init.js:1953` — which takes the element with it, so the check
   is what holds the work down to the rows that actually changed: over eleven
   update cycles on a three-torrent list, three wraps.

   A `<b>` rather than a `<span>` because that same update line selects `span`
   and would take this element into its jQuery set. The weight it brings is
   reset in mobile.css, where the element also carries the margins that stand in
   for white space a flex row drops at an item's edges. */
function draculaMarkMobileRatios()
{
	var word = window.theUILang ? theUILang.Ratio : null;
	var lines = document.querySelectorAll("#torrentsList #list td > span");
	for(var i = 0; i < lines.length; i++)
	{
		if(lines[i].querySelector(".dracula-ratio"))
			continue;
		var text = lines[i].firstChild;
		if(!text || text.nodeType !== 3)
			continue;
		var found = draculaMobileRatioAt(text.textContent, word);
		if(!found)
			continue;
		var value = text.splitText(found.start);
		value.splitText(found.length);
		var box = document.createElement("b");
		box.className = "dracula-ratio";
		// How far along the ramp mobile.css mixes, as a plain number for
		// `calc()`. Clamped at 1: past a full return the colour stops moving.
		box.style.setProperty("--dracula-ratio-met",
			String(Math.round(Math.min(found.value, 1) * 100)));
		value.parentNode.replaceChild(box, value);
		box.appendChild(value);
	}
}

/* Where the next separator's bar sits in a status line, or -1 for none.

   The plugin writes exactly two, and writes both as the literal `" | "` — one
   before the ETA or the ratio, one before a tracker message and only when there
   is one (`plugins/mobile/init.js:1907`). Requiring the spaces is what keeps a
   bar the daemon put inside a state string from being read as a separator; the
   returned index is the bar alone, so the spaces stay in the text they came
   from. */
function draculaMobileSeparatorAt(text, from)
{
	if(typeof text !== "string")
		return -1;
	var at = text.indexOf(" | ", from > 0 ? from : 0);
	return at === -1 ? -1 : at + 1;
}

/* One rate reading in a status line, arrow included: where it starts, how long
   it runs, and which way it points.

   The plugin writes ` ↑` and ` ↓` before `theConverter.speed`
   (`plugins/mobile/init.js:1906`, `:1907`), and a line can carry both — upload
   first. `speed()` is `bytes()` plus `/s`, and `bytes()` puts exactly one space
   between the number and the unit, so a reading is the arrow, a token, a space
   and one more token. It ends at the space after the unit, which is the space
   before the next arrow or before the bar. */
function draculaMobileRateAt(text, from)
{
	if(typeof text !== "string")
		return null;
	var at = -1;
	for(var i = from > 0 ? from : 0; i < text.length; i++)
	{
		var ch = text.charAt(i);
		if(ch === "↑" || ch === "↓")
		{
			at = i;
			break;
		}
	}
	if(at === -1)
		return null;
	var space = text.indexOf(" ", at);
	if(space === -1)
		return null;
	var end = text.indexOf(" ", space + 1);
	if(end === -1)
		end = text.length;
	return {
		start: at,
		length: end - at,
		direction: text.charAt(at) === "↑" ? "up" : "down"
	};
}

/* Each rate in a line, wrapped so it can answer by direction.

   Before the separators, for the reason the ratio is: that pass splits the
   line's text nodes, and a reading left in a later node would not be found.
   `<b>` because the plugin's update line selects `span`. */
function draculaMarkMobileRates()
{
	var lines = document.querySelectorAll("#torrentsList #list td > span");
	for(var i = 0; i < lines.length; i++)
	{
		if(lines[i].querySelector(".dracula-rate"))
			continue;
		var node = lines[i].firstChild;
		if(!node || node.nodeType !== 3)
			continue;
		for(;;)
		{
			var found = draculaMobileRateAt(node.textContent, 0);
			if(!found)
				break;
			var rate = node.splitText(found.start);
			node = rate.splitText(found.length);
			var box = document.createElement("b");
			box.className = "dracula-rate dracula-rate-" + found.direction;
			rate.parentNode.replaceChild(box, rate);
			box.appendChild(rate);
		}
	}
}

/* Both separators of one line, wrapped so they can take a colour of their own.

   Runs after the ratio, never before: that pass reads the line's first text
   node, and splitting the node here would leave the ratio in a later one where
   it would not be found.

   A tracker message can hold a bar of its own, but it arrives inside an `<i>`
   (`plugins/mobile/init.js:1910`) — walking only the line's own text children
   is what keeps this out of it. `<b>` for the same reason the ratio uses one:
   the plugin's update line selects `span`. */
function draculaMarkMobileSeparators()
{
	var lines = document.querySelectorAll("#torrentsList #list td > span");
	for(var i = 0; i < lines.length; i++)
	{
		if(lines[i].querySelector(".dracula-sep"))
			continue;
		var texts = [];
		for(var child = lines[i].firstChild; child; child = child.nextSibling)
		{
			if(child.nodeType === 3)
				texts.push(child);
		}
		for(var t = 0; t < texts.length; t++)
		{
			var node = texts[t];
			for(;;)
			{
				var at = draculaMobileSeparatorAt(node.textContent, 0);
				if(at === -1)
					break;
				var bar = node.splitText(at);
				node = bar.splitText(1);
				var box = document.createElement("b");
				box.className = "dracula-sep";
				bar.parentNode.replaceChild(box, bar);
				box.appendChild(bar);
			}
		}
	}
}

var draculaRefreshSpin = { pending: false, timer: null };

/* Whether the refresh arrow is turning. The glyph is painted on the
   pseudo-element, so that is what turns; the class goes on the element it
   inherits from.

   Stopping waits for the turn to finish. A list that arrives in a tenth of a
   second would otherwise cut the arrow off wherever it had got to, which reads
   as a twitch rather than as an answer — so the class comes off on the next
   `animationiteration`, and the arrow always completes whole turns.

   Two things that would strand it. With no animation running — a reduced-motion
   preference makes it `none` — the event never comes, so the class comes off at
   once. And a request that starts while one is finishing clears the flag, which
   the listener checks: the arrow keeps turning rather than stopping under a
   fresh request. */
function draculaSpinRefresh(on)
{
	var icon = document.querySelector("#refreshIcon i");
	if(!icon)
		return;
	if(on)
	{
		delete icon.dataset.draculaStopping;
		icon.classList.add("dracula-refreshing");
		return;
	}
	if(!icon.classList.contains("dracula-refreshing")
		|| icon.dataset.draculaStopping)
		return;
	if(window.getComputedStyle(icon, "::before").animationName === "none")
	{
		icon.classList.remove("dracula-refreshing");
		return;
	}
	icon.dataset.draculaStopping = "1";
	icon.addEventListener("animationiteration", function whole()
	{
		icon.removeEventListener("animationiteration", whole);
		if(!icon.dataset.draculaStopping)
			return;
		delete icon.dataset.draculaStopping;
		icon.classList.remove("dracula-refreshing");
	});
}

/* A list request has gone out. `now` is a press: the control has to answer the
   finger whatever the connection is doing. Everything else is the background
   poll, every 2500ms, and turning the arrow that often would be motion nobody
   asked for — so it waits a second first, and a request that comes back inside
   that second never shows at all. What is left showing is a slow answer or a
   stalled one, which is the thing worth seeing. */
function draculaListRequestStarted(now)
{
	draculaRefreshSpin.pending = true;
	if(now)
	{
		draculaSpinRefresh(true);
		return;
	}
	if(draculaRefreshSpin.timer !== null)
		return;
	draculaRefreshSpin.timer = window.setTimeout(function()
	{
		draculaRefreshSpin.timer = null;
		if(draculaRefreshSpin.pending)
			draculaSpinRefresh(true);
	}, 1000);
}

/* Any end at all, and there are three: the list was processed, the request
   errored, or it timed out. A flag rather than a count of requests in flight —
   the arrow says whether the interface is waiting, not how many things it is
   waiting for, and a count that leaks once turns forever. */
function draculaListRequestEnded()
{
	draculaRefreshSpin.pending = false;
	if(draculaRefreshSpin.timer !== null)
	{
		window.clearTimeout(draculaRefreshSpin.timer);
		draculaRefreshSpin.timer = null;
	}
	draculaSpinRefresh(false);
}

var draculaDiskMeterWatched = false;

/* The phone's disk meter, on the palette the desktop's already uses.

   The plugin ramps it green to red and writes the result as an inline
   `background-color` (`plugins/mobile/init.js:807`), which puts it past any rule
   that carries no `!important`. Pink to Purple for the reason at
   `draculaRecolorMeter`, and through the same `RGBackground` so both UIs
   interpolate identically and agree at every percentage.

   An observer rather than a wrapper: the colour is written from inside an async
   response handler that offers no seam of its own. The element is static markup
   (`plugins/mobile/mobile.html:202`), so one observer covers every write for the
   life of the page. It disconnects around its own write, which is what keeps the
   write from re-entering it.

   Installed from the settings page rather than at config time: the element
   arrives with `mobile.html`, which the plugin fetches and injects after this
   script has run, and the settings page is the only place it is seen. */
function draculaColourMobileDiskMeter()
{
	if(draculaDiskMeterWatched)
		return;
	var bar = document.querySelector("#diskSpaceBar .progress-bar");
	if(!bar || typeof RGBackground !== "function"
		|| typeof MutationObserver !== "function")
		return;
	draculaDiskMeterWatched = true;

	var start = draculaPaletteBackground("--dracula-pink");
	var end = draculaPaletteBackground("--dracula-purple");
	var watch = { attributes: true, attributeFilter: ["style"] };
	var observer = new MutationObserver(function()
	{
		observer.disconnect();
		var percent = parseFloat(bar.style.width);
		if(!isNaN(percent))
		{
			bar.style.backgroundColor = new RGBackground()
				.setGradient(start, end, percent)
				.getColor();
		}
		observer.observe(bar, watch);
	});
	observer.observe(bar, watch);
}

/* Where the unit begins in a rate the converter built, or -1 when the string is
   not one.

   `theConverter.speed` is `bytes()` with "/" and the localised second appended,
   and `bytes()` is the rounded number, one space, and the localised unit
   (`js/common.js:446`, `:442`) — so the one space is the seam and everything
   past it is the unit, "/s" included. Both halves are localised and neither is
   written here.

   A rate of zero is the empty string, not "0 B/s", so nothing to split; and the
   number is built by `theConverter.round` as `v + ""`, which is a full stop in
   every locale. */
var DRACULA_FIGURE = /^[0-9]+(\.[0-9]+)?$/;

function draculaSpeedUnitAt(text)
{
	if(typeof text !== "string")
		return -1;
	var at = text.indexOf(" ");
	if(at <= 0)
		return -1;
	if(!DRACULA_FIGURE.test(text.slice(0, at)))
		return -1;
	return at + 1;
}

/* The unit as an element beside the rate, so the bar's readout can lay the two
   out in columns of their own.

   Beside rather than inside: the plugin sets the span's text whole on every
   pass (`plugins/mobile/init.js:2096`), which would take a child with it, and
   the grid needs the two as separate items in any case.

   The span alone says what upstream wrote, because the plugin rewrites the span
   and leaves the element beside it standing. A whole rate in the span is
   therefore a rate to split, and a bare figure with a unit already beside it is
   this function's own output and is left alone — which is what keeps a pass
   with nothing new to do from writing, and the watcher from answering its own
   writes. */
function draculaMarkMobileSpeeds()
{
	var ids = ["upspeed", "downspeed"];
	for(var i = 0; i < ids.length; i++)
	{
		var span = document.getElementById(ids[i]);
		if(!span)
			continue;
		var unit = span.nextElementSibling;
		if(unit && unit.className !== "dracula-unit")
			unit = null;
		var text = span.textContent;
		var at = draculaSpeedUnitAt(text);
		if(at === -1)
		{
			/* Split already, or a rate with no unit to split off — zero, which
			   the converter writes as nothing at all, among them. */
			if(unit && !DRACULA_FIGURE.test(text))
				unit.parentNode.removeChild(unit);
			continue;
		}
		if(!unit)
		{
			unit = document.createElement("b");
			unit.className = "dracula-unit";
			span.parentNode.insertBefore(unit, span.nextSibling);
		}
		if(unit.textContent !== text.slice(at))
			unit.textContent = text.slice(at);
		span.textContent = text.slice(0, at - 1);
	}
}

/* The readout is written from a callback rather than from the pass that asks
   for it: the plugin fetches the trackers it has no cache for before it renders,
   and the rates go in when that answer lands (`plugins/mobile/init.js:2096`).
   Splitting from the wrap alone therefore leaves the first readout in upstream's
   own spacing until the pass after it, a poll away.

   So the split follows the text. The readout is the list's sibling rather than
   part of it, so the observer that follows the rows never sees it, and the rates
   sit one wrapper down from the item (`plugins/mobile/mobile.html:31`). */
var draculaMobileSpeedsWatched = false;

function draculaWatchMobileSpeeds()
{
	if(draculaMobileSpeedsWatched)
		return;
	var span = document.getElementById("upspeed");
	var readout = span && span.parentNode ? span.parentNode.parentNode : null;
	if(!readout)
		return;
	draculaMobileSpeedsWatched = true;

	var marking = false;
	new MutationObserver(function()
	{
		if(marking)
			return;
		marking = true;
		draculaMarkMobileSpeeds();
		marking = false;
	}).observe(readout, { childList: true, subtree: true, characterData: true });
}

/* rTorrent answers an unset limit with a figure at its own ceiling rather than
   with nothing, so a limit is a figure above zero and below it (`js/webui.js:2170`). */
var DRACULA_NO_LIMIT = 327625 * 1024;

function draculaMobileLimit(value)
{
	if(!(value > 0) || value >= DRACULA_NO_LIMIT)
		return "";
	if(!window.theConverter || typeof theConverter.speed !== "function")
		return "";
	return theConverter.speed(value);
}

function draculaMobileLimitRow(item, name)
{
	var row = item.querySelector("." + name);
	if(row)
		return row;
	row = document.createElement("div");
	row.className = name;
	var parts = ["dracula-limit-value", "dracula-limit-unit", "dracula-limit-icon"];
	var tags = ["span", "b", "i"];
	for(var i = 0; i < parts.length; i++)
	{
		var part = document.createElement(tags[i]);
		part.className = parts[i];
		row.appendChild(part);
	}
	item.appendChild(row);
	return row;
}

/* The speed limits, which this interface shows nowhere and the desktop reads
   from the same two figures.

   Placed before the readout rather than after it: every rule that lays the
   readout out keys on `li:last-child`, and an item appended to the list would
   take that selector from it. The bar's edge is `order` instead.

   A row whose direction is unlimited is empty, and with neither limited the
   whole item goes — which is the state a bar without a limit is in, and it then
   stands exactly as it stood before this existed. */
function draculaShowMobileLimits()
{
	var nav = document.querySelector("#mainNavbar .nav");
	var total = window.theWebUI && theWebUI.total;
	if(!nav || !total || !nav.lastElementChild)
		return;
	var item = nav.querySelector(".dracula-limits");
	if(!item)
	{
		item = document.createElement("li");
		item.className = "dracula-limits";
		nav.insertBefore(item, nav.lastElementChild);
	}
	var rows = [
		["dracula-limit-up", draculaMobileLimit(total.rateUL)],
		["dracula-limit-down", draculaMobileLimit(total.rateDL)]
	];
	var shown = false;
	for(var i = 0; i < rows.length; i++)
	{
		var row = draculaMobileLimitRow(item, rows[i][0]);
		var text = rows[i][1];
		var at = text ? draculaSpeedUnitAt(text) : -1;
		if(text)
			shown = true;
		/* The row stays even when its direction is unlimited. Removed, the other
		   direction's limit becomes the item's only row and centres on the bar
		   instead of standing under the rate it holds. */
		row.querySelector(".dracula-limit-value").textContent =
			at === -1 ? text : text.slice(0, at - 1);
		row.querySelector(".dracula-limit-unit").textContent =
			at === -1 ? "" : text.slice(at);
		row.querySelector(".dracula-limit-icon").hidden = !text;
	}
	item.hidden = !shown;
}

/* Whether a selection is being held inside the torrent list.

   The plugin rewrites a changed row's status line whole —
   `row.find('span').html(…)`, `plugins/mobile/init.js:1953` — which replaces the
   text nodes under it and takes any selection in them with it. Measured on a
   transferring row: the selection went at 2103ms, the same millisecond the row's
   markup changed. A selection in the torrent's name survives, because that
   element is not rewritten.

   `isCollapsed` is what keeps a caret from counting: only a real selection, with
   text in it, holds anything up. */
function draculaHoldingListSelection()
{
	var list = document.getElementById("torrentsList");
	var selection = window.getSelection ? getSelection() : null;
	if(!list || !selection || !selection.rangeCount || selection.isCollapsed)
		return false;
	return list.contains(selection.getRangeAt(0).commonAncestorContainer);
}

/* The three marks a status line carries. Each skips a line it has marked
   already, so a pass with nothing new to do costs a walk and writes nothing. */
function draculaMarkMobileLineParts()
{
	draculaMarkMobileRatios();
	draculaMarkMobileRates();
	draculaMarkMobileSeparators();
}

/* The rows are not in the document when `plugin.processTorrents` returns on its
   first pass — measured there, the list holds none at that moment and holds
   them a frame later. Marking from the wrap alone therefore leaves the first
   list plain until the pass after it, which is a poll interval away: 2.8
   seconds here and longer on a slow link.

   So the marks follow the rows. `#torrentsList` belongs to the plugin's own
   markup and does not exist when the wrap is installed, which is why this goes
   on from the first pass rather than beside it.

   The marks are written inside the subtree being watched, so the observer would
   otherwise see its own writes; `marking` is what stops that. */
var draculaMobileLinesWatched = false;

function draculaWatchMobileLines()
{
	if(draculaMobileLinesWatched)
		return;
	var list = document.getElementById("torrentsList");
	if(!list)
		return;
	draculaMobileLinesWatched = true;

	var marking = false;
	new MutationObserver(function()
	{
		if(marking)
			return;
		marking = true;
		draculaMarkMobileLineParts();
		marking = false;
	}).observe(list, { childList: true, subtree: true });
}

/* `plugin.processTorrents` is where every row is written, created on the first
   pass and rewritten in place after (`plugins/mobile/init.js:1844`). Installed
   from the same window as the dark default, where the plugin object already
   exists and its own init has not run.

   Silent when the plugin is absent, which is every desktop page. */
function draculaMarkMobileLines()
{
	var mobile = window.thePlugins && typeof thePlugins.get === "function"
		? thePlugins.get("mobile") : null;
	if(!mobile || typeof mobile.processTorrents !== "function")
		return;
	var upstream = mobile.processTorrents;
	mobile.processTorrents = function()
	{
		/* A pass that would rewrite the row a selection is in destroys it, so
		   while one is held the list stands still. Nothing is lost: the plugin
		   compares each row against `rowsPrev`, which this pass leaves untouched,
		   so the next one applies everything skipped. The arrow is still told the
		   request finished, or it would turn until the selection went. */
		if(draculaHoldingListSelection())
		{
			draculaListRequestEnded();
			return undefined;
		}
		var result = upstream.apply(this, arguments);
		draculaWatchMobileLines();
		draculaMarkMobileLineParts();
		draculaWatchMobileSpeeds();
		draculaMarkMobileSpeeds();
		draculaListRequestEnded();
		return result;
	};

	/* Both ends of both paths. A list arrives two ways — the core's own poll,
	   which reaches `processTorrents` through `theWebUI.addTorrents`, and the
	   plugin's one-shot `update` — and it fails two ways, neither of which
	   reaches `processTorrents` at all (`js/webui.js:1591`, `:1597`). Without the
	   failing pair the arrow would turn until the next success, which after an
	   error is up to two minutes away. */
	if(typeof mobile.update === "function")
	{
		var update = mobile.update;
		mobile.update = function()
		{
			draculaListRequestStarted(false);
			return update.apply(this, arguments);
		};
	}

	if(typeof theWebUI.update === "function")
	{
		var poll = theWebUI.update;
		theWebUI.update = function()
		{
			draculaListRequestStarted(false);
			return poll.apply(this, arguments);
		};
	}

	var stop = ["error", "timeout"];
	for(var s = 0; s < stop.length; s++)
	{
		if(typeof theWebUI[stop[s]] !== "function")
			continue;
		theWebUI[stop[s]] = (function(name, was)
		{
			return function()
			{
				draculaListRequestEnded();
				return was.apply(this, arguments);
			};
		})(stop[s], theWebUI[stop[s]]);
	}

	/* The limits are no part of the list response. The core asks for them
	   separately from inside `addTorrents` (`js/webui.js:1702`) and folds the
	   answer into `theWebUI.total` here (`js/webui.js:1777`), painting nothing —
	   so they land just after the pass that asked for them, and a block drawn
	   from that pass stands empty until the next one, a poll away.

	   This is also where a limit set by hand arrives: `setdlrate` and `setulrate`
	   answer into it (`js/webui.js:2367`, `:2372`). */
	if(typeof theWebUI.addTotal === "function")
	{
		var addTotal = theWebUI.addTotal;
		theWebUI.addTotal = function()
		{
			var result = addTotal.apply(this, arguments);
			draculaShowMobileLimits();
			return result;
		};
	}

	if(typeof mobile.showSettings === "function")
	{
		var settings = mobile.showSettings;
		mobile.showSettings = function()
		{
			draculaColourMobileDiskMeter();
			return settings.apply(this, arguments);
		};
	}

	/* Which of the filter page's `bi-tag` rows is the one for torrents nobody
	   labelled. The plugin gives that glyph to two different rows — always to
	   that one, and to every label when tracklabels is absent and there are no
	   pictures to serve (`plugins/mobile/init.js:572`) — and the only thing that
	   tells them apart is the filter value, which is the empty string for it and
	   a name for the others. Nothing in the markup carries that, so it is marked
	   here where the value is still in hand. */
	if(typeof mobile.makeFilterItem === "function")
	{
		var makeItem = mobile.makeFilterItem;
		mobile.makeFilterItem = function(text, count, isSelected, type, value)
		{
			var item = makeItem.apply(this, arguments);
			if(type === "label" && value === "")
				item.find("i.bi-tag").addClass("dracula-no-label");
			return item;
		};
	}

	/* The filter page is where the tracker icons are, and it is rebuilt whole
	   every time it opens and again whenever the torrent set changes
	   (`plugins/mobile/init.js:2035`). `#CatList` is what drives the sweep on the
	   desktop and does not exist here, so this is its trigger. */
	if(typeof mobile.renderFilterPage === "function")
	{
		var render = mobile.renderFilterPage;
		mobile.renderFilterPage = function()
		{
			var result = render.apply(this, arguments);
			draculaMarkFilterIcons();
			return result;
		};
	}

	/* Refresh reloads the page — `window.location.reload(true)`
	   (`plugins/mobile/init.js:867`) — which throws away the whole interface to
	   re-fetch a list, and costs the 415KB of `getplugins.php` on the way back.
	   `update(true)` asks for the same list and rebuilds every row from it,
	   which is what the control says it does; the tracker classes come with it,
	   the argument being what forces the full pass.

	   `resetInterval` is the other half and is what the control is actually for.
	   The plugin runs no timer of its own — its own comment at
	   `plugins/mobile/init.js:2589` says the periodic refreshes arrive through
	   the core's hook — and the core's chain answers an error by waiting
	   `webui.retry_on_error` seconds, 120 by default (`js/webui.js:1597`). A
	   fetch alone repaints the list and leaves the chain sitting out those two
	   minutes; this puts it back on its own interval. */
	if(typeof mobile.refresh === "function" && typeof mobile.update === "function")
	{
		mobile.refresh = function()
		{
			draculaListRequestStarted(true);
			this.update(true);
			if(typeof theWebUI.resetInterval === "function")
				theWebUI.resetInterval();
		};
	}
}

/* The mark that lets --font-mono name the bundled face, put on <html> once the
   page is known to be one the theme still paints in full.

   A browser fetches a face when a rendered element resolves to it, and on a
   phone one does: style.css carries both the JetBrains Mono faces and the log
   panel's `font-family`, and both are live until the mobile plugin disables the
   theme (`plugins/mobile/init.js:2138`). The panel is the only element reading
   --font-mono that is rendered by then — the console, the chunk map and the URL
   textarea sit in dialogs nothing has opened — and it is enough to pull 31,432
   bytes of a latin subset that interface never draws.

   Nothing readable at the moment this file runs says which interface is coming.
   `jQuery.browser.mobile` is the mobile plugin's own
   (`plugins/mobile/init.js:2666`) and does not exist yet, and every plugin is
   evaluated inside one synchronous pass over `getplugins.php`, which no
   observer or microtask of this file interleaves with. A timer runs after that
   pass, where the answer is settled.

   So the generic stack is what a page gets by default and this adds the face,
   which costs the desktop only the gap between the timer and a fetch it makes
   either way. */
function draculaOfferBundledMono()
{
	setTimeout(function()
	{
		if(!draculaThemeSwitchedOff())
			document.documentElement.classList.add("dracula-desktop");
	}, 0);
}

draculaOfferBundledMono();

/* The mobile plugin disables the theme plugin on its way in
   (`plugins/mobile/init.js:2138`), and that strips every sheet the theme has put
   on the page. `plugins.css` is the one the mobile interface still needs, and
   upstream puts it back only once `theWebUI.config` runs — measured, gone at
   633ms and back at 1076ms, with the interface drawn and on screen in
   Bootstrap's colours for the 443ms between.

   It goes back the moment it goes, by re-appending the node rather than asking
   for a fresh one. Once only: a sheet removed a second time is a theme being
   switched off for good, and answering that would loop.

   `injectCSS` (`js/plugins.js:24`) appends a new <link> on every call and never
   looks for one already there, which is what puts this sheet on the page twice.
   Holding it at a single copy is what keeps the restore from becoming a third,
   and the copy kept is the newest, so which sheet wins does not change — it
   still sits after every plugin sheet.

   An older copy goes only once the newer one has applied. A <link> styles
   nothing until its sheet arrives, so dropping the working copy at the moment
   the replacement is appended leaves the page with none of these rules for as
   long as the fetch takes, and the mobile interface pays for that gap in a
   webfont: `plugins/mobile/mobile.css:9` puts the icon family on `.bi:before`,
   and with the theme's own rule missing the browser fetches 134,044 bytes for
   metrics behind a glyph it never draws. `sheet` is non-null exactly when a
   stylesheet is in force. */
function draculaHoldPluginsCss()
{
	var head = document.head;
	if(!head || !head.children || typeof MutationObserver !== "function")
		return;

	var kept = null;
	var restored = false;
	var ours = /\/themes\/[^/]+\/plugins\.css(\?|$)/;

	function sync()
	{
		var links = [];
		for(var i = 0; i < head.children.length; i++)
		{
			var el = head.children[i];
			if(el.tagName === "LINK" && ours.test(el.getAttribute("href") || ""))
				links.push(el);
		}

		if(!links.length)
		{
			if(kept && !restored)
			{
				restored = true;
				head.appendChild(kept);
			}
			return;
		}

		var newest = links[links.length - 1];
		if(links.length > 1 && !newest.sheet)
		{
			newest.addEventListener("load", sync, { once: true });
			newest.addEventListener("error", sync, { once: true });
			return;
		}

		kept = newest;
		for(var j = 0; j < links.length - 1; j++)
			links[j].parentNode.removeChild(links[j]);
	}

	sync();
	new MutationObserver(sync).observe(head, { childList: true });
}

draculaHoldPluginsCss();

if(typeof theWebUI !== "undefined" && typeof theWebUI.config === "function")
{
	plugin.draculaConfig = theWebUI.config;
	theWebUI.config = function()
	{
		draculaDarkByDefaultOnMobile();
		draculaWatchMobileFiles();
		draculaMarkMobileLines();
		draculaKeepPanelsOpen();
		var tables = this.tables || {};
		for(var name in tables)
		{
			if(!tables[name] || !tables[name].columns)
				continue;
			draculaDeclaredWidths[name] = tables[name].columns.map(function(col)
			{
				return col.width;
			});
		}
		// The list may not exist yet when the wrapper is installed, and the far
		// side of upstream's config is the other chance to reach it.
		var result = plugin.draculaConfig.apply(this, arguments);
		draculaKeepPanelsOpen();
		return result;
	};
}

/* A saved width is no proof that anyone chose it. ruTorrent writes the whole
   profile back whenever a column is dragged or moved (`webui.js:393`, `:1024`),
   so what sits in it for an untouched column is upstream's own declaration,
   persisted.
   A width that differs from the declaration was chosen by hand and outranks
   anything here; one equal to it was never touched.

   A declaration that cannot be read is treated as a choice. Better to leave a
   column alone than to overwrite a decision that cannot be seen. */
function draculaUserSizedColumn(saved, index, declared)
{
	if(!saved || index >= saved.length || saved[index] <= 4)
		return false;
	var upstream = parseInt(declared, 10);
	return !(upstream > 0 && saved[index] === upstream);
}

function draculaPatchColumns(styles, aName)
{
	var patch = draculaColumns[aName];
	if(!patch || !styles)
		return;
	var saved = theWebUI.settings["webui." + aName + ".colwidth"];
	var declared = draculaDeclaredWidths[aName];
	for(var i = 0; i < styles.length; i++)
	{
		var col = patch[styles[i].id];
		if(!col)
			continue;
		if(col.text)
			styles[i].text = col.text;
		if(col.align)
			styles[i].align = col.align;
		if(!col.width ||
			draculaUserSizedColumn(saved, i, declared && declared[i]))
			continue;
		styles[i].width = col.width;
		// `config()` runs after this and lays the profile back over the
		// definitions, so the profile is the only place a width survives being
		// set here. One column at a time, and only one that nobody had sized.
		if(saved && i < saved.length)
			saved[i] = parseInt(col.width, 10);
	}
}

plugin.draculaTableCreate = dxSTable.prototype.create;
dxSTable.prototype.create = function(ele, styles, aName)
{
	// Column widths and the progress gradient are the theme's; with the theme
	// switched off they would be applied to a table nobody painted.
	if(draculaThemeSwitchedOff())
		return plugin.draculaTableCreate.call(this, ele, styles, aName);

	draculaPatchColumns(styles, aName);
	plugin.draculaTableCreate.call(this, ele, styles, aName);

	// The torrent progress bar's two ends, from palette.css — the reasoning and
	// the measurements are at their definitions. Upstream's own pair stands if
	// they cannot be read, which is the state of a page without the theme's
	// sheets rather than a state worth painting over.
	this.prgStartColor = draculaPaletteBackground(
		"--dracula-progress-start",
		this.prgStartColor.channels
	);
	this.prgEndColor = draculaPaletteBackground(
		"--dracula-progress-end",
		this.prgEndColor.channels
	);

	draculaRepaintProgress(ele, this);
}

/* What a torrent row's tooltip says. The name alone unless the daemon has
   something to report, and then the report under it — a `title` renders a
   newline, so the two do not run together. */
function draculaTorrentNote(name, msg)
{
	var text = typeof name === "string" ? name : "";
	var note = typeof msg === "string" ? msg.trim() : "";
	return note ? text + "\n" + note : text;
}

/* Upstream sets a row's tooltip once, to the first column: `createRow` writes
   `title: cols[0]` (`stable.js:953`) and `setRowById` never revisits it, so a
   torrent that runs into trouble after its row exists keeps a tooltip that says
   only its name.

   The wrap goes on `setRowById` rather than `createRow` because that is the one
   call both paths run through — a new row and a row already on the page — and
   the message is on the torrent object it is handed.

   Written only when it changes. `setAttr` (`stable.js:1555`) marks the row dirty
   for every attribute it is given, so passing the title every pass would rewrite
   every row on every poll to say what it already said.

   The torrent list only: `createRow` is what every dxSTable builds its rows
   with, and a tracker or peer row has no torrent behind it. */
// The Files tab labels every entry `Icon_File` or `Icon_Dir` (`common.js:1049`,
// `:1059`, `:1066`), so the kind of a file reaches the page nowhere: the name is
// a bare text node beside the icon, which no selector can read. The extension is
// the only signal there is, and this turns it into a class.
//
// Extensions are grouped by what the eye is looking for in a torrent, not by
// media type: an archive and a disc image are both containers, and telling them
// apart matters more than telling avi from mkv. Anything unlisted keeps
// upstream's plain document.
var DRACULA_FILE_KINDS = [
	["Archive", /^(zip|rar|7z|tar|gz|bz2|xz|zst|tgz)$/],
	["Disc", /^(iso|img|cue|bin|mdf|nrg|ccd)$/],
	["Video", /^(mkv|mp4|avi|webm|mov|wmv|flv|m2ts|mpg|mpeg|m4v)$/],
	["Audio", /^(flac|mp3|ogg|wav|m4a|aac|opus|wma|ape|shn|alac)$/],
	["Image", /^(jpg|jpeg|png|gif|webp|bmp|svg|tif|tiff|avif)$/],
	["Doc", /^(txt|nfo|md|log|ffp|md5|sfv|pdf|epub|srt|ass|sub|xml|json)$/]
];

// Which kind a name belongs to, or null for one the table has no answer for.
// A name with no extension, or ending in a dot, is not a kind — it is a name.
function draculaFileKind(name)
{
	if(typeof name !== "string")
		return null;
	var dot = name.lastIndexOf(".");
	if(dot <= 0 || dot === name.length - 1)
		return null;
	var ext = name.slice(dot + 1).toLowerCase();

	for(var i = 0; i < DRACULA_FILE_KINDS.length; i++)
		if(DRACULA_FILE_KINDS[i][1].test(ext))
			return DRACULA_FILE_KINDS[i][0];
	return null;
}

// Returns the icon string to pass on: upstream's class, plus one of ours when
// the name says what the entry is. Both are kept so a kind with no rule still
// paints — jQuery's `addClass` (`stable.js:942`) takes the pair as written.
function draculaFileIconClass(name, icon)
{
	if(typeof name !== "string" || typeof icon !== "string")
		return icon;

	// `..` is the way back up, not a directory to open, and reads as navigation.
	if(icon === "Icon_Dir")
		return name === ".." ? icon + " Icon_File_Up" : icon;

	if(icon !== "Icon_File")
		return icon;

	var kind = draculaFileKind(name);
	return kind ? icon + " Icon_File_" + kind : icon;
}

// `clearRows` empties `rowdata`, `rowSel` and `rowIDs` but leaves `stSel`
// standing (`stable.js:1034`), and `stSel[0]` is the anchor every Shift range is
// measured from (`stable.js:847`). A table whose rows are replaced therefore
// keeps an anchor naming a row that is gone, and the next Shift step selects
// from its target to the end of the table instead of back to the anchor.
//
// The Files tab replaces its rows on every directory change (`webui.js:55`) and
// on the tree/list switch (`webui.js:1488`), so both the arrows here and a plain
// Shift-click land on it. Dropping the anchor with the rows it named is what
// upstream's own `clearSelection` does (`stable.js:1147`).
plugin.draculaClearRows = dxSTable.prototype.clearRows;
dxSTable.prototype.clearRows = function()
{
	this.stSel = [];
	return plugin.draculaClearRows.apply(this, arguments);
};

plugin.draculaSetRowById = dxSTable.prototype.setRowById;
dxSTable.prototype.setRowById = function(ids, sId, icon, attr)
{
	var tables = window.theWebUI && typeof theWebUI.getTable === "function"
		? theWebUI : null;

	// The flat view of the Files tab passes no icon: `webui.js:1352` reads
	// `file.icon`, and only the tree builder ever writes one (`common.js:1059`).
	// Upstream's own class is supplied here so the kind has something to sit
	// beside, and so a file reads the same whichever view is on.
	if(tables && this === tables.getTable("fls") && !icon &&
		ids && typeof ids.name === "string")
		icon = "Icon_File";

	if(ids)
		icon = draculaFileIconClass(ids.name, icon);

	var list = tables ? tables.getTable("trt") : null;
	if(this === list && ids && typeof ids.name === "string")
	{
		var want = draculaTorrentNote(ids.name, ids.msg);
		var row = this.rowdata ? this.rowdata[sId] : null;
		var have = row && row.attr ? row.attr.title : undefined;
		if(want !== have)
		{
			attr = attr || {};
			attr.title = want;
		}
	}
	return plugin.draculaSetRowById.call(this, ids, sId, icon, attr);
};
