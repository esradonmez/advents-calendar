# Advent Calendar (PWA)

One site, one calendar per person. Shared app code lives at the root; each
person has a folder (`<name>/`) with their own encrypted `content.json`,
their own passphrase and their own link:

    https://esradonmez.github.io/advents-calendar/<name>/

Plaintext content lives in `doors-<name>.json` at the root (git-ignored).

## 0. Add a calendar for a person

```sh
python3 tools/new-calendar.py <name>
```

This creates `<name>/index.html`, `<name>/manifest.webmanifest` and a starter
`doors-<name>.json`. Then follow steps 1 and 2 with that file.

## 1. Write the content

Edit `doors-<name>.json` (created by step 0, git-ignored). Top level:

| field   | meaning                                         |
|---------|-------------------------------------------------|
| `title` | heading shown after unlocking, e.g. "Merry Christmas, Anna!" |
| `intro` | short text under the heading (line breaks allowed with `\n`) |
| `year`  | the December in which doors unlock (default 2026) |
| `doors` | exactly 24 entries, days 1..24                   |

Each door:

| field      | required | meaning                                                   |
|------------|----------|-----------------------------------------------------------|
| `day`      | yes      | 1..24                                                     |
| `type`     | yes      | `gift`, `activity` or `note` (changes the little label)   |
| `title`    | yes      | headline                                                  |
| `text`     | no       | body text, line breaks with `\n`                          |
| `code`     | no       | gift card code, shown in a box with a Copy button         |
| `link`     | no       | URL for a button (e.g. where to redeem)                   |
| `linkText` | no       | button label, default "Open link"                         |
| `image`    | no       | URL, **or a local file path** like `photos/us.jpg`        |
| `images`   | no       | list of several images (URLs or local paths), shown as a tap-to-enlarge gallery |

Local images are embedded into the encrypted bundle, so they stay private too.
Keep them small (under ~400 KB each, resize before adding). The `photos/`
folder is git-ignored.

## 2. Encrypt

```sh
python3 tools/encrypt.py doors-<name>.json -o <name>/content.json
```

It asks for a passphrase twice and writes the encrypted file into the person's folder.

Re-run this any time you change the person's `doors-<name>.json`, with the same passphrase. The passphrase is not stored anywhere, so remember it.

Needs the `cryptography` package. If missing:
`python3 -m pip install cryptography`.

## 3. Test locally

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000/<name>/?today=2026-12-05> to preview the calendar as if it
were 5 December. `?reset` clears the saved passphrase and opened doors.

`doors.template.json` is only a template. Never write a passphrase into any committed file.

## 4. Deploy for free (GitHub Pages)

1. Create a repo on GitHub (public is fine, the content is encrypted).
2. Push:
   ```sh
   git add -A
   git commit -m "Advent calendar"
   git branch -M main
   git remote add origin git@github.com:YOUR_USER/advents-calendar.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a
   branch**, branch `main`, folder `/ (root)`. Save.
4. After a minute the calendars are live at `https://YOUR_USER.github.io/advents-calendar/<name>/`.

Every later `git push` redeploys. To update a calendar: edit its `doors-<name>.json`,
run the encrypt script for it, commit `<name>/content.json`, push.


## 5. Install on iPhone

1. Send the person the URL and tell them the passphrase in person or by voice.
2. They open the URL in **Safari**.
3. Tap the **Share** button → **Add to Home Screen** → **Add**.
4. Open the app from the home screen and enter the passphrase once.
   It is remembered on the device.

Note: the installed app and Safari keep separate storage. If they unlocked the
calendar in Safari first, they enter the passphrase once more inside the app.

## How doors unlock

Door N opens on N December of the configured year, based on the phone's date.
Earlier doors stay open, so they can revisit them.

## Files

- `style.css`, `app.js`, `crypto.js`, `sw.js`, `icons/` – shared app code (decryption is PBKDF2 + AES-256-GCM via Web Crypto)
- `<name>/index.html`, `<name>/manifest.webmanifest`, `<name>/content.json` – one person's calendar
- `doors-<name>.json` – the person's plaintext content (git-ignored)
- `tools/new-calendar.py` – creates a person's folder; `tools/encrypt.py` – encrypts their content
- `doors.template.json` – starter content
