# Local compatibility research

See [the experiment protocol](../docs/OUTFIT_TRAINING_PROTOCOL.md). This is a lightweight research-inspired classifier, not an exact OutfitTransformer reproduction or a calibrated style rating.

Run from the workspace parent of `lion_personal`:

```powershell
lion_personal/training/.venv/Scripts/python.exe lion_personal/training/download_polyvore.py --check
lion_personal/training/.venv/Scripts/python.exe lion_personal/training/download_polyvore.py
lion_personal/training/.venv/Scripts/python.exe lion_personal/training/prepare_polyvore.py
lion_personal/training/.venv/Scripts/python.exe lion_personal/training/train_compatibility.py
```

The downloader reads only `HF_TOKEN` from `.env.local`, passes it directly to the official hub client, and never logs it. Access conditions must have been accepted by the account holder. Dataset revision is pinned. `.env.local`, the venv, caches, data and runs are ignored by Git.

Dependencies are pinned in `requirements-lock.txt`; install CUDA torch/torchvision from the official cu128 wheel index. The feature extractor uses the official torchvision ResNet18 ImageNet1K V1 weights. CPU preprocessing uses a thread pool; inference uses CUDA fp16 autocast. Features are cached separately for each official disjoint split.

`data/prepared/audit.json` reports item IDs, image bytes, decoded pixels and conservative dHash/aspect candidates crossing splits. All members of cross-split collision groups are excluded, along with items matching the prior 60-photo registration collection. This does not establish complete near-duplicate or physical-garment independence. The resulting filtered protocol differs from the published benchmark.

Training uses validation BCE to choose weight decay, stop epochs, and select logistic regularization. Seeds 43 and 44 repeat the choice made on seed 42. Selection is written before test evaluation. An existing final `results.json` blocks accidental same-run retuning. Classification metrics and 4-choice FITB are separate tasks; no retrieval-specific training is performed.

Outputs in `runs/compatibility_01` include config, per-epoch learning curves, checkpoints, validation selection, test predictions and final results. Do not call sigmoid scores aesthetic probabilities or use the test set to repeatedly tune the model. Human assessment on newly collected outfits is still required before product validation. The web currently uses its existing Qwen evaluator.

Tests:

```powershell
lion_personal/training/.venv/Scripts/python.exe -m unittest discover -s lion_personal/training -p 'test_*.py'
```

Research and data attribution:

- Vasileva et al., *Learning Type-Aware Embeddings for Fashion Compatibility*, ECCV 2018: https://github.com/mvasil/fashion-compatibility
- Sarkar et al., *OutfitTransformer: Learning Outfit Representations for Fashion Recommendation*, WACV 2023: https://openaccess.thecvf.com/content/WACV2023/html/Sarkar_OutfitTransformer_Learning_Outfit_Representations_for_Fashion_Recommendation_WACV_2023_paper.html
- Official Polyvore dataset: https://huggingface.co/datasets/mvasil/polyvore-outfits
- Official torchvision image encoder: https://docs.pytorch.org/vision/stable/models/generated/torchvision.models.resnet18.html

Data card lists CC BY 4.0 and research access requirements; underlying image copyrights and intended product use need separate attention. This run filters and transforms the source data into frozen image embeddings; it does not redistribute the images.

## Smaller model comparison

`compare_small_models.py` runs two smaller heads (pooled set32 and Transformer32x1) on seeds 42/43/44 with fixed optimizer and stopping controls. The previously observed test is explicitly labeled exploratory; checkpoints use validation BCE. Existing baseline/Transformer results are retained. A preexisting `small_comparison_01/plan.json` blocks rerunning into that same directory.

`plot_small_comparison.py` renders recorded results and CSV without fitting. New per-epoch curves record train and validation in eval mode. See [the comparison report](../docs/SMALL_MODEL_COMPARISON_REPORT.md) and [the full GPU handoff](../docs/GPU_EXPERIMENT_FULL_HANDOFF.md). Neither new model is connected to the web.
