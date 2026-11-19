"""Score 2-8 local garment images using the preselected primary research model.

Example: --item tops=shirt.jpg --item bottoms=pants.jpg --item shoes=shoes.jpg
Output is an uncalibrated compatibility logit, never a percentage or style label.
"""
import argparse
import hashlib
import json
import os
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.environ.setdefault("TORCH_HOME", str(ROOT / ".cache" / "torch"))

import torch
from PIL import Image, ImageOps
from torchvision.models import ResNet18_Weights, resnet18

from compatibility_model import CompatibilityModel


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--item", action="append", required=True)
    args = parser.parse_args()
    if not 2 <= len(args.item) <= 8:
        parser.error("Provide 2-8 --item category=path arguments")
    torch.set_num_threads(2)
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA required for matching the recorded feature extraction")
    start = time.perf_counter()
    run = ROOT / "runs" / "compatibility_01"
    selection = json.loads((run / "validation_selection.json").read_text())
    config = json.loads((run / "config.json").read_text())
    benchmark_path = ROOT / "data" / "prepared" / "benchmark.json"
    if hashlib.sha256(benchmark_path.read_bytes()).hexdigest() != config["benchmark_sha256"]:
        raise RuntimeError("Benchmark/category mapping changed since training")
    categories = json.loads(benchmark_path.read_text())["categories"]
    checkpoint_name = f"seed42_wd{selection['weight_decay']}"
    checkpoint = torch.load(run / f"{checkpoint_name}.pt", map_location="cpu", weights_only=True)
    images, ids = [], []
    transform = ResNet18_Weights.IMAGENET1K_V1.transforms()
    for value in args.item:
        category, separator, path = value.partition("=")
        if not separator or category not in categories:
            parser.error("Use category=path with category from: " + ", ".join(categories))
        with Image.open(path) as source:
            images.append(transform(ImageOps.exif_transpose(source).convert("RGB")))
        ids.append(categories[category])
    encoder = resnet18(weights=ResNet18_Weights.IMAGENET1K_V1).eval().cuda()
    encoder.fc = torch.nn.Identity()
    model = CompatibilityModel(categories=checkpoint["category_count"]).eval().cuda()
    model.load_state_dict(checkpoint["state_dict"])
    with torch.inference_mode():
        with torch.autocast("cuda", dtype=torch.float16):
            features = torch.nn.functional.normalize(encoder(torch.stack(images).cuda()), dim=1)
        features = features.float().unsqueeze(0)
        c = torch.tensor([ids], device="cuda")
        valid = torch.ones((1, len(ids)), dtype=torch.bool, device="cuda")
        logit = float(model(features, c, valid)[0])
    print(json.dumps({"model": checkpoint_name, "compatibility_logit": logit,
        "items": len(images), "seconds_including_model_load": time.perf_counter() - start,
        "status": "research_only_uncalibrated", "not_an_aesthetic_probability": True}, indent=2))


if __name__ == "__main__":
    main()
