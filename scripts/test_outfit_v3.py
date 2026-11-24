import base64
from copy import deepcopy
import io
import json
import unittest
from PIL import Image
from outfit_evaluation_v3 import observations, retrieve, normalize, evaluate_v3, KNOWLEDGE

IDS=['a','b','c']
RAW={'conflict':False,'observations':[
    {'item':1,'aspect':'pattern','fact':'상의에 큰 그래픽이 있다.','clear':True},
    {'item':2,'aspect':'pattern','fact':'하의는 무지다.','clear':True},
    {'item':3,'aspect':'pattern','fact':'신발은 무지다.','clear':True}]}
def judgement():
    return {'visual':'ordinary','context':'suitable','decision':'recommend',
        'reasons':[{'criterionId':'emphasis','evidenceIds':['e1','e2','e3'],
                    'effect':'support','application':'무지 하의와 신발이 상의의 그래픽을 중심으로 보이게 해요.'}],
        'contextReason':'일상 외출 기준의 제안이에요.','limitations':['착용 핏은 확인하지 못했어요.']}

class GroundedTests(unittest.TestCase):
    def setUp(self):
        self.facts=observations(deepcopy(RAW),IDS);self.selected=retrieve(self.facts)
    def result(self, value=None, **kw):
        return normalize(value or judgement(),self.facts,self.selected,IDS,**kw)
    def test_sources_attached_from_registry_not_model(self):
        p=judgement();p['reasons'][0]['sources']=[{'url':'https://evil.invalid'}]
        result=self.result(p)
        self.assertEqual(result['decision'],'recommend')
        self.assertEqual(result['reasons'][0]['sources'][0]['id'],'fit-design')
        self.assertEqual(result['knowledgeVersion'],KNOWLEDGE['version'])
        self.assertNotIn('evil',json.dumps(result))
    def test_fabricated_criterion_or_evidence_cannot_recommend(self):
        for key,value in [('criterionId','neutral-is-always-good'),('evidenceIds',['e1','e99']),
                          ('evidenceIds',['e1','e1']),('evidenceIds',[{},'e2'])]:
            p=judgement();p['reasons'][0][key]=value
            self.assertEqual(self.result(p)['decision'],'hold')
    def test_single_item_and_unrelated_aspects_cannot_support(self):
        self.facts[1]['itemId']='a';self.facts[2]['itemId']='a'
        self.assertEqual(self.result()['decision'],'hold')
        self.setUp();self.facts[0]['aspect']='texture'
        self.assertEqual(self.result()['decision'],'hold')
    def test_all_garments_must_participate_in_recommendation(self):
        p=judgement();p['reasons'][0]['evidenceIds']=['e1','e2']
        self.assertEqual(self.result(p)['decision'],'hold')
    def test_unclear_observations_and_composition_filtered(self):
        raw=deepcopy(RAW);raw['observations'][0]['clear']=False
        self.assertEqual(len(observations(raw,IDS)),2)
        raw['observations'][0].update(clear=True,fact='캐시미어 원단이다.')
        self.assertEqual(len(observations(raw,IDS)),2)
    def test_conflicting_metadata_and_uncertainty_force_hold(self):
        self.assertEqual(self.result(conflict=True)['decision'],'hold')
        for field,value in [('context','uncertain'),('visual','review')]:
            p=judgement();p[field]=value
            self.assertEqual(self.result(p)['decision'],'hold')
        p=judgement();p['reasons'][0]['effect']='uncertain'
        self.assertEqual(self.result(p)['decision'],'hold')
    def test_reject_needs_a_conflict_not_just_model_verdict(self):
        p=judgement();p['decision']='reject'
        self.assertEqual(self.result(p)['decision'],'hold')
        p['reasons'][0]['effect']='conflict'
        self.assertEqual(self.result(p)['decision'],'reject')
    def test_no_criteria_is_hold_not_silent_v2_fallback(self):
        result=normalize(judgement(),self.facts,[],IDS)
        self.assertEqual(result['groundingStatus'],'insufficient')
        self.assertEqual(result['decision'],'hold')
    def test_two_stages_judgement_gets_only_observations_and_selected_sources(self):
        buf=io.BytesIO();Image.new('RGB',(20,20),'gray').save(buf,'PNG')
        image=base64.b64encode(buf.getvalue()).decode()
        payload={'protocol':'outfit-v3-sources','occasion':'일상·산책',
                 'items':[{'id':i,'image':image,'filename':'SECRET.jpg'} for i in IDS],
                 'candidates':[{'id':'case1','itemIds':IDS}]}
        calls=[]
        def llama(path,body):
            calls.append(body)
            if len(calls)==1:
                self.assertIsInstance(body['messages'][0]['content'],list)
                value=RAW
            else:
                text=body['messages'][0]['content']
                self.assertIsInstance(text,str)
                self.assertIn('emphasis',text);self.assertIn('e1',text)
                self.assertNotIn('SECRET',text);self.assertNotIn('base64',text)
                value=judgement()
            return {'choices':[{'finish_reason':'stop','message':{'content':json.dumps(value)}}]}
        result=evaluate_v3(payload,llama)
        self.assertEqual(len(calls),2)
        self.assertEqual(result['protocol'],'outfit-v3-sources')
        self.assertEqual(result['results'][0]['evaluation']['decision'],'recommend')

if __name__=='__main__':unittest.main()
