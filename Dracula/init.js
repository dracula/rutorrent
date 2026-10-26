/*
 * Dracula Theme for ruTorrent — behaviour
 * Version 0.3.2 · built against ruTorrent 5.3   # x-release-please-version
 * https://draculatheme.com
 *
 * ruTorrent inlines this file into its PHP response, so it cannot go stale, and
 * runs it against the WebUI's globals, declared below for the linter.
 */

/* global plugin, thePlugins, theWebUI, theUILang, theConverter, theContextMenu, theDialogManager, getSelection */
/* global dStatus, askYesNo, RGBackground, dxSTable, rGraph, ALIGN_LEFT */
/* global document, setTimeout, clearTimeout, requestAnimationFrame, MutationObserver, MouseEvent, Intl, $, window, getComputedStyle, Image, console */

// Compared against the :root stamp in each sheet at startup.
var DRACULA_VERSION = "0.3.2"; // x-release-please-version
// The oldest ruTorrent the theme supports.
var DRACULA_RUTORRENT_MIN = "5.0.0";

// Compared a component at a time: "5.10" sorts below "5.9" as text.
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

// getPropertyValue returns the token, quotes included.
function draculaStampedVersion(name)
{
	return getComputedStyle(document.documentElement)
		.getPropertyValue(name).trim().replace(/^["']|["']$/g, "");
}

// ruTorrent serves the sheets under its own version, so a theme update keeps
// their URL, while this file is inlined and cannot go stale. `enabled` is the
// flag the mobile plugin clears through `disable()`.
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

	/* The mobile plugin disables the theme plugin and this file keeps running: a
	   disabled theme is not a stale one. */
	if(stale.length && !draculaThemeSwitchedOff())
	{
		var msg = "Dracula theme " + DRACULA_VERSION + ": stylesheet mismatch — " +
			stale.join(", ") + ". Reload with Ctrl+Shift+R; if that does not " +
			"fix it, the theme files are from different releases.";
		// noty falls back to the Log tab when `$.noty` is absent.
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

/* A pinch scales the visual viewport and leaves devicePixelRatio alone, so a
   canvas has to match both. */
function draculaVisualScale()
{
	var viewport = window.visualViewport;
	return (viewport && viewport.scale) || 1;
}

/* Budgeted by area, so a small meter can scale far; the side limit keeps every
   canvas allocatable. */
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

/* flot's Canvas reads devicePixelRatio once, and its resize() skips when the
   CSS size is unchanged, so a zoom leaves the buffer at the old ratio. flot
   hands the class to plugin init() as `classes.Canvas`. Registered at module
   scope, so the plots the plugins create still get it. */
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
					// The original resizes only when these differ.
					this.width = 0;
					this.height = 0;
				}

				originalResize.call(this, width, height);
			};
		}
	});
}

/* flot keeps the plot on its placeholder. setupGrid and draw must follow
   resize(). */
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

/* A density change fires no resize event; a media query on the ratio does,
   re-armed each time. Module scope: a collected MediaQueryList stops
   delivering events. */
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

/* A pinch never changes devicePixelRatio; visualViewport fires resize. */
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

/* === Reading the palette ===
   Each color is resolved by applying the name to an element: the declared
   text of a `color-mix()` is its own source, which upstream's parser cannot
   read. */

/* The `transparent` fallback tells a missing palette from a real color. */
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

	// `color(srgb ...)` carries fractions; `rgb()` carries bytes.
	var scale = value.indexOf("color(") === 0 ? 255 : 1;
	return [
		Math.round(parseFloat(parts[0]) * scale),
		Math.round(parseFloat(parts[1]) * scale),
		Math.round(parseFloat(parts[2]) * scale)
	];
}

function draculaPaletteColor(name, fallback)
{
	var channels = draculaPaletteChannels(name);
	return channels ? "rgb(" + channels.join(", ") + ")" : fallback;
}

/* Read on first use: palette.css arrives through an @import, after
   `dxSTable.prototype.create` runs. Only a resolved answer is cached. */
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

/* Recolors the bars drawn before the palette arrived: upstream rewrites a
   progress cell only when its value changes. The container is the element
   `create` was handed; `table.dCont` is a jQuery object from 5.2.0. */
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

/* The plugin interpolates between prgStartColor and prgEndColor and writes
   the result inline. By allDone the meter has drawn itself once in upstream's
   colors, so it is repainted. */
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

/* flot sizes the CPU canvas before the theme's sheet sets the holder's
   height; its own resize() rebuilds it. Retried while the sheet is in flight. */
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
   ruTorrent rewrites these titles as it refreshes, so they are re-applied. */

function draculaDiskTooltip(pane)
{
	if(!pane)
		return;
	var orig = pane.getAttribute("title") || "";
	if(orig.indexOf("Disk Space") === 0)
		return;
	// diskspace builds this from "%USED%/%TOTAL% (%FREE% free)". Matched on
	// structure, since the words are translated.
	var dp = orig.match(/^\s*([^/]+?)\s*\/\s*([^(]+?)\s*(?:\(([^)]*)\))?\s*$/);
	if(!dp)
		return;
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

/* A daemon that reports no count gets -1, and upstream hides the element and
   leaves its old text, so the inline `display` is the signal. */
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
	// check_port: 0 checking, 1 closed, 2 open. Tested for pstatus2, because
	// "not pstatus1" also holds while the check runs.
	var status = pane.querySelector(".pstatus2") ? "Open"
		: pane.querySelector(".pstatus1") ? "Closed"
		: "Checking...";
	pane.title = "Port Status: " + status;
}

/* === Status bar behavior === */

// RegExp rather than a literal: the complexity analyzer misparses the
// function below with the literal.
var draculaWhitespace = new RegExp("\\s+");

// Re-applied on updates: the core rewrites the values.
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

/* These cells carry their reading in `title`, which needs a hover, so a tap
   opens it. The speed cells are left out: a tap there opens the throttle menu. */
var draculaPopoverCells = ["meter-disk-pane", "meter-cpu-pane", "st_fd", "port-pane"];

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

// Placed after it is filled and shown: a hidden element measures zero.
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

function draculaPlaceStatusPopover()
{
	var node = document.getElementById("dracula-status-popover");
	if(!node || node.hidden)
		return;
	var cell = document.getElementById(node.getAttribute("data-dracula-cell"));
	if(cell && cell.getAttribute("title"))
		draculaShowStatusPopover(cell);
	else
		draculaHideStatusPopover();
}

/* A rotation reports the size it is leaving; the second pass catches the
   settled layout. */
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

// Under iOS's own press-and-hold, so the panel is up before a selection
// starts.
var DRACULA_HOLD = 350;

function draculaStatusCellPopovers()
{
	// From ruTorrent 5.3.17 upstream's `theStatusTip` answers the same tap.
	if(typeof theStatusTip !== "undefined")
		return;

	// The click after a touch would toggle the panel a second time. The stamp
	// expires, so a touch with no click cannot block the mouse.
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
			// Without capture, a finger that slides off delivers pointerup elsewhere.
			if(cell.setPointerCapture)
				cell.setPointerCapture(e.pointerId);
			draculaShowStatusPopover(cell);
		});

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
			// Else the document listener below closes the panel in the same click.
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
	window.addEventListener("resize", draculaPlaceStatusPopover);
	window.addEventListener("orientationchange", draculaPlaceStatusPopoverSettled);
}

/* Coarse pointers only: a desktop scrollbar is already drawn. The track is a
   sibling of `#tabbar`, the scroller, so it stays put. */
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
		var width = Math.max(16, room * room / content);
		track.style.setProperty("--dracula-tab-thumb-width", width + "px");
		track.style.setProperty("--dracula-tab-thumb-left",
			(bar.scrollLeft / (content - room)) * (room - width) + "px");
	}

	bar.addEventListener("scroll", update);
	window.addEventListener("resize", update);
	// Plugins append tabs after this file runs.
	if(window.MutationObserver)
		new MutationObserver(update).observe(bar, { childList: true });
	update();
}

// Upstream binds the speed limit menu to right-click alone; left-click opens
// it too.
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

// Keyboard access to the context menus. Upstream binds `focus -> blur()` to
// every command and rebuilds the menu on each open, so the hook is the
// opening. Each level is walked separately, and submenus open through
// upstream's `openSubmenu` and `closeSubmenu`, which read only
// `currentTarget`.
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
		// A submenu sits inside its parent, so each level checks its own.
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
				// A click closes the menu through upstream's document mouseup; a keypress
				// sends none.
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
		draculaMenuOpener = (document.activeElement && document.activeElement !== document.body)
			? document.activeElement : null;
		var result = show.apply(this, arguments);
		// The menu is animated open, so the commands are measured a tick later.
		setTimeout(draculaPrepareContextMenu, 0);
		return result;
	};
}

// Dialogs. `theDialogManager.setModalState` raises a backdrop and never moves
// the focus, so Tab walks out into the page behind it. Escape is upstream's.
var draculaDialogStack = [];

// `offsetParent` is null for fixed elements, which dialogs are.
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
		dlg.tabIndex = -1;
		dlg.focus({ preventScroll: true });
		return false;
	}
	target.focus({ preventScroll: true });
	return true;
}

// Only a modal window holds the focus; a modeless one leaves the page usable
// on purpose.
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
	if(document.activeElement === edge || !dlg.contains(document.activeElement))
	{
		ev.preventDefault();
		wrap.focus({ preventScroll: true });
	}
}

// Reading `selectionStart` on a number or an email input throws in Chrome.
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

// A field gives up an arrow at the edge of its text. A list and a spinner do
// not change value on the way past. A radio group and a slider keep all four.
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

// Runs on the dialog with the focus, so a modeless window is walked too.
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

	var at = items.indexOf(document.activeElement);
	if(at < 0)
	{
		ev.preventDefault();
		(step > 0 ? items[0] : items[items.length - 1]).focus({ preventScroll: true });
		return;
	}

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

// `tskConsole` changes its header while it is up, so the name is referenced
// by id.
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

		// Upstream's own test for a modal window; `isModalState` answers for any
		// window that is up.
		var modal = !!$(dlg).data("modal");
		// Upstream blurs every `.Button` in a window it builds, and the path picker
		// blurs itself.
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

		// `tskConsole` swaps its buttons as a task runs, so the look is repeated for
		// a few frames.
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
			// Only when the focus is still in the closing window, or nowhere.
			if(entry.opener && document.contains(entry.opener) &&
				(entry.dlg.contains(document.activeElement) ||
					document.activeElement === document.body))
				entry.opener.focus({ preventScroll: true });
			break;
		}
		return result;
	};

	// Captured, so the window has the keys before a region's own keydown.
	document.addEventListener("keydown", draculaDialogKeys, true);

	// Upstream turns Enter anywhere in a window into a click on OK, except in a
	// textarea. Caught on the way down for lists and buttons; Enter in a field
	// still submits.
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

	// A control that hides itself takes the focus to `body`. Its place is kept,
	// measured on the way in, and the focus lands on what now stands there.
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

var draculaOpenMenuButton = null;

function draculaMenuIsOpen()
{
	return !!(window.theContextMenu && theContextMenu.obj && theContextMenu.obj.is(":visible"));
}

// Upstream's document mouseup skips `top-menu-item`, so a second click
// rebuilds the menu instead of closing it. Captured, to head off the
// element's own handler.
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

	// From 5.1.0 the plugins button is a Bootstrap dropdown, which toggles
	// itself.
	var plugins = document.getElementById("mnu_plugins");
	if(plugins && !plugins.hasAttribute("data-bs-toggle"))
		draculaMenuButtonToggles(plugins);
}

// The F1 help screen, rebuilt as two groups. The cells are moved, not
// recreated, so the linked actions keep their handlers.

// Inter's U+2190-2193 differ in weight; U+2B05, U+2B06, U+27A1 and U+2B07
// match. U+FE0E pins text presentation, and the escapes keep it visible.
var draculaArrow = {
	left:  "\u2B05\uFE0E",
	up:    "\u2B06\uFE0E",
	right: "\u27A1\uFE0E",
	down:  "\u2B07\uFE0E"
};

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

// For six of upstream's cells the element inside is the `<a>` carrying the
// onclick.
function draculaHelpCell(cell)
{
	if(cell.firstElementChild)
		return cell.firstElementChild;
	var span = document.createElement("span");
	span.textContent = cell.textContent.trim();
	return span;
}

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

	// Del moves after Ctrl-Z and is reworded, matched on its key text.
	// `theUILang` is left alone.
	for(var d = 0; d < commands.length; d++)
	{
		if(commands[d][0].textContent.trim() !== "Del")
			continue;
		commands[d][1].textContent = "Delete the selected torrents";
		commands.push(commands.splice(d, 1)[0]);
		break;
	}

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

	var actions = draculaHelpGroup("Commands", commands);
	var movement = draculaHelpGroup("Navigation", moves);
	row.textContent = "";
	row.appendChild(actions);
	row.appendChild(movement);
}

// Upstream places `span.htkey` and never fills it. Matched on text, since
// plugins insert commands. `dxSTable.keyEvents` binds only Delete, Ctrl-A and
// Ctrl-Z.
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

// Real `div.TB_Separator` elements where the three zones need them;
// style.css hides upstream's strays.
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

// Splitting on whitespace works outside the Latin scripts too.
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
	return kept.length ? kept.join(" ") : text;
}

/* Plugin buttons carry the ellipsis in the label, core buttons in the
   tooltip only. Runs before the noun is dropped. */
function draculaTrimEllipsis(text)
{
	var trimmed = String(text).replace(/\s*[.…]+$/, "");
	return trimmed || text;
}

/* Below 768px Add, Create and Remove share a row, so their shared noun is
   dropped. It is derived from what the Add and Create labels share; where
   they share nothing, the label clips. */
function draculaShortenMenuLabels()
{
	var lang = window.theUILang || {};
	var words = draculaSharedWords(lang.mnu_add, lang.mnu_create);
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

// Local search filters live; an engine searches on Enter. The source is named
// in a badge, the placeholder and the tooltip.
function draculaSearchSource()
{
	var engines = window.theSearchEngines;
	if(!engines)
		return null;
	var current = engines.current;
	var lang = window.theUILang || {};

	// getEngName returns a raw -1 for local search.
	if(current === -1 || current === "-1")
		return { name: lang.innerSearch || "Local Torrents", icon: "var(--icon-list)", local: true };

	var name = (typeof engines.getEngName === "function")
		? engines.getEngName(current) : current;
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

	// Attributes, not text nodes: `#t` is observed for childList changes.
	field.placeholder = source.local
		? "Filter the list"
		: "Search " + source.name;
	button.title = (window.theUILang && theUILang.mnu_search ? theUILang.mnu_search : "Search")
		+ ": " + source.name;
	button.setAttribute("aria-haspopup", "menu");
}

// extsearch writes the selection in four places, so an accessor catches
// every write.
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
		// A future ruTorrent could make the property non-configurable.
	}
	draculaSyncSearchSource();
}

// The speed cells open their throttle menu on `contextmenu` with pointer
// coordinates; the cell's box supplies them.
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

// ruTorrent blurs the toolbar buttons and plugin tabs on focus: an inline
// `onfocus` in index.html, and a jQuery handler from `addButtonToToolbar` and
// `attachPageToTabs`. Both are undone.
var draculaFocusThieves = "#t a.nav-link, #tabbar li.nav-item a";

function draculaUnblur(nodes)
{
	nodes.off("focus").each(function()
	{
		// Both the attribute and the compiled property.
		this.removeAttribute("onfocus");
		this.onfocus = null;
	});
}

function draculaRestoreKeyboardFocus()
{
	draculaUnblur($(draculaFocusThieves));
}

// Five regions: Tab moves between them and the arrows within, through a
// roving tabindex. A text field keeps Left and Right and moves on Up and Down;
// a select the reverse.

// Arrow order follows the screen, not the markup: the toolbar's zones are
// reordered by `order`. Bucketing by row keeps the comparator transitive.
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

// Keeps whichever control holds the stop, so a plugin's new button cannot
// move it.
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
	// Every match is pinned, or a disabled control becomes a second stop once it
	// is enabled.
	Array.prototype.forEach.call(container.querySelectorAll(itemSelector), function(el)
	{
		el.tabIndex = (el === current) ? 0 : -1;
	});
	return items;
}

// options.preferred(items): which control holds the stop first.
// options.activate(el, ev): what Enter and Space do; without it a link's own
// click runs.
function draculaRovingGroup(container, itemSelector, options)
{
	if(!container || container.getAttribute("data-dracula-roving"))
		return;
	container.setAttribute("data-dracula-roving", "1");
	options = options || {};
	var preferred = options.preferred;
	var activate = options.activate;

	draculaRovingSync(container, itemSelector, preferred);

	container.addEventListener("focusin", function(ev)
	{
		var items = draculaRovingItems(container, itemSelector);
		if(items.indexOf(ev.target) < 0)
			return;
		items.forEach(function(el){ el.tabIndex = (el === ev.target) ? 0 : -1; });
	});

	container.addEventListener("keydown", function(ev)
	{
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

		// A field hands the arrows back at the edge of its text.
		var atStart = true, atEnd = true;
		if(typing)
		{
			var value = String(ev.target.value || "");
			var from = ev.target.selectionStart, to = ev.target.selectionEnd;
			var collapsed = (from === to);
			atStart = collapsed && from === 0;
			atEnd = collapsed && to === value.length;
		}
		// null: the key is not handled here. A negative index has wrapped past the
		// start.
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
				// A link does not activate on Space. Links only: Enter in the search field
				// has to reach upstream's handler.
				if(tag !== "A")
					return;
				ev.preventDefault();
				var link = ev.target;
				link.click();
				// Upstream blurs the detail tabs on click, which drops keyboard focus to the
				// body. Restored unless something else took it.
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

// Upstream pairs `li#tab_gcont` with `div#gcont`, so aria-controls drops the
// prefix. aria-selected mirrors upstream's `selected` class.
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

// The sidebar's `panel-label`s have no focusable node, so the region is built
// here. Selection runs on mousedown, not click, so Enter and Space dispatch
// mousedown with the modifiers.
function draculaLabelActivate(label, ev)
{
	// Ctrl goes as `metaKey`: on macOS upstream holds a ctrl press for the
	// mouseup that tells a right click, and a key sends none. The label reads
	// either key as the same flag.
	label.dispatchEvent(new MouseEvent("mousedown", {
		bubbles: true,
		button: 0,
		metaKey: ev.ctrlKey || ev.metaKey,
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

// The torrent and file lists are virtualized, so the container holds the tab
// stop and aria-activedescendant names the row. Selection goes through
// upstream's `selectRow`, which reads only the row's id and carries the range
// and toggle model.
function draculaTable(key)
{
	return (window.theWebUI && theWebUI.tables && theWebUI.tables[key])
		? theWebUI.tables[key].obj : null;
}

// Opens through upstream's path with `which: 3`, as a right click does, so
// `selectRow` keeps a multi-row selection. `theContextMenu.show` keeps the
// menu inside the window.
function draculaRowMenu(container, table, id)
{
	if(!table || !id)
		return;
	var anchor = document.getElementById(id) || container;
	var rect = anchor.getBoundingClientRect();
	var x = Math.round(rect.left + 24);
	var y = Math.round(rect.bottom);

	// `flsSelect` calls `theContextMenu.show` bare, which falls back to
	// `theContextMenu.mouse`; that is set for the call and put back at once.
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

// Steps land on column edges summed from the heading cells; `colgroup` holds
// what was asked for.
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

// The file tree never overflows, so the sideways keys step in and out
// through upstream's `ondblclick`, which declines a file. The way up is found
// by `..` in the name column, not by its id.
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
		// `link` is a string on directory rows; `getAttr` answers null for a row with
		// no attributes.
		if(id && typeof table.getAttr(id, "link") === "string" &&
			table.getValueById(id, "name") !== "..")
			target = id;
	}
	if(target === null)
		return false;

	table.ondblclick({ id: target });
	return true;
}

// A file must not reach `ondblclick`: the data plugin downloads on it.
function draculaFileOpen(host, table, id)
{
	if(typeof table.getAttr(id, "link") === "string" &&
		typeof table.ondblclick === "function")
		table.ondblclick({ id: id });
	else
		draculaRowMenu(host, table, id);
}

// Rows are rebuilt on scroll and on updates, so the roles are re-applied.
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

// The hosts do not exist when a region is built.
var draculaTableHosts = [];

function draculaSyncTableHosts()
{
	draculaTableHosts.forEach(function(claim) { claim(); });
}

// The scroll body is the tab stop: Chrome makes a scroll container with no
// focusable child a stop by itself, and the container keeps its own role.
// Options: `label` names the region; `sideways(direction, host, table)`
// answers whether it replaced the rows; `open` is what Enter does, by default
// `ondblclick`.
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

	// One level deep catches the body arriving or being replaced, and not the
	// row redraws.
	new MutationObserver(host).observe(container, { childList: true });

	// The remembered row, which is not the selection.
	var focused = null;

	// Upstream's `TR_HEIGHT` is a content height, two pixels short of a padded
	// row, so the row is asked where it is.
	var bringIntoView = function(scroller, table, index)
	{
		var id = table.rowIDs[index];
		if(!id)
			return;

		var nudge = function()
		{
			var row = document.getElementById(id);
			if(!row)
				return false;
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

		// The renderer rebuilds rows on its own clock, so a few frames settle the
		// scroll.
		var settle = function(left)
		{
			requestAnimationFrame(function()
			{
				if(!nudge() && left > 1)
					settle(left - 1);
			});
		};
		settle(4);

		// A jump of more than three rows is redrawn after half a second, so Home and
		// End look once more after that.
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

	// Upstream arms Delete and Ctrl-A only after a mousedown on the table; focus
	// arms them too. A mousedown also moves the cursor, since upstream selects on
	// mousedown.
	container.addEventListener("mousedown", function(ev)
	{
		var scroller = host();
		var row = ev.target && ev.target.closest ? ev.target.closest("tr[id]") : null;
		if(!scroller || !row)
			return;
		focused = row.id;
		scroller.setAttribute("aria-activedescendant", row.id);
	});

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
		// A net for a future case that forgets to assign.
		// eslint-disable-next-line no-useless-assignment
		var target = null;

		switch(ev.key)
		{
			case "ArrowDown": target = (index < 0) ? 0 : Math.min(index + 1, ids.length - 1); break;
			case "ArrowUp":   target = (index < 0) ? 0 : Math.max(index - 1, 0); break;
			case "ArrowRight":
			case "ArrowLeft":
				ev.preventDefault();
				// A rebuilt table leaves the remembered row naming nothing.
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
				// Enter opens the row with or without Ctrl, so Ctrl-Enter takes the menu
				// here.
				if(ev.ctrlKey || ev.metaKey)
					draculaRowMenu(scroller, table, ids[index]);
				else
					open(scroller, table, ids[index]);
				if(table.rowIDs.indexOf(ids[index]) < 0)
					forget(scroller);
				return;
			// Upstream cancels `contextmenu` document-wide, so both keys are taken on
			// keydown.
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

// Upstream reveals `#ind` once a request has waited 500ms. The class follows
// that and comes off at the end of a turn, so the web never snaps back. Not
// driven from `ajaxStart`: ruTorrent polls every few seconds.
function draculaWatchLoadingIndicator()
{
	var ind = document.getElementById("ind");
	if(!ind)
		return;

	var stopWhenTurnEnds = false;

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
			stopWhenTurnEnds = false;
			ind.classList.add("dracula-loading");
			setTitle(true);
		}
		else if(ind.classList.contains("dracula-loading"))
			stopWhenTurnEnds = true;
	}).observe(ind, { attributes: true, attributeFilter: ["style"] });
}

// index.html declares the tab icon in thirteen links; they are replaced with
// one inline SVG drawn from the palette. The letterform is traced from
// upstream's favicon.
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

	// All of them, or the browser may keep an old one.
	var old = document.querySelectorAll("link[rel*='icon' i]");
	for(var i = 0; i < old.length; i++)
		old[i].parentNode.removeChild(old[i]);

	var href = "data:image/svg+xml," + encodeURIComponent(svg);

	var link = document.createElement("link");
	link.rel = "icon";
	link.type = "image/svg+xml";
	link.href = href;
	document.head.appendChild(link);

	// Safari does not read SVG favicons, so a raster copy follows the SVG.
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

/* Called at file scope, before allDone, so the icon is replaced earlier. The
   palette has resolved by then. */
draculaSetFavicon();

/* tracklabels answers with a fully transparent PNG for a row without a
   picture, so the pixels are checked and an empty row is marked. */
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
			// A failed probe never marks a row.
			blank = false;
		}
		draculaIconInk[url] = blank ? "blank" : "inked";
		draculaSweepIcons();
	};
	img.onerror = function() { draculaIconInk[url] = "inked"; };
	img.src = url;
}

/* Anything but one plain `url()` answers empty. */
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

/* Three surfaces keep the URL in different places; one probe keyed by URL
   serves all three. Only a row proved blank is marked. */
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

/* ruTorrent 5.3.7 added the `separator` part. Below it the theme draws the
   mark, and no stylesheet can ask whether a shadow part exists. */
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

/* Watching `icon` alone also keeps the sweep's own writes from looping. */
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

/* The Trackers tab is rebuilt on every poll. `style` is watched because
   dxSTable puts the favicon there; the sweep writes only data-dracula-blank. */
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

/* Upstream writes every log line as one `span.std` text node, so the stamp
   gets an element and the separators a class. A span with markup from
   `logHTML()` is left alone. */
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

/* log_history replays the log by re-appending the nodes; the attribute keeps
   a stamp from splitting twice. */
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

/* Called at file scope: the log paints before allDone. `#lcont` is static
   markup. */
draculaWatchLog();

/* Firefox reserves the list's scrollbar column on a first load and paints no
   bar until a style recalculation; hiding and showing the scroller forces
   one. */
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

/* Torrents arrive after allDone, so this waits for the first list that
   overflows. */
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

	/* With the theme disabled, as the mobile plugin does, nothing below holds,
	   and this file runs anyway. */
	if(draculaThemeSwitchedOff())
	{
		draculaCheckVersions();
		return;
	}

	draculaWatchListScrollbar(0);

	// Plugins add buttons and tabs after allDone, each with its own focus
	// handler.
	draculaRestoreKeyboardFocus();
	draculaWatchLoadingIndicator();
	draculaSweepIcons();
	draculaWatchCategoryIcons();
	draculaWatchTrackerIcons();
	var toolbar = document.getElementById("t");
	var tabbar = document.getElementById("tabbar");

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

	// A `tabindex` on a hidden element is no tab stop, so the file list joins the
	// roll only while it shows.
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

	// Plugins add buttons and tabs after allDone, and ruTorrent moves `selected`
	// as tabs switch.
	var focusObserver = new MutationObserver(refreshRegions);
	if(toolbar) focusObserver.observe(toolbar, { childList: true, subtree: true });
	if(tabbar) focusObserver.observe(tabbar,
		{ childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
	if(catlist) focusObserver.observe(catlist,
		{ childList: true, subtree: true, attributes: true, attributeFilter: ["selected"] });

	/* cpuload is a flot graph, so its colors reach the line it draws. */
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

	// The disk and CPU plugins rewrite their titles, so those two are watched.
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
	// Before the toolbar wrapper, which calls resizeTop through the property.
	draculaLowerListFloor();
	draculaFixHiddenToolbarHeight();
	draculaTouchDividers();
	draculaTorrentActionKeys();
	draculaCheckVersions();
}

// Keys for five torrent actions. Bare letters, since the mnemonic Ctrl
// letters are taken. Held off while typing, as upstream holds Delete;
// `select` and contenteditable are added because these keys are letters.
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

	// Recheck has no confirmation upstream, so more than one asks first through
	// `askYesNo`.
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

// `getStatusIcon` returns [icon, word]. The icon is only a CSS class; the
// scheduler compares the Seeding and Downloading words, so those stay. An
// allowlist of benign errors, so an unknown one stays an alarm.
function draculaMinorError(torrent)
{
	// rutracker_check sets the flag for a release it believes was taken down.
	// `chkstate` is a string.
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

// Mirrors the path through upstream's getStatusIcon that leaves both halves
// empty. Reads the bits: the error branch may have overwritten the name.
function draculaStoppedTorrent(torrent)
{
	return !(torrent.state &
		(dStatus.started | dStatus.checking | dStatus.hashing));
}

// Installed from allDone, so it wraps outside rutracker_check's own wrap,
// which returns early for chkstate 4.
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
			// Upstream has no stopped state and picks Completed or Incompleted by
			// percentage. A plugin's substitute word is left alone.
			if(status === theUILang.Finished || status === theUILang.Stopped)
				status = "Stopped";
			// A real error keeps the red cross.
			if(!draculaErrorIcon(icon))
				icon = "Status_Stopped";
		}

		// Pausing counts as not running.
		if(status === theUILang.Pausing)
			status = "Paused";

		return [icon, status];
	};
}

/* Installed at file scope: the first list paints before allDone, and a row
   keeps its icon until its data changes. The mobile plugin reads only the
   word. */
draculaStatusOverride();

// With the toolbar hidden, upstream sets `#maincont` to the window height
// less a literal 30, which leaves this theme's taller bar off screen, so the
// bar is measured. `resizeTop` runs again with upstream's own setting.
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
	// Upstream registers its `resize` as a listener at startup, capturing the
	// function, so this listener follows it.
	window.addEventListener("resize", draculaMainContentHeight);
	window.addEventListener("orientationchange", draculaMainContentHeight);
	draculaMainContentHeight();
}

/* === Dividers under a finger === */

var DRACULA_SHORT_VIEWPORT = 500;

var DRACULA_TAP_SLOP = 6;

// Set during a divider drag; the list floor is dropped while it is.
var draculaDividerDragging = false;

function draculaShortViewport()
{
	return window.innerHeight <= DRACULA_SHORT_VIEWPORT;
}

/* resizeTop floors the list at `webui.list_table_min_height`, which on a
   phone leaves the panel no room and pins a drag. The setting is dropped for
   the call only and never saved. */
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

// resize() runs after: the speed graph sizes itself from its container.
function draculaTogglePanelFull()
{
	var details = document.getElementById("tdetails");
	if(!details || getComputedStyle(details).display === "none")
		return;
	document.body.classList.toggle("dracula-panel-full");
	if(window.theWebUI && typeof theWebUI.resize === "function")
		theWebUI.resize();
}

/* Upstream's DnD binds mouse events only, and `DnD.start` refuses below
   768px, so pointer events drive the same `onRun`. Capture keeps a drag alive
   off the strip. */
function draculaDragDivider(el, onMove, onSettle, onTap)
{
	if(!el)
		return;
	var dragging = false, startX = 0, startY = 0, travelled = 0;

	el.addEventListener("pointerdown", function(e)
	{
		if(e.pointerType === "mouse")
		{
			// Upstream's DnD announces nothing, so the flag is set here for a mouse drag
			// too.
			draculaDividerDragging = true;
			return;
		}
		dragging = true;
		draculaDividerDragging = true;
		travelled = 0;
		startX = e.clientX;
		startY = e.clientY;
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

/* F6 hides the panel and the divider; with the swap on that leaves nothing
   to tap back, so the swap goes first. */
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

/* 1px, not 0: resizeTop returns early on a zero height. */
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

/* Upstream saves the split on every release, so a drag to an end is not
   stored. */
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

	// A mouse drag ends wherever the button comes up, so the end is watched on
	// the document.
	var mouseReleased = function(e)
	{
		if(!e.pointerType || e.pointerType === "mouse")
			draculaDividerDragging = false;
	};
	document.addEventListener("pointerup", mouseReleased);
	document.addEventListener("pointercancel", mouseReleased);
	document.addEventListener("mouseup", mouseReleased);

	// The same two calls upstream gives the mouse, so both save the same
	// setting.
	draculaDragDivider(document.getElementById("HDivider"),
		function(e){ theWebUI.resizeLeft(e.clientX); },
		function(){ theWebUI.setHSplitter(); },
		null);

	draculaDragDivider(document.getElementById("VDivider"),
		function(e)
		{
			// Removing the class forces the reflow that makes the box real.
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

// Headings and widths, applied in the dxSTable.create hook below. The detail
// tables keep upstream's proportions scaled to 1600px, widened where their
// rows need it. The Tasks tab is registered from inside `_task`'s wrapper,
// after the defaults are read here.
var draculaColumns = {
	fls: {
		name: { width: "580px" },
		size: { width: "205px" },
		done: { width: "290px" },
		percent: { text: "Progress", width: "290px" },
		priority: { width: "235px" }
	},
	trk: {
		name: { width: "400px" },
		type: { width: "120px" },
		enabled: { width: "120px" },
		group: { width: "120px" },
		seeds: { width: "120px" },
		peers: { width: "120px" },
		downloaded: { width: "160px" },
		last: { width: "170px" },
		interval: { width: "160px" },
		private: { width: "110px" }
	},
	prs: {
		name: { width: "150px" },
		version: { width: "250px" },
		flags: { width: "90px" },
		done: { width: "150px" },
		downloaded: { width: "150px" },
		uploaded: { width: "150px" },
		dl: { width: "110px" },
		ul: { width: "110px" },
		peerdl: { width: "110px" },
		peerdownloaded: { width: "150px" },
		country: { width: "180px" }
	},
	plg: {
		name: { width: "250px" },
		version: { width: "100px" },
		status: { width: "135px" },
		launch: { width: "135px" },
		author: { width: "285px" },
		descr: { width: "695px" }
	},
	hst: {
		name: { width: "425px" },
		status: { width: "130px" },
		time: { width: "170px" },
		size: { width: "105px" },
		downloaded: { width: "130px" },
		uploaded: { width: "130px" },
		ratio: { width: "80px" },
		label: { width: "80px" },
		created: { width: "170px" },
		seedingtime: { width: "170px" },
		addtime: { width: "170px" },
		tracker: { width: "140px" }
	},
	trt: {
		done:       { text: "Progress", width: "120px" },
		size:       { width: "100px" },
		dl:         { width: "110px" },
		ul:         { width: "110px" },
		eta:        { width: "80px" },
		// Upstream marks these ALIGN_RIGHT, but a bracketed pair is not a magnitude.
		peers:      { width: "80px", align: ALIGN_LEFT },
		seeds:      { width: "80px", align: ALIGN_LEFT },
		downloaded: { width: "115px" },
		uploaded:   { width: "115px" },
		remaining:  { width: "105px" },
		name:    { width: "320px" },
		status:  { width: "115px" },
		ratio:   { width: "70px" },
		// Timestamps are TYPE_NUMBER, which dxSTable right-aligns like a magnitude.
		created: { width: "160px", align: ALIGN_LEFT },
		addtime: { text: "Added On", width: "160px", align: ALIGN_LEFT },
		tracker: { width: "140px" }
	}
};

// Upstream hardcodes the graph series colors. Resolved, because they reach a
// canvas through flot's options. Hooked on rGraph, after both subclasses set
// their datasets.
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

	// The Trafic graph's previous-period series copy the current labels, so the
	// legend lists each name twice.
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

// seedingtime renames its columns after the table exists, on a timer;
// intercepting the rename keeps the list above in charge.
plugin.draculaRenameColumn = dxSTable.prototype.renameColumnById;
dxSTable.prototype.renameColumnById = function(id, name)
{
	var patch = draculaColumns[this.prefix];
	if(patch && patch[id] && patch[id].text)
		name = patch[id].text;
	return plugin.draculaRenameColumn.call(this, id, name);
}

// Applied from the create hook, after every plugin has pushed its columns.
/* `config()` lays the saved profile over the column definitions, so the
   declared widths are read here first. */
var draculaDeclaredWidths = {};

/* On a fresh profile `panelClosed` answers `undefined`, and
   `toggleAttribute("closed", undefined)` turns the attribute on, so every
   section opens collapsed. Coerced to false here; the setting is not written. */
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

/* The mobile plugin falls back to `plugin.theme` when no theme is stored, so
   only that default is set. The mobile plugin wraps this theme's `config`
   wrapper, so this runs before it reads the default. */
function draculaDarkByDefaultOnMobile()
{
	var mobile = window.thePlugins && typeof thePlugins.get === "function"
		? thePlugins.get("mobile") : null;
	if(mobile && mobile.theme === "light")
		mobile.theme = "dark";
}

/* The plugin gives every file entry one of two glyphs and writes the name as
   a bare text node, so the kind class is added here. `..` is the plugin's
   spelling of the way up. */
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
			// A no-break space, written as an escape.
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

/* The list is rebuilt on every step into a directory, so the marking follows
   the plugin's method. */
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

/* The plugin writes the status line as one string, so the ratio gets an
   element of its own. `theConverter.round` always writes a full stop. */
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

/* The plugin rewrites the line whole on every change, so only lines without
   the element are wrapped. A `<b>`, because the plugin's update selects
   `span`. */
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
		// Clamped at 1, as a plain number for `calc()`.
		box.style.setProperty("--dracula-ratio-met",
			String(Math.round(Math.min(found.value, 1) * 100)));
		value.parentNode.replaceChild(box, value);
		box.appendChild(value);
	}
}

/* The plugin writes both separators as the literal `" | "`; the spaces keep
   a bar inside a state string out. */
function draculaMobileSeparatorAt(text, from)
{
	if(typeof text !== "string")
		return -1;
	var at = text.indexOf(" | ", from > 0 ? from : 0);
	return at === -1 ? -1 : at + 1;
}

/* The plugin writes ` ↑` and ` ↓` before `theConverter.speed`; a reading is
   the arrow, the number, a space and the unit. */
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

/* Before the separators: that pass splits the line's text nodes. A `<b>`,
   because the plugin's update selects `span`. */
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

/* After the ratio, which reads the line's first text node. A tracker message
   arrives in an `<i>`, which walking the line's own text children skips. */
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

/* The class comes off on the next `animationiteration`, so the arrow
   finishes whole turns; with no animation, at once. */
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

/* A press shows at once; the background poll only after a second. */
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

/* A flag, not a count: a leaked count would turn forever. */
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

/* The plugin writes the disk meter's color inline from an async handler, so
   an observer recolors it and disconnects around its own write. Installed
   from the settings page, once `mobile.html` has injected the element. */
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

/* `theConverter.speed` is the number, one space, then the localized unit;
   zero is the empty string. */
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

/* Beside the span, not inside: the plugin sets the span's text whole on
   every pass. A bare figure with a unit beside it is already split. */
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

/* The plugin writes the rates from a callback after its tracker fetch, so
   the split follows the text. */
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

/* rTorrent answers an unset limit with a figure at its own ceiling. */
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

/* Before the readout: the readout's rules key on `li:last-child`. */
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
		/* The row stays when unlimited, or the other limit centers on the bar. */
		row.querySelector(".dracula-limit-value").textContent =
			at === -1 ? text : text.slice(0, at - 1);
		row.querySelector(".dracula-limit-unit").textContent =
			at === -1 ? "" : text.slice(at);
		row.querySelector(".dracula-limit-icon").hidden = !text;
	}
	item.hidden = !shown;
}

/* The plugin rewrites a changed row's status line whole, which drops a
   selection in it. */
function draculaHoldingListSelection()
{
	var list = document.getElementById("torrentsList");
	var selection = window.getSelection ? getSelection() : null;
	if(!list || !selection || !selection.rangeCount || selection.isCollapsed)
		return false;
	return list.contains(selection.getRangeAt(0).commonAncestorContainer);
}

function draculaMarkMobileLineParts()
{
	draculaMarkMobileRatios();
	draculaMarkMobileRates();
	draculaMarkMobileSeparators();
}

/* The rows are not in the document when the first pass returns, so the
   marks follow the rows. `marking` keeps the observer from seeing its own
   writes. */
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

/* `plugin.processTorrents` writes every row. */
function draculaMarkMobileLines()
{
	var mobile = window.thePlugins && typeof thePlugins.get === "function"
		? thePlugins.get("mobile") : null;
	if(!mobile || typeof mobile.processTorrents !== "function")
		return;
	var upstream = mobile.processTorrents;
	mobile.processTorrents = function()
	{
		/* While a selection is held the list stands still; the next pass applies
		   what was skipped, since `rowsPrev` is untouched. */
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

	/* A list arrives through the poll or `update`, and fails two ways that skip
	   `processTorrents`. */
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

	/* The limits arrive separately, folded into `theWebUI.total` after the list
	   pass. */
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

	/* The plugin gives `bi-tag` to the no-label row and, without tracklabels, to
	   every label; only the filter value tells them apart. */
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

	/* The filter page is rebuilt whole on every open; `#CatList` does not exist
	   here. */
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

	/* Upstream's refresh reloads the whole page. `update(true)` rebuilds the
	   rows, and `resetInterval` puts the core's chain back on its interval after
	   an error. */
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

/* The bundled mono face is offered only once the page is known to be the
   desktop: on a phone the log panel would fetch it before the mobile plugin
   disables the theme. A timer runs after every plugin has been evaluated. */
function draculaOfferBundledMono()
{
	setTimeout(function()
	{
		if(!draculaThemeSwitchedOff())
			document.documentElement.classList.add("dracula-desktop");
	}, 0);
}

draculaOfferBundledMono();

/* The mobile plugin disables the theme and strips its sheets, so plugins.css
   is put back at once instead of at `config` time. `injectCSS` adds a link on
   every call, so the newest copy is kept, and an older one goes only once the
   newer has applied. */
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
		// The list may not exist yet when the wrapper is installed.
		var result = plugin.draculaConfig.apply(this, arguments);
		draculaKeepPanelsOpen();
		return result;
	};
}

/* ruTorrent writes the whole profile back on every drag, so a saved width
   equal to the declaration was never chosen. */
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
		// `config()` runs after this, so only the profile keeps a width set here.
		if(saved && i < saved.length)
			saved[i] = parseInt(col.width, 10);
	}
}

plugin.draculaTableCreate = dxSTable.prototype.create;
dxSTable.prototype.create = function(ele, styles, aName)
{
	// With the theme off, nobody painted this table.
	if(draculaThemeSwitchedOff())
		return plugin.draculaTableCreate.call(this, ele, styles, aName);

	draculaPatchColumns(styles, aName);
	plugin.draculaTableCreate.call(this, ele, styles, aName);

	// Upstream's pair stands if the palette cannot be read.
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

/* `colDragResize` stores the rendered width as the declared one; correcting
   `movementX` keeps a drag one pixel for one. The event is rebuilt, since
   `movementX` is read-only. Absent below 5.2.0. */
if(typeof dxSTable.prototype.colDragResize === "function")
{
	plugin.draculaColDragResize = dxSTable.prototype.colDragResize;
	dxSTable.prototype.colDragResize = function(e)
	{
		var cell = this.tHeadCols[this.hotCell];
		var column = cell && this.colsdata[this.hotCell];
		var declared = column ? parseInt(column.width, 10) : 0;
		if(declared > 0 && declared !== cell.clientWidth)
			e = {
				originalEvent: {
					movementX:
						declared - cell.clientWidth + e.originalEvent.movementX
				}
			};
		return plugin.draculaColDragResize.call(this, e);
	};
}

function draculaTorrentNote(name, msg)
{
	var text = typeof name === "string" ? name : "";
	var note = typeof msg === "string" ? msg.trim() : "";
	return note ? text + "\n" + note : text;
}

/* Upstream sets a row's title once, to the first column. Wrapped at
   `setRowById`, which both paths run through, and written only when it
   changes, since `setAttr` dirties the row. */
// The Files tab marks every entry `Icon_File` or `Icon_Dir`, so the
// extension is the only signal of kind.
var DRACULA_FILE_KINDS = [
	["Archive", /^(zip|rar|7z|tar|gz|bz2|xz|zst|tgz)$/],
	["Disc", /^(iso|img|cue|bin|mdf|nrg|ccd)$/],
	["Video", /^(mkv|mp4|avi|webm|mov|wmv|flv|m2ts|mpg|mpeg|m4v)$/],
	["Audio", /^(flac|mp3|ogg|wav|m4a|aac|opus|wma|ape|shn|alac)$/],
	["Image", /^(jpg|jpeg|png|gif|webp|bmp|svg|tif|tiff|avif)$/],
	["Doc", /^(txt|nfo|md|log|ffp|md5|sfv|pdf|epub|srt|ass|sub|xml|json)$/]
];

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

// Upstream's class plus ours.
function draculaFileIconClass(name, icon)
{
	if(typeof name !== "string" || typeof icon !== "string")
		return icon;

	if(icon === "Icon_Dir")
		return name === ".." ? icon + " Icon_File_Up" : icon;

	if(icon !== "Icon_File")
		return icon;

	var kind = draculaFileKind(name);
	return kind ? icon + " Icon_File_" + kind : icon;
}

// `clearRows` leaves `stSel`, the Shift range anchor, naming a row that is
// gone; it is dropped, as upstream's `clearSelection` does.
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

	// The flat view passes no icon, so upstream's class is supplied.
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
