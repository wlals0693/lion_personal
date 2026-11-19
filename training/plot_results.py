"""Plot recorded learning curves without fitting or selecting any new model."""
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
    run = ROOT / "runs" / "compatibility_01"
    report = json.loads((run / "results.json").read_text())
    selection = json.loads((run / "validation_selection.json").read_text())
    fig, axes = plt.subplots(1, 2, figsize=(12, 4.6), layout="constrained")
    for row in selection["experiments"]:
        history = row["history"]
        axes[0].plot([h["epoch"] for h in history],
                     [h["validation"]["loss"] for h in history], label=row["name"])
    axes[0].set(title="Validation loss: all planned runs", xlabel="Epoch", ylabel="BCE")
    axes[0].legend(fontsize=8)
    primary = next(row for row in report["results"] if row.get("seed") == 42)
    history = primary["history"]
    axes[1].plot([h["epoch"] for h in history], [h["train_dropout_loss"] for h in history],
                 label="Train (dropout active)")
    axes[1].plot([h["epoch"] for h in history], [h["validation"]["loss"] for h in history],
                 label="Validation (eval mode)")
    axes[1].axvline(primary["best_epoch"], color="gray", linestyle="--", label="Selected epoch")
    axes[1].set(title="Primary seed: losses use different modes", xlabel="Epoch", ylabel="BCE")
    axes[1].legend(fontsize=8)
    for axis in axes:
        axis.grid(alpha=.2)
    fig.savefig(run / "learning_curves.png", dpi=180)
    plt.close(fig)
    columns = ["name", "train_roc_auc", "validation_roc_auc", "test_roc_auc",
               "test_pr_auc", "test_loss", "fitb_accuracy", "fitb_questions", "best_epoch"]
    with (run / "comparison.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in report["results"]:
            writer.writerow({"name": row["name"], "train_roc_auc": row["train"]["roc_auc"],
                "validation_roc_auc": row["validation"]["roc_auc"], "test_roc_auc": row["test"]["roc_auc"],
                "test_pr_auc": row["test"]["pr_auc"], "test_loss": row["test"]["loss"],
                "fitb_accuracy": row["fitb_test"]["accuracy"], "fitb_questions": row["fitb_test"]["questions"],
                "best_epoch": row.get("best_epoch", "")})
    trained = [row for row in report["results"] if "seed" in row]
    print(json.dumps({"test_auc_mean": float(np.mean([r["test"]["roc_auc"] for r in trained])),
                      "test_auc_seed_std": float(np.std([r["test"]["roc_auc"] for r in trained], ddof=1)),
                      "note": "Seed standard deviation is not a confidence interval.",
                      "plot": str(run / "learning_curves.png")}, indent=2))


if __name__ == "__main__":
    main()
