#!/usr/bin/env python3
"""Encrypt doors.json into content.json for the advent calendar.

Usage:
  python3 tools/encrypt.py                # reads ./doors.json, asks for passphrase
  python3 tools/encrypt.py my.json -o content.json
  ADVENT_PASSPHRASE="..." python3 tools/encrypt.py

Format (must match crypto.js):
  PBKDF2-HMAC-SHA256 (300k iterations, 16-byte salt) -> AES-256-GCM key
  each box = { iv: b64(12 bytes), data: b64(ciphertext || 16-byte tag) }
"""
import argparse, base64, getpass, json, mimetypes, os, sys, unicodedata
from pathlib import Path

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
except ImportError:
    sys.exit("Missing dependency. Run:  python3 -m pip install cryptography")

ITERATIONS = 300_000
MAX_IMAGE_BYTES = 400_000


def b64(b: bytes) -> str:
    return base64.b64encode(b).decode()


def normalize(p: str) -> str:
    # Mirrors normalizePassphrase() in crypto.js
    return unicodedata.normalize("NFKC", p).strip().lower()


def derive_key(passphrase: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERATIONS)
    return kdf.derive(normalize(passphrase).encode())


def seal(key: bytes, obj) -> dict:
    iv = os.urandom(12)
    data = AESGCM(key).encrypt(iv, json.dumps(obj, ensure_ascii=False).encode(), None)
    return {"iv": b64(iv), "data": b64(data)}


def open_box(key: bytes, box: dict):
    iv = base64.b64decode(box["iv"]); data = base64.b64decode(box["data"])
    return json.loads(AESGCM(key).decrypt(iv, data, None))


def inline_image(value: str, base: Path) -> str:
    """If `image` points at a local file, embed it as a data URL so it is encrypted too."""
    if not value or value.startswith(("http://", "https://", "data:")):
        return value
    p = (base / value).resolve()
    if not p.is_file():
        sys.exit(f"Image not found: {value}")
    size = p.stat().st_size
    if size > MAX_IMAGE_BYTES:
        print(f"  warning: {value} is {size//1000} KB; consider shrinking it (<{MAX_IMAGE_BYTES//1000} KB)")
    mime = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
    return f"data:{mime};base64,{b64(p.read_bytes())}"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("doors", nargs="?", default="doors.json", help="plaintext content (default: doors.json)")
    ap.add_argument("-o", "--out", default="content.json", help="encrypted output (default: content.json)")
    ap.add_argument("--passphrase", help="passphrase (otherwise $ADVENT_PASSPHRASE or a prompt)")
    args = ap.parse_args()

    src = Path(args.doors)
    if not src.is_file():
        sys.exit(f"{src} not found. Copy doors.template.json to doors.json and fill it in.")
    plain = json.loads(src.read_text(encoding="utf-8"))

    doors = plain.get("doors", [])
    days = sorted(d.get("day") for d in doors)
    if days != list(range(1, 25)):
        sys.exit(f"doors.json must contain exactly days 1..24, got: {days}")
    for d in doors:
        if d.get("type") not in ("gift", "activity", "note"):
            sys.exit(f"Door {d.get('day')}: type must be gift, activity or note")

    passphrase = args.passphrase or os.environ.get("ADVENT_PASSPHRASE")
    if not passphrase:
        passphrase = getpass.getpass("Passphrase: ")
        if passphrase != getpass.getpass("Repeat passphrase: "):
            sys.exit("Passphrases do not match.")
    if len(normalize(passphrase)) < 8:
        sys.exit("Use a longer passphrase (a few words is ideal).")

    salt = os.urandom(16)
    key = derive_key(passphrase, salt)

    meta = {"title": plain.get("title", "Advent Calendar"),
            "intro": plain.get("intro", ""),
            "year": int(plain.get("year", 2026))}

    boxes = []
    for d in sorted(doors, key=lambda d: d["day"]):
        content = {k: v for k, v in d.items() if k != "day"}
        if content.get("image"):
            content["image"] = inline_image(content["image"], src.parent)
        if content.get("images"):
            content["images"] = [inline_image(v, src.parent) for v in content["images"]]
        boxes.append({"day": d["day"], **seal(key, content)})

    bundle = {
        "v": 1,
        "kdf": {"name": "PBKDF2", "hash": "SHA-256", "iterations": ITERATIONS, "salt": b64(salt)},
        "meta": seal(key, meta),
        "doors": boxes,
    }

    # Verify round-trip before writing.
    assert open_box(key, bundle["meta"]) == meta
    for b in boxes:
        open_box(key, b)

    Path(args.out).write_text(json.dumps(bundle, indent=1), encoding="utf-8")
    print(f"Wrote {args.out} ({Path(args.out).stat().st_size//1000} KB) with {len(boxes)} doors.")
    print("Remember the passphrase; it is not stored anywhere.")


if __name__ == "__main__":
    main()
