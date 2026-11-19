"""Frozen image features, split audit, and conservative clean benchmark.

No image encoder fitting. Official compatibility labels are preserved.
Cross-split exact and dHash candidate collisions are excluded from ALL splits.
"""
import concurrent.futures
import hashlib
import io
import json
import os
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.environ.setdefault("TORCH_HOME", str(ROOT / ".cache" / "torch"))

import numpy as np
import pyarrow.parquet as pq
import torch
from PIL import Image, ImageOps
from torchvision.models import ResNet18_Weights, resnet18

from download_polyvore import REVISION

DATA = ROOT / "data" / "polyvore"
OUT = ROOT / "data" / "prepared"


def fingerprint(blob):
    with Image.open(io.BytesIO(blob)) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        encoded = hashlib.sha256(blob).hexdigest()
        pixels = hashlib.sha256(str(image.size).encode() + image.tobytes()).hexdigest()
        small = np.asarray(image.convert("L").resize((9, 8), Image.Resampling.LANCZOS))
        dhash = np.packbits(small[:, 1:] > small[:, :-1]).tobytes().hex()
        # Conservative candidate matching, not proof of the same physical garment.
        near = f"{dhash}:{round(image.width / image.height, 1)}"
        return image, (encoded, pixels, near)


def main():
    start = time.perf_counter()
    OUT.mkdir(parents=True, exist_ok=True)
    # Per-image CPU preprocessing is already parallelized by the thread pool.
    torch.set_num_threads(1)
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA required for this extraction run")
    device = torch.device("cuda")
    weights = ResNet18_Weights.IMAGENET1K_V1
    preprocess = weights.transforms()
    model = resnet18(weights=weights).eval().to(device)
    model.fc = torch.nn.Identity()
    print(f"Frozen ResNet18 features on {torch.cuda.get_device_name()}", flush=True)

    def decode(row):
        try:
            image, hashes = fingerprint(row["image"]["bytes"])
            return str(row["item_id"]), preprocess(image), hashes
        except (OSError, ValueError):
            return str(row["item_id"]), None, None

    source_counts = {}
    hashes = {}
    all_ids = {}
    corrupt = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for split in ("train", "validation", "test"):
            target = OUT / f"{split}_features.npz"
            hash_target = OUT / f"{split}_hashes.json"
            if target.exists() and hash_target.exists():
                cached = np.load(target)
                ids = cached["ids"].tolist()
                split_hashes = json.loads(hash_target.read_text())
                print(f"Reusing frozen feature cache: {split} {len(ids)}", flush=True)
            else:
                features, ids, split_hashes = [], [], {}
                parquet = pq.ParquetFile(DATA / "data" / "disjoint" / f"{split}.parquet")
                for batch in parquet.iter_batches(batch_size=64):
                    rows = list(pool.map(decode, batch.to_pylist()))
                    good = [row for row in rows if row[1] is not None]
                    corrupt.extend(row[0] for row in rows if row[1] is None)
                    if good:
                        images = torch.stack([row[1] for row in good]).to(device)
                        with torch.inference_mode(), torch.autocast("cuda", dtype=torch.float16):
                            z = torch.nn.functional.normalize(model(images), dim=1)
                        features.append(z.float().cpu().numpy())
                        ids.extend(row[0] for row in good)
                        split_hashes.update({row[0]: row[2] for row in good})
                    if len(ids) % 4096 < 64:
                        print(f"{split}: {len(ids)}/{parquet.metadata.num_rows} images", flush=True)
                np.savez(target, ids=np.array(ids), features=np.concatenate(features))
                hash_target.write_text(json.dumps(split_hashes), encoding="utf-8")
            source_counts[split] = len(ids)
            all_ids[split] = set(ids)
            hashes[split] = split_hashes

    # Identify cross-split item IDs, encoded bytes, normalized pixels, and near candidates.
    forbidden = set()
    overlaps = {}
    for kind, position in (("item_id", None), ("encoded_sha256", 0),
                           ("pixel_sha256", 1), ("dhash_aspect_candidate", 2)):
        owners = defaultdict(list)
        for split, records in hashes.items():
            for item_id, values in records.items():
                owners[item_id if position is None else values[position]].append((split, item_id))
        collisions = [members for members in owners.values() if len({s for s, _ in members}) > 1]
        overlaps[kind] = {"groups": len(collisions), "items": len({i for g in collisions for _, i in g})}
        forbidden.update(i for group in collisions for _, i in group)

    # Previously used personal/shop registration photos remain excluded from fitting.
    personal_root = ROOT.parent.parent / "wardrobe-desktop-handoff"
    personal_manifest = personal_root / "data" / "fresh_01" / "manifest.json"
    personal_matches = set()
    if personal_manifest.exists():
        personal_hashes = [set(), set(), set()]
        for row in json.loads(personal_manifest.read_text(encoding="utf-8")):
            _, values = fingerprint((personal_root / row["path"]).read_bytes())
            for index, value in enumerate(values):
                personal_hashes[index].add(value)
        for records in hashes.values():
            for item_id, values in records.items():
                if any(value in personal_hashes[index] for index, value in enumerate(values)):
                    personal_matches.add(item_id)
        forbidden.update(personal_matches)

    metadata = json.loads((DATA / "polyvore_item_metadata.json").read_text(encoding="utf-8"))
    cats = sorted({metadata.get(i, {}).get("semantic_category", "unknown") for i in all_ids["train"]})
    categories = {name: index + 1 for index, name in enumerate(cats)}
    refs = {}
    for name in ("train", "valid", "test"):
        for outfit in json.loads((DATA / "disjoint" / f"{name}.json").read_text()):
            for item in outfit["items"]:
                refs[f"{outfit['set_id']}_{item['index']}"] = str(item["item_id"])

    cleaned, rejected = {}, {}
    for split, name in (("train", "train"), ("validation", "valid"), ("test", "test")):
        records, seen, removed = [], {}, defaultdict(int)
        for line in (DATA / "disjoint" / f"compatibility_{name}.txt").read_text().splitlines():
            fields = line.split()
            label = int(fields[0])
            ids = [refs.get(ref) for ref in fields[1:]]
            if any(i not in all_ids[split] for i in ids):
                removed["unresolved_or_outside_split"] += 1
                continue
            if not 2 <= len(ids) <= 8 or len(ids) != len(set(ids)):
                removed["size_or_repeated_item"] += 1
                continue
            if forbidden.intersection(ids):
                removed["cross_split_or_personal_collision"] += 1
                continue
            canonical = tuple(sorted(ids))
            if canonical in seen:
                # Conflicting examples are removed from both labels.
                if seen[canonical]["label"] != label:
                    seen[canonical]["conflicting"] = True
                removed["duplicate_or_conflicting_outfit"] += 1
                continue
            row = {"items": ids, "label": label}
            seen[canonical] = row
            records.append(row)
        cleaned[split] = [r for r in records if not r.get("conflicting")]
        rejected[split] = dict(removed)

    fitb = {}
    for split, name in (("validation", "valid"), ("test", "test")):
        questions = []
        for row in json.loads((DATA / "disjoint" / f"fill_in_blank_{name}.json").read_text()):
            question = [refs.get(ref) for ref in row["question"]]
            answers = [refs.get(ref) for ref in row["answers"]]
            ids = question + answers
            if (not 1 <= len(question) <= 7 or len(answers) != 4 or len(set(answers)) != 4 or
                any(i not in all_ids[split] or i in forbidden for i in ids)):
                continue
            # Official correct answer belongs to the same outfit as the question.
            outfit_id = row["question"][0].rsplit("_", 1)[0]
            correct = [j for j, ref in enumerate(row["answers"])
                       if ref.rsplit("_", 1)[0] == outfit_id and
                       int(ref.rsplit("_", 1)[1]) == row["blank_position"]]
            if len(correct) == 1 and all(a not in question for a in answers):
                questions.append({"question": question, "answers": answers, "correct": correct[0]})
        fitb[split] = questions

    # Assert the actual cleaned examples have no common IDs or fingerprints.
    used = {s: {i for r in rows for i in r["items"]} |
               {i for r in fitb.get(s, []) for i in r["question"] + r["answers"]}
            for s, rows in cleaned.items()}
    for left, right in (("train", "validation"), ("train", "test"), ("validation", "test")):
        assert not used[left].intersection(used[right])
        for position in range(3):
            assert not {hashes[left][i][position] for i in used[left]}.intersection(
                hashes[right][i][position] for i in used[right])
    assert all({r["label"] for r in rows} == {0, 1} for rows in cleaned.values())
    result = {
        "revision": REVISION, "encoder": "torchvision/resnet18/IMAGENET1K_V1",
        "encoder_frozen": True, "extraction_precision": "CUDA fp16 autocast, stored fp32",
        "source_image_counts": source_counts,
        "overlaps_before_cleaning": overlaps, "excluded_item_count": len(forbidden),
        "personal_photo_matches": len(personal_matches), "corrupt_images": corrupt,
        "rejected_outfits": rejected,
        "cleaned_counts": {s: {"outfits": len(rows), "positive": sum(r["label"] for r in rows),
                               "items": len(used[s]), "fitb": len(fitb.get(s, []))}
                           for s, rows in cleaned.items()},
        "cleaned_overlap_checks_passed": True,
        "limitations": ["dHash equality excludes conservative near-duplicate candidates, not all near duplicates.",
                        "No curated physical-garment grouping is available; garment-level independence is not proven.",
                        "Filtered protocol is not directly comparable with original published benchmark numbers.",
                        "Labels describe curated outfits versus synthetic negatives, not universal aesthetic truth."],
        "seconds": time.perf_counter() - start,
    }
    (OUT / "benchmark.json").write_text(json.dumps({"splits": cleaned, "fitb": fitb,
        "categories": categories,
        "item_categories": {i: categories.get(metadata.get(i, {}).get("semantic_category", "unknown"), 0)
                            for ids in all_ids.values() for i in ids}}, indent=1))
    (OUT / "audit.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2), flush=True)


if __name__ == "__main__":
    main()
