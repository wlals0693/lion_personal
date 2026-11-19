import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from audit_dataset import audit


class AuditTests(unittest.TestCase):
    def fixture(self, root):
        items, splits = [], {}
        for index, split in enumerate(("train", "validation", "test")):
            ids = []
            for j in range(4):
                key = f"{split}_{j}"
                Image.new("RGB", (8, 8), (index * 60, j * 50, 20)).save(root / f"{key}.png")
                items.append({"id": key, "path": f"{key}.png", "group_id": key})
                ids.append(key)
            splits[split] = [
                {"id": f"{split}_positive", "items": ids[:2], "label": 1},
                {"id": f"{split}_negative", "items": ids[2:], "label": 0},
            ]
        return {"items": items, "splits": splits}

    def run_case(self, mutate=None):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = self.fixture(root)
            if mutate:
                mutate(data, root)
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps(data), encoding="utf-8")
            return audit(manifest)

    def test_disjoint_passes(self):
        self.assertTrue(self.run_case()["passed"])

    def test_reused_item_fails(self):
        result = self.run_case(lambda d, _: d["splits"]["test"][0]["items"].__setitem__(0, "train_0"))
        self.assertIn("item overlap: train / test", result["errors"])

    def test_reencoded_identical_pixels_fail(self):
        def change(data, root):
            with Image.open(root / "train_0.png") as image:
                image.save(root / "test_0.png", compress_level=0)
        self.assertIn("pixels overlap: train / test", self.run_case(change)["errors"])

    def test_same_garment_different_photos_fail(self):
        result = self.run_case(lambda d, _: d["items"][8].update(group_id="train_0"))
        self.assertIn("garment overlap: train / test", result["errors"])

    def test_duplicates_fail(self):
        result = self.run_case(lambda d, _: d["splits"]["train"].append(d["splits"]["train"][0]))
        self.assertFalse(result["passed"])

    def test_missing_group_fails(self):
        with self.assertRaises(ValueError):
            self.run_case(lambda d, _: d["items"][0].pop("group_id"))


if __name__ == "__main__":
    unittest.main()
