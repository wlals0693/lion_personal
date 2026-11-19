"""Lightweight set compatibility head inspired by OutfitTransformer.

Not a reproduction or pretrained OutfitTransformer. Takes frozen image features;
no outfit position embeddings, so garment order does not define the prediction.
"""
import torch
from torch import nn


class CompatibilityModel(nn.Module):
    def __init__(self, feature_dim=512, categories=16, hidden=128, dropout=0.3, layers=2):
        super().__init__()
        self.projection = nn.Linear(feature_dim, hidden)
        self.category = nn.Embedding(categories, hidden)
        self.token = nn.Parameter(torch.zeros(1, 1, hidden))
        nn.init.normal_(self.category.weight, std=0.02)
        nn.init.normal_(self.token, std=0.02)
        layer = nn.TransformerEncoderLayer(
            hidden, nhead=4, dim_feedforward=hidden * 2, dropout=dropout,
            activation="gelu", batch_first=True,
        )
        self.encoder = nn.TransformerEncoder(layer, num_layers=layers, enable_nested_tensor=False)
        # TransformerEncoder clones layers; initialize their matrix weights independently.
        for encoder_layer in self.encoder.layers:
            for parameter in encoder_layer.parameters():
                if parameter.dim() > 1:
                    nn.init.xavier_uniform_(parameter)
        self.head = nn.Sequential(nn.LayerNorm(hidden), nn.Dropout(dropout), nn.Linear(hidden, 1))

    def forward(self, features, category_ids, valid):
        if not valid.any(dim=1).all():
            raise ValueError("Each outfit needs at least one visible item")
        # L2-normalized frozen features have very small per-coordinate variance.
        # Normalize their scale before mixing visual and category embeddings.
        normalized = torch.nn.functional.layer_norm(features, (features.shape[-1],))
        x = self.projection(normalized) + self.category(category_ids)
        x = torch.cat([self.token.expand(x.size(0), -1, -1), x], dim=1)
        padding = torch.cat([torch.zeros_like(valid[:, :1]), ~valid], dim=1)
        return self.head(self.encoder(x, src_key_padding_mask=padding)[:, 0]).squeeze(-1)
