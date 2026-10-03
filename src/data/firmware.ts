// The wheel app builds, newest last. Facts only (what changes, how it's gated); addresses and code stay in the
// firmware repo. Update this when a build ships.
export const BUILDS = [
  { n: 4, title: "Every light, any colour · the PC owns the screen", status: "tested", text: "All 38 LEDs take their colour from the PC; the plugin can take over the screen and gives it back when it stops (1 s keepalive)." },
  { n: 5, title: "The dash button goes to the PC", status: "tested", text: "In USB mode the dash button becomes controller button 40 and stops switching the wheel's own pages." },
  { n: 6, title: "USB takes over from the base", status: "tested", text: "A wheel that started on the base restarts into USB mode when a PC is on its cable (at most three times per power-on)." },
  { n: 7, title: "The wheel says which build it runs", status: "tested", text: "On the plugin's question the wheel reports its build number, so no more \"my wheel runs the patch\" checkbox." },
  { n: 8, title: "You choose the dash button and the upper paddles", status: "tested", text: "The dash button and the two upper paddles are sent to buttons you pick in the plugin (the paddles send nothing over USB on a stock wheel). Only active in USB mode." },
  { n: 9, title: "48 buttons: room for every control", status: "tested", text: "The wheel reports 48 buttons instead of 40, so the dash button and the upper paddles get their own slots (41 to 43) and share nothing with an encoder or a roller. SimPro still connects and reads the wheel as before." },
];

export const LAYERS = [
  { title: "Only the wheel's own app", text: "The bootloader, the flag page and the firmware update path are never touched. Your base and force feedback aren't involved." },
  { title: "Off until the PC turns it on", text: "Every new behaviour waits for a magic word the plugin writes into the wheel's memory; at power-on memory is random, so the wheel starts as stock. The one exception, build 6's switch to USB (the PC can't reach a wheel on the base), is limited instead: base mode only, after 3 s, at most three restarts per power-on." },
  { title: "Emulated against stock", text: "Every changed routine runs in an emulator from both images over every input and mode, including a negative control that must fail." },
  { title: "Byte-identical round trip", text: "Each build is packaged, unpacked again and compared byte for byte before it's ever flashed." },
  { title: "One change per build", text: "If something misbehaves on a wheel, only one thing changed." },
  { title: "Stock is one reinstall away", text: "SimPro's own reinstall of wheel app 1.3.11 puts Simagic's firmware back." },
];
