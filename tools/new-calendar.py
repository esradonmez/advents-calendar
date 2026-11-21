#!/usr/bin/env python3
"""Create a calendar folder for one friend.

Usage:  python3 tools/new-calendar.py friend
Creates friend/index.html and friend/manifest.webmanifest (shared app code stays at the root),
plus doors-friend.json from doors.template.json if it does not exist yet.
Then: edit doors-friend.json and run  python3 tools/encrypt.py doors-friend.json -o friend/content.json
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = (ROOT / "tools" / "index.template.html").read_text(encoding="utf-8")


def main():
    if len(sys.argv) != 2 or not re.fullmatch(r"[a-z0-9-]+", sys.argv[1]):
        sys.exit("usage: new-calendar.py <name>   (lowercase letters, digits, dashes)")
    name = sys.argv[1]
    folder = ROOT / name
    folder.mkdir(exist_ok=True)
    (folder / "index.html").write_text(INDEX, encoding="utf-8")
    manifest = {
        "name": "Advent Calendar", "short_name": "Advent",
        "description": "A little something for every day until Christmas.",
        "id": f"./{name}/", "start_url": "./", "scope": "./",
        "display": "standalone", "orientation": "portrait",
        "background_color": "#0f1b2d", "theme_color": "#0f1b2d",
        "icons": [
            {"src": "../icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "../icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": "../icons/icon.svg", "sizes": "any", "type": "image/svg+xml"},
        ],
    }
    (folder / "manifest.webmanifest").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    doors = ROOT / f"doors-{name}.json"
    if not doors.exists():
        tpl = json.loads((ROOT / "doors.template.json").read_text(encoding="utf-8"))
        tpl["title"] = f"Merry Christmas, {name.capitalize()}!"
        for d in tpl["doors"]:            # starter has no photos; add your own paths later
            d.pop("image", None); d.pop("images", None)
        doors.write_text(json.dumps(tpl, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"created {doors.name} (edit it, it is git-ignored)")
    print(f"created {name}/index.html and {name}/manifest.webmanifest")
    print(f"next:   python3 tools/encrypt.py doors-{name}.json -o {name}/content.json")


if __name__ == "__main__":
    main()
