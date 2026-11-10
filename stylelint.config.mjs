// Dev-time only. Nothing here reaches the shipped theme.
//
// Written as .mjs rather than .stylelintrc.json so each rule turned off can
// carry its reason.
//
// The base is stylelint-config-recommended, not -standard: -standard adds ~30
// formatting rules that argue with two things this theme cannot change — its
// own deliberate hand formatting (`div#t div#add {background: ...;
// background-size: 28px;}` is two declarations on one line, on purpose) and
// upstream's class names, which are not kebab-case and not the theme's to
// rename (.Status_Paused, .Icon_File, .Cell0, .noty_bar). -recommended is the
// correctness-only set: every rule in it is a real error.
export default {
	extends: "stylelint-config-recommended",
	rules: {
		// Fires constantly and legitimately in an override theme: upstream's
		// source order dictates this one, so a low-specificity selector routinely
		// has to come after a high-specificity one.
		"no-descending-specificity": null,

		// Off deliberately. This theme overrides a UI that writes inline styles,
		// and !important is the only thing that outranks inline, so a warning
		// per use is a wall to skim past rather than a signal. The count is
		// guarded instead by a ratchet in tests/integrity.test.mjs, which fails
		// when it grows.
		"declaration-no-important": null,

		"declaration-block-no-duplicate-properties": [
			true,
			{ ignore: ["consecutive-duplicates-with-different-values"] },
		],
		"function-url-quotes": ["always", { except: ["empty"] }],

		// Every color outside the palette is a var(). Custom property
		// declarations are skipped, so the palette itself stays legal.
		"value-type-custom-property-required-list": [
			["color"],
			{
				ignoreValues: [
					"transparent",
					"inherit",
					"currentColor",
					"none",
					"initial",
					"unset",
					"revert",
				],
				// A mask reads alpha, so its stops are opacity.
				ignoreProperties: { color: ["/^(-webkit-)?mask/"] },
				severity: "warning",
			},
		],
	},
};
