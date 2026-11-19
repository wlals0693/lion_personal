"""Render recorded comparison curves and tables; never fit or tune a model."""
import csv
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.environ.setdefault("MPLCONFIGDIR", str(ROOT / ".cache" / "matplotlib"))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


def main():
    run = ROOT / "runs" / "small_comparison_01"
    report = json.loads((run / "results.json").read_text())
    fig, axes = plt.subplots(2, 2, figsize=(13, 9), layout="constrained")
    for axis, family, title in zip(axes[0], ["pooled_set32", "tiny_transformer32"],
                                   ["Pooled set 32: seed 42", "Tiny Transformer 32x1: seed 42"]):
        row = next(r for r in report["results"] if r["family"] == family and r.get("seed") == 42)
        history = row["history"]
        axis.plot([r["epoch"] for r in history], [r["train_eval"]["loss"] for r in history], label="Train (eval mode)")
        axis.plot([r["epoch"] for r in history], [r["validation"]["loss"] for r in history], label="Validation (eval mode)")
        axis.axvline(row["best_epoch"], color="gray", linestyle="--", label="Selected epoch")
        axis.set(title=title, xlabel="Epoch", ylabel="BCE")
        axis.legend(fontsize=8)
    families = ["pooled_image_logistic", "pooled_set32", "tiny_transformer32", "transformer128x2"]
    labels = ["Logistic\n1,038 params", "Pool32\n17,985 params", "Tiny32x1\n25,473 params", "Ref128x2\n332,673 params"]
    summary = report["summary"]
    positions = np.arange(len(families))
    for metric, offset, label in [("train_auc", -.24, "Train"), ("validation_auc", 0, "Validation"), ("test_auc", .24, "Reused test")]:
        means = [summary[f][metric]["mean"] for f in families]
        deviations = [summary[f][metric]["seed_std"] or 0 for f in families]
        axes[1, 0].bar(positions + offset, means, .24, yerr=deviations, capsize=3, label=label)
    axes[1, 0].set(title="Selected checkpoint AUC (seed mean +/- SD)", ylabel="ROC-AUC", ylim=(.4, .95))
    axes[1, 0].set_xticks(positions, labels, fontsize=8)
    axes[1, 0].legend(fontsize=8)
    means = [100 * summary[f]["fitb_test_accuracy"]["mean"] for f in families]
    deviations = [100 * (summary[f]["fitb_test_accuracy"]["seed_std"] or 0) for f in families]
    axes[1, 1].bar(positions, means, yerr=deviations, capsize=4, color=["#777777", "#3b82a0", "#7b6ab1", "#ce8c43"])
    axes[1, 1].axhline(25, color="gray", linestyle="--", label="Random-choice expectation")
    axes[1, 1].set_xticks(positions, labels, fontsize=8)
    axes[1, 1].set(title="4-choice FITB: reused test", ylabel="Accuracy (%)", ylim=(0, 55))
    axes[1, 1].legend(fontsize=8)
    for axis in axes.flat:
        axis.grid(axis="y", alpha=.2)
    fig.suptitle("Exploratory comparison on an already observed benchmark; seed SD is not a confidence interval", fontsize=11)
    fig.savefig(run / "comparison.png", dpi=180)
    plt.close(fig)
    with (run / "comparison.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["family", "name", "parameters", "seed", "best_epoch", "train_auc", "validation_auc",
                         "test_auc", "test_ap", "test_bce", "fitb_accuracy", "auc_train_minus_validation"])
        for row in report["results"]:
            writer.writerow([row["family"], row["name"], row["parameters"], row.get("seed", ""), row.get("best_epoch", ""),
                row["train"]["roc_auc"], row["validation"]["roc_auc"], row["test"]["roc_auc"], row["test"]["pr_auc"],
                row["test"]["loss"], row["fitb_test"]["accuracy"], row["train"]["roc_auc"] - row["validation"]["roc_auc"]])
    print("Comparison PNG and CSV written")


if __name__ == "__main__":
    main()
