import unittest

import torch

from compatibility_model import CompatibilityModel


class ModelTests(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(42)
        torch.set_num_threads(2)
        self.model = CompatibilityModel().eval()
        self.x = torch.randn(2, 4, 512)
        self.c = torch.tensor([[1, 2, 3, 0], [2, 3, 1, 4]])
        self.valid = torch.tensor([[True, True, True, False], [True, True, True, True]])

    def test_permutation_invariant(self):
        order = torch.tensor([2, 0, 3, 1])
        with torch.no_grad():
            expected = self.model(self.x, self.c, self.valid)
            actual = self.model(self.x[:, order], self.c[:, order], self.valid[:, order])
        torch.testing.assert_close(expected, actual, atol=1e-6, rtol=1e-5)

    def test_padding_does_not_change_score(self):
        other = self.x.clone()
        other[0, 3] = 100
        with torch.no_grad():
            torch.testing.assert_close(self.model(self.x, self.c, self.valid),
                                       self.model(other, self.c, self.valid))

    def test_training_has_finite_gradients(self):
        self.model.train()
        loss = torch.nn.functional.binary_cross_entropy_with_logits(
            self.model(self.x, self.c, self.valid), torch.tensor([1., 0.]))
        loss.backward()
        self.assertTrue(all(torch.isfinite(p.grad).all() for p in self.model.parameters()
                            if p.grad is not None))


if __name__ == "__main__":
    unittest.main()
