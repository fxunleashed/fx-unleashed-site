// FAQ: add or edit entries here. `a` is plain text with optional [links](/path/).
export const FAQ: { q: string; a: string; tag?: string }[] = [
  { tag: "Basics", q: "What is FX Unleashed?", a: "A free SimHub plugin for the Simagic FX Pro wheel. In standard mode it keeps the rev lights and the wheel's dash matched to each car through SimPro. In Unleashed mode it drives the wheel itself over its USB cable: your own dashes, all 38 lights in any colour, screensavers, the dash button and more." },
  { tag: "Basics", q: "Is it free?", a: "Yes. Free and open source (GPL-3.0). No account, no tracking, no paid features." },
  { tag: "Basics", q: "Is it made by Simagic?", a: "No. It's an independent community project, not affiliated with or supported by Simagic. Simagic and FX Pro are their trademarks, used only to say which hardware it works with." },
  { tag: "Setup", q: "Which games work?", a: "Every game SimHub supports: the plugin takes its data from SimHub, not from the games directly." },
  { tag: "Setup", q: "Do I need to flash anything?", a: "Only for Unleashed mode. Standard mode works with the stock wheel. Read the [firmware page](/firmware/) before flashing." },
  { tag: "Setup", q: "Does it change my base or force feedback?", a: "No. Force feedback and base settings stay with SimPro. (There's an optional per-car rotation and force setting, which goes through SimPro and is put back when SimHub closes.)" },
  { tag: "Setup", q: "Why do my wheel buttons stop working in the game?", a: "In USB mode the wheel's buttons reach the PC through its own USB controller, not the base. Bind them once per game to that controller. See [game controls](/start/#5-game-controls)." },
  { tag: "Setup", q: "Can I go back to stock?", a: "Yes, any time: reinstall wheel app 1.3.11 in SimPro with its original file. See [back to stock](/firmware/#back-to-stock)." },
  { tag: "Dashes", q: "Can I make my own dash?", a: "Yes: the dash designer runs in your browser, shows the dash on the wheel while you edit, and checks it won't flicker or lag. Or convert a SimHub dash. See [the designer](/docs/dash-designer/)." },
  { tag: "Dashes", q: "Can I share my dash?", a: "Yes: package it in the plugin and submit it to the [library](/library/). It needs to be your own work, or made with the original author's permission." },
  { tag: "Dashes", q: "Why no JavaScript in library dashes?", a: "Downloaded code would run inside SimHub on your PC. Library dashes can use SimHub properties and NCalc formulas, which can't do anything outside the dash." },
  { tag: "Lights", q: "Does it work with ATSR-Hub or SimHub's LED profiles?", a: "Both. ATSR-Hub's effects go straight to all 38 lights, and the wheel can be added in SimHub's Devices so any SimHub LED profile drives it." },
  { tag: "Streaming", q: "Can I show the wheel's screen on stream?", a: "Yes: the plugin serves a screen mirror (with the lights) as an OBS browser source. Dashes tab, \"Stream the wheel's screen\"." },
  { tag: "Wheels", q: "Will other wheels be supported?", a: "The site and the lights are built from one wheel description, so adding another wheel is mostly describing it. Whether a wheel can be supported depends on its firmware; ask on GitHub." },
];
