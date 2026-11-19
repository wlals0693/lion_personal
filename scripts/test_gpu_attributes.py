"""Boundary checks for unclear/malformed model attributes, without model inference."""
import unittest
from gpu_service import attributes

class AttributesTest(unittest.TestCase):
    def test_nulls_do_not_become_casual_or_white(self):
        result = attributes({'type':'shirt', 'name':None, 'color':None, 'style':None,
                             'pattern':None, 'neckline':None, 'material_guess':None})
        self.assertEqual(result['color'], '잘 모르겠어요')
        self.assertEqual(result['style'], '잘 모르겠어요')
        self.assertEqual(result['materialGuess'], '')
        self.assertIn('style', result['uncertainFields'])
        self.assertIn('materialGuess', result['uncertainFields'])

    def test_invalid_values_are_safe_but_valid_values_and_uncertainty_survive(self):
        result = attributes({'type':'shirt', 'name':' 파란 셔츠 ', 'color':['블루'], 'style':'클래식',
                             'pattern':'무지', 'neckline':'카라', 'material_guess':'면 느낌',
                             'uncertain_fields':['style', 'material_guess', 'not_a_field', 1]})
        self.assertEqual(result['name'], '셔츠')
        self.assertEqual(result['color'], '잘 모르겠어요')
        self.assertEqual(result['style'], '클래식')
        self.assertEqual(result['materialGuess'], '면 느낌')
        self.assertEqual(result['uncertainFields'], ['color', 'materialGuess', 'style'])

    def test_free_text_does_not_leak_into_attributes_or_generated_name(self):
        result = attributes({'type':'shirt', 'color':'네이비', 'name':'브랜드 광고',
                             'neckline':'คอ셔츠', 'material_guess':'공기통', 'pattern':'알 수 없는 문장'})
        self.assertEqual(result['name'], '네이비 셔츠')
        self.assertEqual(result['neckline'], '')
        self.assertEqual(result['materialGuess'], '')
        self.assertEqual(result['pattern'], '')

if __name__ == '__main__': unittest.main()
