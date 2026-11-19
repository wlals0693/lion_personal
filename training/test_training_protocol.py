import io
import unittest

import numpy as np
import torch
from PIL import Image

from prepare_polyvore import fingerprint
from train_compatibility import metrics, summary_features


class ProtocolTests(unittest.TestCase):
    def test_pixel_hash_survives_reencoding(self):
        a, b = io.BytesIO(), io.BytesIO()
        image = Image.new("RGB", (16, 24), (30, 100, 200))
        image.save(a, format="PNG", compress_level=9)
        image.save(b, format="PNG", compress_level=0)
        _, x = fingerprint(a.getvalue())
        _, y = fingerprint(b.getvalue())
        self.assertNotEqual(x[0], y[0])
        self.assertEqual(x[1:], y[1:])

    def test_category_baseline_ignores_padding(self):
        x = torch.zeros(1, 8, 512)
        c = torch.tensor([[1, 2, 0, 0, 0, 0, 0, 0]])
        valid = torch.tensor([[True, True, False, False, False, False, False, False]])
        row = summary_features((x, c, valid), 3, True)[0]
        np.testing.assert_allclose(row, [0, .5, .5, .25])

    def test_binary_metrics_direction(self):
        self.assertEqual(metrics(np.array([0, 1]), np.array([-2., 2.]))["roc_auc"], 1.)
        self.assertEqual(metrics(np.array([0, 1]), np.array([2., -2.]))["roc_auc"], 0.)


if __name__ == "__main__":
    unittest.main()
