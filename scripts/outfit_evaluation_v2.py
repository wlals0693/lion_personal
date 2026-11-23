"""Evidence-linked experimental evaluation. v1 is retained for paired comparisons."""
import json
import re
from pathlib import Path
from copy import deepcopy
from outfit_evaluation_v1 import evaluate_batch as baseline, SCHEMA

PROMPT = (Path(__file__).parent / 'outfit_prompt_v2.txt').read_text('utf-8')
SCHEMA_V2 = deepcopy(SCHEMA)
SCHEMA_V2['required'].append('decision')
SCHEMA_V2['properties']['decision'] = {'type': 'string', 'enum': ['recommend', 'hold', 'reject']}
reason = SCHEMA_V2['properties']['reasons']
reason['minItems'], reason['maxItems'] = 1, 2
reason['items']['required'] += ['evidence', 'items']
reason['items']['properties']['evidence'] = {'type': 'string', 'minLength': 1, 'maxLength': 100}
reason['items']['properties']['items'] = {'type': 'array', 'minItems': 2, 'maxItems': 4, 'items': {'type': 'integer', 'minimum': 1, 'maximum': 4}}
# Conservative scope guard, not a semantic correctness or hallucination detector.
UNSUPPORTED = re.compile(r'허리\s*높|하이웨이스트|로우라이즈|인조\s*가죽|천연\s*가죽|면\s*소재|폴리에스터|캐시미어|보온성|착용감|체형|다리가\s*길')

def normalize(value, ids):
    if value.get('decision') not in {'recommend','hold','reject'}:
        raise RuntimeError('Invalid decision')
    clean = []
    removed = False
    for r in value.get('reasons', []):
        numbers = r.get('items')
        evidence, observation = r.get('evidence'), r.get('observation')
        if (not isinstance(numbers, list) or any(type(n) is not int or not 1 <= n <= len(ids) for n in numbers) or len(set(numbers)) < 2 or
            not isinstance(evidence, str) or not 0 < len(evidence.strip()) <= 100 or
            not isinstance(observation, str) or not 0 < len(observation.strip()) <= 100 or
            UNSUPPORTED.search(evidence + observation)):
            removed = True
            continue
        clean.append({'aspect':r.get('aspect'), 'evidence':evidence, 'observation':observation,
                      'itemIds':[ids[n-1] for n in numbers]})
    decision = value['decision']
    if value.get('context') == 'unsuitable': decision = 'reject'
    elif removed or not clean or value.get('context') == 'uncertain' or value.get('visual') == 'review': decision = 'hold'
    if not clean:
        clean = [{'aspect':'overall','observation':'사진에서 확인 가능한 관계 근거가 부족해요.'}]
    return {**value, 'reasons':clean[:2], 'decision':decision, 'protocol':'outfit-v2-evidence'}

def evaluate_v2(payload, llama):
    enriched = []
    item_map = {i['id']: i for i in payload.get('items', [])}
    def call(path, body):
        candidate = payload['candidates'][len(enriched)]
        ids = candidate['itemIds']
        metadata = [{ 'photo':n+1, **{k:item_map[id].get(k) for k in ('category','type','color','reviewed')} } for n,id in enumerate(ids)]
        body['messages'][0]['content'][1]['text'] = PROMPT + '\nOccasion: ' + payload['occasion'] + '\nRegistration data: ' + json.dumps(metadata, ensure_ascii=False)
        body['response_format'] = {'type':'json_object','schema':SCHEMA_V2}
        body['max_tokens'] = 650
        response = llama(path, body)
        if response['choices'][0].get('finish_reason') == 'length': raise RuntimeError('Truncated evidence')
        raw = response['choices'][0]['message']['content'].strip()
        if raw.startswith('```'): raw = raw.split('\n',1)[1].rsplit('```',1)[0].strip()
        result = normalize(json.loads(raw), ids)
        enriched.append(result)
        response['choices'][0]['message']['content'] = json.dumps(result, ensure_ascii=False)
        return response
    result = baseline(payload, call)  # Retain image/input validation and exact v1 contact sheet.
    for row, value in zip(result['results'], enriched): row['evaluation'] = value
    result['protocol'] = 'outfit-v2-evidence'
    return result
