"""Fail closed on item/image/outfit leakage in a normalized compatibility dataset.

Input: {items: [{id, path, group_id}], splits: {train, validation, test}}
Each split contains [{id, items: [item_id, ...], label: 0|1}].
group_id groups known photos of the same physical garment (required).
Image paths are relative to the manifest. Never generates compatibility labels.
"""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageOps


def audit(path):
    path = Path(path).resolve()
    data = json.loads(path.read_text(encoding="utf-8"))
    errors = []
    items = {}
    for item in data["items"]:
        key = item["id"]
        if key in items:
            raise ValueError(f"duplicate item id: {key}")
        if not item.get("group_id"):
            raise ValueError(f"missing garment group_id: {key}")
        image_path = (path.parent / item["path"]).resolve()
        encoded = hashlib.sha256(image_path.read_bytes()).hexdigest()
        with Image.open(image_path) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
            pixels = hashlib.sha256(
                str(image.size).encode() + image.tobytes()
            ).hexdigest()
        items[key] = (item["group_id"], encoded, pixels)
    owners = {kind: {} for kind in ("item", "garment", "encoded", "pixels", "outfit")}
    counts = {}
    for split in ("train", "validation", "test"):
        records = data["splits"][split]
        if not records:
            errors.append(f"empty split: {split}")
        labels = {0: 0, 1: 0}
        seen = {}
        record_ids = set()
        for row in records:
            if row["id"] in record_ids:
                errors.append(f"duplicate record id in {split}: {row['id']}")
            record_ids.add(row["id"])
            label = row["label"]
            if type(label) is not int or label not in labels:
                raise ValueError("labels must be integer 0 or 1")
            ids = row["items"]
            if not 2 <= len(ids) <= 8 or len(set(ids)) != len(ids):
                raise ValueError(f"invalid outfit: {row['id']}")
            labels[label] += 1
            canonical = tuple(sorted(ids))
            if canonical in seen:
                errors.append(f"duplicate/conflicting outfit in {split}: {row['id']}")
            seen[canonical] = label
            keys = [("outfit", canonical)]
            for key in ids:
                group, encoded, pixels = items[key]
                keys.extend((("item", key), ("garment", group),
                             ("encoded", encoded), ("pixels", pixels)))
            for kind, key in keys:
                previous = owners[kind].setdefault(key, split)
                if previous != split:
                    errors.append(f"{kind} overlap: {previous} / {split}")
        if not all(labels.values()):
            errors.append(f"both positive and negative examples required: {split}")
        counts[split] = {"outfits": len(records), "positive": labels[1], "negative": labels[0]}
    return {
        "passed": not errors,
        "manifest_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "counts": counts,
        "errors": sorted(set(errors)),
        "limitations": [
            "Exact hashes do not detect crops, resizing or visually near-duplicate images.",
            "group_id must be curated; distinct IDs do not establish distinct garments.",
            "Passing this audit does not establish label quality or absence of overfitting.",
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = audit(args.manifest)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result["passed"] else 1)
