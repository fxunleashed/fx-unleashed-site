# Share and submit dashes

Three ways, from the quickest to the widest. None of them needs Git.

## Send one to a friend

Dashes tab, pick your dash, **Share...**. It saves one file (`<name>.fxdash.json`, pictures inside) and puts it on the clipboard, so
you can paste it into a message. Your friend drops it on the plugin's Dashes tab, or presses **Import a file...**. The plugin
checks it like a library dash (format, size, no scripts), and it never replaces a dash they already have.

Sharing something you converted from someone else's SimHub dash? Only with its author's permission.

## Send a library dash

Every library item has a **Copy link** button, in the plugin and on [the library page](/library/). The link opens a page with a live
preview, an **Install in the plugin** button and a download.

## Submit it to the library

For everyone to use. You need to have made it, or have its author's permission.

1. **Make it** in the plugin's [designer](/docs/dash-designer/) (Dashes tab, *Edit in the designer*) until its checks show no
   warnings: no flashing, text that fits, low USB traffic.
2. **Package it:** Dashes tab, pick your dash, **Package for the library**. Fill in the name, games, tags, licence and
   version, and tick that it's yours. It writes a file called `<id>.fxdash.zip` and offers to open the submit form.
3. **Submit it:** open the [Submit a dash](https://github.com/fxunleashed/fx-unleashed-library/issues/new?template=submit-dash.yml)
   form, drag the `.zip` into the box, tick the three boxes and submit.
4. **A bot checks it** (format, size, no scripts, the preview, the checksum). If everything passes it's **published on the spot**:
   the form closes with a link, and it's in the library and the plugin a few minutes later, credited to you. If something's
   wrong it tells you exactly what; fix it, replace the `.zip` by editing the issue, and it checks again.

## Update or remove yours

**Update:** package it again with a **higher Version** and submit the same way. Only the account that submitted a dash can update it.
Players who installed it see "Update to vX". **Remove:** open an issue or a pull request that deletes its folder.

## The rules

- Your own work, or made with the original author's written permission. Converted work (a SimHub dash, someone's design)
  needs *Based on* and a link to where its author agreed (*Permission*). No logos or product photos you don't own.
- No scripts: no `js:` formulas and no scripts folder. SimHub properties and NCalc formulas are fine.
- Up to 1 MB, a current dash format, an 800x480 preview (the plugin renders it), and at most three new items a day.
- It goes in under the library's [terms](/legal/#library-terms). If something shouldn't be there, tell us and it comes down while it's
  looked at.

## Prefer Git?

Open a pull request that adds your item's folder (`dashes/<id>/` or `savers/<id>/`, with `dash.json`, `meta.json` and `preview.png`;
the plugin's package writes them). The same checks run and merge it when they pass. The details are in the library's
[CONTRIBUTING.md](https://github.com/fxunleashed/fx-unleashed-library/blob/main/CONTRIBUTING.md).
