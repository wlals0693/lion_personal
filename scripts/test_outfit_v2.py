import base64
import io
import json
import unittest
from PIL import Image
from outfit_evaluation_v2 import normalize, evaluate_v2

def prediction():
    return {'visual':'ordinary','context':'suitable','decision':'recommend',
            'reasons':[{'aspect':'overall','items':[1,2],'evidence':'상의에는 그래픽이 있고 하의는 단색이다.','observation':'단색 하의가 상의의 그래픽을 받쳐줘요.'}],
            'contextReason':'편한 일상 외출에 사용할 수 있어요.','limitations':['실제 착용 핏은 확인할 수 없어요.']}

class EvidenceTests(unittest.TestCase):
    def test_linked_evidence(self):
        value = normalize(prediction(), ['a','b','c'])
        self.assertEqual(value['reasons'][0]['itemIds'], ['a','b'])
        self.assertEqual(value['decision'], 'recommend')

    def test_invalid_or_unobservable_evidence_is_held(self):
        for numbers in ([1,4],[1,1],[{'bad':1},2]):
            p = prediction(); p['reasons'][0]['items'] = numbers
            self.assertEqual(normalize(p,['a','b','c'])['decision'],'hold')
        p = prediction(); p['reasons'][0]['observation']='허리 높이가 높아 다리가 길어 보여요.'
        v = normalize(p,['a','b','c'])
        self.assertEqual(v['decision'],'hold')
        self.assertNotIn('허리',v['reasons'][0]['observation'])

    def test_context_and_visual_cannot_be_overridden_by_positive_decision(self):
        p=prediction();p['context']='uncertain'
        self.assertEqual(normalize(p,['a','b'])['decision'],'hold')
        p['context']='unsuitable'
        self.assertEqual(normalize(p,['a','b'])['decision'],'reject')

    def test_same_contact_sheet_and_bounded_metadata(self):
        buf=io.BytesIO();Image.new('RGB',(80,80),'gray').save(buf,'PNG')
        image=base64.b64encode(buf.getvalue()).decode()
        payload={'occasion':'일상·산책','items':[{'id':i,'image':image,'type':'shirt','color':'네이비','reviewed':True,'filename':'SECRET.jpg'} for i in ['a','b','c']],
                 'candidates':[{'id':'case1','itemIds':['a','b','c']}]}
        def llama(path,body):
            text=body['messages'][0]['content'][1]['text']
            self.assertIn('네이비',text);self.assertNotIn('SECRET',text)
            self.assertEqual(body['max_tokens'],650)
            return {'choices':[{'finish_reason':'stop','message':{'content':json.dumps(prediction())}}]}
        result=evaluate_v2(payload,llama)
        self.assertEqual(result['protocol'],'outfit-v2-evidence')
        self.assertEqual(result['results'][0]['evaluation']['reasons'][0]['itemIds'],['a','b'])

if __name__=='__main__':unittest.main()
