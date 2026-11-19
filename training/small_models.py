"""Smaller, permutation-invariant frozen-feature heads for a fixed comparison."""
import torch
from torch import nn

from compatibility_model import CompatibilityModel


class PooledSetModel(nn.Module):
    def __init__(self, categories, hidden=32, dropout=0.3):
        super().__init__()
        self.projection = nn.Linear(512, hidden)
        self.category = nn.Embedding(categories, hidden)
        nn.init.normal_(self.category.weight, std=0.02)
        self.head = nn.Sequential(nn.LayerNorm(hidden * 2), nn.Linear(hidden * 2, 16),
                                  nn.GELU(), nn.Dropout(dropout), nn.Linear(16, 1))

    def forward(self, features, category_ids, valid):
        if not valid.any(dim=1).all():
            raise ValueError("Each outfit needs at least one visible item")
        x = torch.nn.functional.layer_norm(features, (features.shape[-1],))
        x = torch.nn.functional.gelu(self.projection(x) + self.category(category_ids))
        weight = valid.unsqueeze(-1).to(x.dtype)
        count = weight.sum(dim=1).clamp_min(1)
        mean = (x * weight).sum(dim=1) / count
        variance = ((x - mean.unsqueeze(1)).square() * weight).sum(dim=1) / count
        summary = torch.cat([mean, (variance + 1e-6).sqrt()], dim=1)
        return self.head(summary).squeeze(-1)


def build_model(name, categories):
    if name == "pooled_set32":
        return PooledSetModel(categories=categories)
    if name == "tiny_transformer32":
        return CompatibilityModel(categories=categories, hidden=32, layers=1, dropout=0.3)
    raise ValueError(f"Unknown comparison model: {name}")
