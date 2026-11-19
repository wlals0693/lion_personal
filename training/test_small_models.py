import unittest

import torch

from small_models import build_model


class SmallModelTests(unittest.TestCase):
    def setUp(self):
        torch.set_num_threads(2)
        torch.manual_seed(42)
        self.x = torch.randn(2, 4, 512)
        self.c = torch.tensor([[1, 2, 3, 0], [2, 3, 1, 4]])
        self.valid = torch.tensor([[True, True, True, False], [True, True, True, True]])

    def test_order_and_padding_invariance(self):
        for name in ("pooled_set32", "tiny_transformer32"):
            with self.subTest(model=name), torch.no_grad():
                model = build_model(name, 12).eval()
                expected = model(self.x, self.c, self.valid)
                order = [2, 0, 3, 1]
                torch.testing.assert_close(expected, model(self.x[:, order], self.c[:, order], self.valid[:, order]),
                                           atol=1e-6, rtol=1e-5)
                other = self.x.clone()
                other[0, 3] = 100
                torch.testing.assert_close(expected, model(other, self.c, self.valid))

    def test_finite_training_gradients_and_smaller_size(self):
        for name in ("pooled_set32", "tiny_transformer32"):
            with self.subTest(model=name):
                model = build_model(name, 12).train()
                loss = torch.nn.functional.binary_cross_entropy_with_logits(
                    model(self.x, self.c, self.valid), torch.tensor([1., 0.]))
                loss.backward()
                self.assertTrue(all(torch.isfinite(p.grad).all() for p in model.parameters() if p.grad is not None))
                self.assertLess(sum(p.numel() for p in model.parameters()), 332673 // 10)


if __name__ == "__main__":
    unittest.main()
