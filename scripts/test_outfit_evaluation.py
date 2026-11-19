import unittest
from outfit_evaluation import validate_evaluation
class EvaluationTest(unittest.TestCase):
    def test_valid_observations_survive_without_scores(self):
        value={'visual':'ordinary','context':'uncertain','reasons':[{'aspect':'color','observation':'색상 대비가 보입니다.'}],
               'contextReason':'직장 규정은 확인이 필요합니다.','limitations':['실제 핏은 알 수 없습니다.'],'score':99}
        result=validate_evaluation(value)
        self.assertNotIn('score',result)
        self.assertEqual(result['context'],'uncertain')
    def test_invalid_or_incomplete_model_judgment_is_rejected(self):
        for value in [{}, {'visual':99}, {'visual':'cohesive','context':'suitable','reasons':[]}]:
            with self.assertRaises(RuntimeError):validate_evaluation(value)
if __name__=='__main__':unittest.main()
