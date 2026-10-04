// Everything a maintainer is likely to change, in one place.

export const site = {
  name: "FX Unleashed",
  domain: "fxunleashed.com",
  tagline: "Custom dashes and lights for Simagic wheels",
  description:
    "A free SimHub plugin that unleashes your Simagic FX Pro: your own dashes, every LED in any colour, screensavers, " +
    "ready-made dashes, and the dash button, all driven from SimHub.",
  // GitHub
  github: "https://github.com/fxunleashed",
  pluginRepo: "fxunleashed/fx-unleashed",
  libraryRepo: "fxunleashed/fx-unleashed-library",
  // Where the plugin and the library live at runtime
  libraryBase: "https://raw.githubusercontent.com/fxunleashed/fx-unleashed-library/main/",
  pluginPort: 8899, // the plugin's local server (designer, library install, screen mirror)
  releasesApi: "https://api.github.com/repos/fxunleashed/fx-unleashed/releases",
  releasesPage: "https://github.com/fxunleashed/fx-unleashed/releases",
  firmwareRepo: "https://github.com/fxunleashed/fx-unleashed-firmware",
  firmwareReleases: "https://github.com/fxunleashed/fx-unleashed-firmware/releases",
  firmwareApi: "https://api.github.com/repos/fxunleashed/fx-unleashed-firmware/releases/latest",
  contact: "https://github.com/fxunleashed/fx-unleashed/issues",
  discord: "https://discord.gg/P9Rz6fXrRc",
  support: "https://paypal.me/fxunleashed", // a voluntary tip jar: nothing is unlocked by it
};

export const nav: { href: string; label: string; external?: boolean }[] = [
  { href: "/", label: "Home" },
  { href: "/start/", label: "Get started" },
  { href: "/library/", label: "Library" },
  { href: "/lab/", label: "Light lab" },
  { href: "/docs/", label: "Docs" },
  { href: "/firmware/", label: "Firmware" },
  { href: "/changelog/", label: "Changelog" },
  { href: "/faq/", label: "FAQ" },
  { href: site.discord, label: "Discord", external: true },
  { href: site.support, label: "Support", external: true },
];

export const disclaimer =
  "FX Unleashed is an independent community project. It is not affiliated with, endorsed by or supported by Simagic. " +
  "Simagic and FX Pro are trademarks of their owner, used only to say which hardware this works with. The software is " +
  "provided \"as is\", without warranty of any kind. Use it at your own risk.";
