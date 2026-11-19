"""Download the approved official dataset without logging credentials."""
import argparse
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REVISION = "22cc0c748c293a598e1df561a76abe96273cb76a"


def load_token():
    # Parse only HF_TOKEN; do not execute or print .env contents.
    token = os.environ.get("HF_TOKEN", "")
    if not token:
        for line in (ROOT.parent / ".env.local").read_text(encoding="utf-8-sig").splitlines():
            key, separator, value = line.partition("=")
            if separator and key.strip() == "HF_TOKEN":
                token = value.strip().strip("\"'")
                break
    if not token.startswith("hf_"):
        raise RuntimeError("Missing or invalid HF_TOKEN in .env.local")
    return token


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    os.environ["HF_HOME"] = str(ROOT / ".cache" / "huggingface")
    os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
    from huggingface_hub import hf_hub_download
    from huggingface_hub.errors import HfHubHTTPError
    token = load_token()
    files = ["disjoint/train.json", "disjoint/valid.json", "disjoint/test.json",
             "polyvore_item_metadata.json", "categories.csv", "README.md"]
    files += [f"disjoint/compatibility_{s}.txt" for s in ("train", "valid", "test")]
    files += [f"disjoint/fill_in_blank_{s}.json" for s in ("train", "valid", "test")]
    if not args.check:
        files += [f"data/disjoint/{s}.parquet" for s in ("train", "validation", "test")]
    else:
        files = ["disjoint/train.json"]
    try:
        for name in files:
            print(f"Downloading {name}", flush=True)
            hf_hub_download("mvasil/polyvore-outfits", name, repo_type="dataset",
                            revision=REVISION, token=token, local_dir=ROOT / "data" / "polyvore")
            print(f"Ready {name}", flush=True)
    except HfHubHTTPError as error:
        # Exception text/URLs are deliberately not printed.
        code = error.response.status_code if error.response is not None else None
        print(json.dumps({"access": "failed", "http_status": code}))
        raise SystemExit(1) from None
    print(json.dumps({"access": "approved", "revision": REVISION, "files": len(files)}))


if __name__ == "__main__":
    main()
