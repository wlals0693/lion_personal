"""Fixed-budget smaller-model comparison on an ALREADY OBSERVED benchmark.

Exploratory follow-up, not fresh independent confirmation. No test selection.
Original files and results remain unchanged. Validation BCE selects checkpoints.
"""
import hashlib
import json
import os
import random
import time
from pathlib import Path

os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")
import numpy as np
import torch
from threadpoolctl import threadpool_limits

from small_models import build_model
from train_compatibility import Examples, fitb_accuracy, metrics, predict

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "prepared"
RUN = ROOT / "runs" / "small_comparison_01"
ORIGINAL = ROOT / "runs" / "compatibility_01"


def inputs(examples):
    return examples.x, examples.c, examples.mask


def fit(name, seed, categories, train, validation, benchmark_sha):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    model = build_model(name, categories).cuda()
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.0003, weight_decay=0.1)
    generator = torch.Generator().manual_seed(seed)
    tag = f"{name}_seed{seed}"
    checkpoint = RUN / f"{tag}.pt"
    best, best_epoch, stale, history = float("inf"), 0, 0, []
    start = time.perf_counter()
    for epoch in range(1, 31):
        model.train()
        total_loss = 0.
        for indices in torch.randperm(len(train.y), generator=generator).split(256):
            optimizer.zero_grad(set_to_none=True)
            batch = [x[indices].cuda() for x in inputs(train)]
            loss = torch.nn.functional.binary_cross_entropy_with_logits(model(*batch), train.y[indices].cuda())
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total_loss += float(loss.detach()) * len(indices)
        train_eval = metrics(train.y.numpy(), predict(model, inputs(train)))
        val = metrics(validation.y.numpy(), predict(model, inputs(validation)))
        row = {"epoch": epoch, "train_dropout_loss": total_loss / len(train.y),
               "train_eval": train_eval, "validation": val}
        history.append(row)
        (RUN / f"{tag}_history.json").write_text(json.dumps(history, indent=2))
        if val["loss"] < best - 0.0001:
            best, best_epoch, stale = val["loss"], epoch, 0
            torch.save({"state_dict": model.state_dict(), "family": name, "seed": seed,
                        "category_count": categories, "epoch": epoch,
                        "benchmark_sha256": benchmark_sha}, checkpoint)
        else:
            stale += 1
        if epoch % 5 == 0 or stale >= 5:
            print(json.dumps({"model": tag, **row, "best_epoch": best_epoch}), flush=True)
        if stale >= 5:
            break
    model.load_state_dict(torch.load(checkpoint, weights_only=True)["state_dict"])
    result = {"name": tag, "family": name, "seed": seed,
              "parameters": sum(p.numel() for p in model.parameters()),
              "best_epoch": best_epoch, "stopped_epoch": len(history), "history": history,
              "train": metrics(train.y.numpy(), predict(model, inputs(train))),
              "validation": metrics(validation.y.numpy(), predict(model, inputs(validation))),
              "fitb_validation": fitb_accuracy(lambda x: predict(model, x), validation),
              "training_seconds_including_eval": time.perf_counter() - start}
    result["auc_train_minus_validation"] = result["train"]["roc_auc"] - result["validation"]["roc_auc"]
    result["loss_validation_minus_train"] = result["validation"]["loss"] - result["train"]["loss"]
    (RUN / f"{tag}_validation.json").write_text(json.dumps(result, indent=2))
    print(json.dumps({"selected": tag, "best_epoch": best_epoch,
                      "train": result["train"], "validation": result["validation"]}), flush=True)
    return result


def summarize(rows):
    fields = {"train_auc": lambda r: r["train"]["roc_auc"],
              "validation_auc": lambda r: r["validation"]["roc_auc"],
              "test_auc": lambda r: r["test"]["roc_auc"],
              "test_ap": lambda r: r["test"]["pr_auc"],
              "test_bce": lambda r: r["test"]["loss"],
              "fitb_test_accuracy": lambda r: r["fitb_test"]["accuracy"],
              "auc_train_minus_validation": lambda r: r["train"]["roc_auc"] - r["validation"]["roc_auc"],
              "loss_validation_minus_train": lambda r: r["validation"]["loss"] - r["train"]["loss"]}
    return {key: {"mean": float(np.mean(values := [value(row) for row in rows])),
                  "seed_std": float(np.std(values, ddof=1)) if len(values) > 1 else None,
                  "min": float(min(values)), "max": float(max(values))}
            for key, value in fields.items()}


def main():
    if (RUN / "plan.json").exists():
        raise RuntimeError("Comparison run exists; preserve fixed plan and original artifacts")
    RUN.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(4)
    threadpool_limits(4)
    torch.use_deterministic_algorithms(True)
    torch.backends.cudnn.benchmark = False
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA required")
    benchmark_sha = hashlib.sha256((DATA / "benchmark.json").read_bytes()).hexdigest()
    original = json.loads((ORIGINAL / "results.json").read_text())
    assert benchmark_sha == original["config"]["benchmark_sha256"]
    plan = {"status": "exploratory_reused_benchmark", "benchmark_sha256": benchmark_sha,
            "new_families": ["pooled_set32", "tiny_transformer32"], "seeds": [42, 43, 44],
            "reference": "historical normalized_visual_v2 Transformer128x2, no retraining",
            "controls": {"encoder": "same cached frozen ResNet18 features", "batch": 256,
                         "optimizer": "AdamW", "learning_rate": 0.0003, "weight_decay": 0.1,
                         "dropout": 0.3, "max_epochs": 30, "patience": 5, "min_delta": 0.0001},
            "selection": "per-run minimum validation BCE; no family/seed selection by test",
            "test_caveat": "Test and validation metrics were observed in prior development. Not independent confirmation.",
            "new_curve_measure": "Both train_eval and validation use eval mode each epoch.",
            "code_sha256": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
                            for name in ("compare_small_models.py", "small_models.py", "compatibility_model.py")}}
    (RUN / "plan.json").write_text(json.dumps(plan, indent=2))
    benchmark = json.loads((DATA / "benchmark.json").read_text())
    train, validation = Examples("train", benchmark), Examples("validation", benchmark)
    categories = max(benchmark["categories"].values()) + 1
    selected = []
    for name in plan["new_families"]:
        for seed in plan["seeds"]:
            selected.append(fit(name, seed, categories, train, validation, benchmark_sha))
    (RUN / "validation_selection.json").write_text(json.dumps({"plan": plan, "runs": selected}, indent=2))
    # Only after freezing all checkpoints, obtain descriptive reused-test readouts.
    test = Examples("test", benchmark)
    for row in selected:
        model = build_model(row["family"], categories).cuda().eval()
        checkpoint = torch.load(RUN / f"{row['name']}.pt", weights_only=True)
        model.load_state_dict(checkpoint["state_dict"])
        logits = predict(model, inputs(test))
        row["test"] = metrics(test.y.numpy(), logits)
        row["fitb_test"] = fitb_accuracy(lambda x: predict(model, x), test)
        np.savez(RUN / f"{row['name']}_test_predictions.npz", logits=logits, labels=test.y.numpy())
    references = []
    for historical in original["results"]:
        row = dict(historical)
        row["family"] = "transformer128x2" if "seed" in row else row["name"]
        row["origin"] = "historical compatibility_01"
        # Logistic has 512 means + 512 stds + 12 category fractions + count + intercept.
        row.setdefault("parameters", 14 if row["name"] == "category_only" else 1038)
        references.append(row)
    all_rows = references + selected
    families = {name: summarize([r for r in all_rows if r["family"] == name])
                for name in sorted({r["family"] for r in all_rows})}
    output = {"plan": plan, "results": all_rows, "summary": families,
              "limitations": ["Reused test is exploratory, not a new untouched test.",
                "Same frozen features and optimizer do not imply equal optimal hyperparameters across architectures.",
                "Smaller models can underfit; a small train/validation gap alone is not success.",
                "Seed standard deviation is not a confidence interval; outfit dependence remains.",
                "No new human evaluation, new image data, Qwen head-to-head, or web deployment."]}
    (RUN / "results.json").write_text(json.dumps(output, indent=2))
    print(json.dumps({"completed": True, "summary": families}, indent=2), flush=True)


if __name__ == "__main__":
    main()
