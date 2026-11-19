"""Train small frozen-feature compatibility heads with validation-only selection.

Writes all learning curves and evaluates held-out test only after model selection.
Scores are benchmark logits, not calibrated personal aesthetic probabilities.
"""
import hashlib
import json
import random
import time
from pathlib import Path

import numpy as np
import torch
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, log_loss, roc_auc_score
from threadpoolctl import threadpool_limits

from compatibility_model import CompatibilityModel

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "prepared"
RUN = ROOT / "runs" / "compatibility_01"


def metrics(y, logits):
    probability = 1 / (1 + np.exp(-np.clip(logits, -40, 40)))
    return {"roc_auc": float(roc_auc_score(y, probability)),
            "pr_auc": float(average_precision_score(y, probability)),
            "loss": float(log_loss(y, probability, labels=[0, 1]))}


class Examples:
    def __init__(self, split, benchmark):
        cache = np.load(DATA / f"{split}_features.npz")
        self.features = cache["features"]
        self.ids = cache["ids"].tolist()
        self.index = {key: i for i, key in enumerate(self.ids)}
        self.categories = benchmark["item_categories"]
        self.rows = benchmark["splits"][split]
        self.fitb = benchmark["fitb"].get(split, [])
        self.x, self.c, self.mask = self.pack([r["items"] for r in self.rows])
        self.y = torch.tensor([r["label"] for r in self.rows], dtype=torch.float32)

    def pack(self, outfits):
        x = np.zeros((len(outfits), 8, 512), dtype=np.float32)
        c = np.zeros((len(outfits), 8), dtype=np.int64)
        mask = np.zeros((len(outfits), 8), dtype=bool)
        for row, ids in enumerate(outfits):
            x[row, :len(ids)] = self.features[[self.index[key] for key in ids]]
            c[row, :len(ids)] = [self.categories[key] for key in ids]
            mask[row, :len(ids)] = True
        return torch.from_numpy(x), torch.from_numpy(c), torch.from_numpy(mask)


def predict(model, inputs):
    model.eval()
    values = []
    with torch.inference_mode():
        for start in range(0, len(inputs[0]), 256):
            batch = [x[start:start + 256].to("cuda") for x in inputs]
            values.append(model(*batch).cpu().numpy())
    return np.concatenate(values)


def fitb_accuracy(score, examples):
    if not examples.fitb:
        return {"accuracy": None, "questions": 0}
    predictions = []
    for start in range(0, len(examples.fitb), 128):
        rows = examples.fitb[start:start + 128]
        outfits = [r["question"] + [answer] for r in rows for answer in r["answers"]]
        logits = score(examples.pack(outfits)).reshape(-1, 4)
        predictions.extend(np.argmax(logits, axis=1) == [r["correct"] for r in rows])
    return {"accuracy": float(np.mean(predictions)), "questions": len(predictions)}


def summary_features(inputs, category_count, only_categories=False):
    x, categories, valid = [part.numpy() for part in inputs]
    count = valid.sum(axis=1, keepdims=True)
    bag = np.stack([((categories == i) & valid).astype(float).sum(axis=1) / count[:, 0]
                    for i in range(category_count)], axis=1)
    if only_categories:
        return np.concatenate([bag, count / 8], axis=1)
    mean = x.sum(axis=1) / count
    variance = np.maximum((x * x).sum(axis=1) / count - mean * mean, 0)
    return np.concatenate([mean, np.sqrt(variance), bag, count / 8], axis=1)


def fit(seed, weight_decay, train, validation, category_count):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    model = CompatibilityModel(categories=category_count, dropout=0.3).to("cuda")
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.0003, weight_decay=weight_decay)
    generator = torch.Generator().manual_seed(seed)
    best, best_epoch, stale, history = float("inf"), 0, 0, []
    name = f"seed{seed}_wd{weight_decay}"
    checkpoint = RUN / f"{name}.pt"
    for epoch in range(1, 31):
        begin = time.perf_counter()
        model.train()
        losses = []
        order = torch.randperm(len(train.y), generator=generator)
        for indices in order.split(256):
            optimizer.zero_grad(set_to_none=True)
            logits = model(train.x[indices].to("cuda"), train.c[indices].to("cuda"),
                           train.mask[indices].to("cuda"))
            loss = torch.nn.functional.binary_cross_entropy_with_logits(logits, train.y[indices].to("cuda"))
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            losses.append((float(loss.detach()), len(indices)))
        val = metrics(validation.y.numpy(), predict(model, (validation.x, validation.c, validation.mask)))
        row = {"epoch": epoch, "train_dropout_loss": sum(a*b for a,b in losses)/len(train.y),
               "validation": val, "seconds": time.perf_counter() - begin}
        history.append(row)
        (RUN / f"{name}_history.json").write_text(json.dumps(history, indent=2))
        print(json.dumps({"run": name, **row}), flush=True)
        if val["loss"] < best - 0.0001:
            best, best_epoch, stale = val["loss"], epoch, 0
            torch.save({"state_dict": model.state_dict(), "seed": seed,
                        "weight_decay": weight_decay, "category_count": category_count,
                        "epoch": epoch, "feature_dim": 512, "hidden": 128,
                        "dropout": 0.3, "benchmark_sha256": BENCHMARK_SHA}, checkpoint)
        else:
            stale += 1
        if stale >= 5:
            break
    state = torch.load(checkpoint, weights_only=True)
    model.load_state_dict(state["state_dict"])
    result = {"name": name, "seed": seed, "weight_decay": weight_decay,
              "best_epoch": best_epoch, "history": history,
              "train": metrics(train.y.numpy(), predict(model, (train.x, train.c, train.mask))),
              "validation": metrics(validation.y.numpy(), predict(model, (validation.x, validation.c, validation.mask))),
              "parameters": sum(p.numel() for p in model.parameters())}
    (RUN / f"{name}.json").write_text(json.dumps(result, indent=2))
    return model, result


BENCHMARK_SHA = ""


def main():
    global BENCHMARK_SHA
    if (RUN / "results.json").exists():
        raise RuntimeError("Held-out test already evaluated for this run; do not retune against it")
    RUN.mkdir(parents=True, exist_ok=True)
    start = time.perf_counter()
    torch.set_num_threads(4)
    threadpool_limits(limits=4)
    torch.backends.cudnn.benchmark = False
    torch.use_deterministic_algorithms(True)
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA unavailable")
    audit = json.loads((DATA / "audit.json").read_text())
    assert audit["cleaned_overlap_checks_passed"]
    BENCHMARK_SHA = hashlib.sha256((DATA / "benchmark.json").read_bytes()).hexdigest()
    benchmark = json.loads((DATA / "benchmark.json").read_text())
    train = Examples("train", benchmark)
    validation = Examples("validation", benchmark)
    category_count = max(benchmark["categories"].values()) + 1
    config = {"architecture_revision": "normalized_visual_v2",
              "benchmark_sha256": BENCHMARK_SHA, "gpu": torch.cuda.get_device_name(),
              "torch": torch.__version__, "category_count": category_count,
              "seeds": [42, 43, 44], "weight_decay_candidates": [0.01, 0.1],
              "dropout": 0.3, "epochs_max": 30, "patience": 5,
              "learning_rate": 0.0003, "batch_size": 256,
              "encoder_frozen": True, "selection": "minimum validation BCE; no test selection"}
    (RUN / "config.json").write_text(json.dumps(config, indent=2))
    baselines = []
    for category_only in (True, False):
        candidates = []
        tx = summary_features((train.x, train.c, train.mask), category_count, category_only)
        vx = summary_features((validation.x, validation.c, validation.mask), category_count, category_only)
        for c in (0.01, 1.0):
            estimator = LogisticRegression(C=c, max_iter=500, random_state=42)
            estimator.fit(tx, train.y.numpy())
            val = metrics(validation.y.numpy(), estimator.decision_function(vx))
            candidates.append((val["loss"], estimator, val, c))
        _, estimator, val, c = min(candidates, key=lambda entry: entry[0])
        baselines.append((estimator, {"name": "category_only" if category_only else "pooled_image_logistic",
            "C": c, "validation": val, "category_only": category_only,
            "train": metrics(train.y.numpy(), estimator.decision_function(tx))}))
        print(json.dumps(baselines[-1][1]), flush=True)
    models, experiments = [], []
    for wd in (0.01, 0.1):
        model, result = fit(42, wd, train, validation, category_count)
        models.append(model)
        experiments.append(result)
    chosen_index = min(range(2), key=lambda i: experiments[i]["validation"]["loss"])
    chosen_wd = experiments[chosen_index]["weight_decay"]
    selected_models = [(models[chosen_index], experiments[chosen_index])]
    del models
    for seed in (43, 44):
        model, result = fit(seed, chosen_wd, train, validation, category_count)
        selected_models.append((model, result))
        experiments.append(result)
    selection = {"weight_decay": chosen_wd, "primary_seed": 42,
                 "selected_runs": [r["name"] for _, r in selected_models],
                 "baselines": [r for _, r in baselines], "experiments": experiments}
    # Freeze validation choices to disk BEFORE looking at the held-out test.
    (RUN / "validation_selection.json").write_text(json.dumps(selection, indent=2))
    test = Examples("test", benchmark)
    results = []
    for estimator, result in baselines:
        category_only = result["category_only"]
        score = lambda inputs: estimator.decision_function(summary_features(inputs, category_count, category_only))
        result["test"] = metrics(test.y.numpy(), score((test.x, test.c, test.mask)))
        result["fitb_test"] = fitb_accuracy(score, test)
        results.append(result)
    for model, result in selected_models:
        score = lambda inputs: predict(model, inputs)
        logits = score((test.x, test.c, test.mask))
        result["test"] = metrics(test.y.numpy(), logits)
        result["fitb_test"] = fitb_accuracy(score, test)
        result["auc_train_minus_validation"] = result["train"]["roc_auc"] - result["validation"]["roc_auc"]
        np.savez(RUN / f"{result['name']}_test_predictions.npz", logits=logits, labels=test.y.numpy())
        results.append(result)
    report = {"status": "completed_local_research_experiment", "config": config,
              "audit": audit, "results": results, "seconds": time.perf_counter() - start,
              "torch_peak_allocated_bytes": torch.cuda.max_memory_allocated(),
              "limitations": ["Lightweight research-inspired model, not exact OutfitTransformer reproduction.",
                "Filtered Polyvore benchmark does not establish personal wardrobe recommendation quality.",
                "Synthetic negatives and residual near-duplicate/physical-garment uncertainty remain.",
                "No human rating evaluation or Qwen head-to-head comparison yet.",
                "No group-bootstrap confidence intervals computed in this first run.",
                "Not deployed to web; model scores are not calibrated aesthetic probabilities."]}
    (RUN / "results.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({"completed": True, "seconds": report["seconds"],
                      "scores": [{"name": r["name"], "test": r["test"], "fitb_test": r["fitb_test"]}
                                 for r in results]}, indent=2), flush=True)


if __name__ == "__main__":
    # cuBLAS deterministic workspace must be set before CUDA context creation.
    import os
    os.environ["CUBLAS_WORKSPACE_CONFIG"] = ":4096:8"
    main()
