"""Paired GPU experiment; never manufactures expert labels or accuracy scores.

Input: frozen /outfits/evaluate request JSON, images base64 (not data URLs).
Output: raw traces, anonymized review CSV, private answer key and run manifest.
Keep the same outfit cases and images for both protocols. A maximum of six per input.
"""
import argparse
import base64
import csv
import hashlib
import html
import io
import json
from pathlib import Path
import random
import time
import urllib.request
from PIL import Image, ImageOps

def run(payload, gateway, protocol):
    data=json.dumps({**payload,'protocol':protocol},ensure_ascii=False).encode()
    request=urllib.request.Request(gateway.rstrip('/')+'/outfits/evaluate',data=data,
        headers={'Content-Type':'application/json'})
    start=time.perf_counter()
    with urllib.request.urlopen(request,timeout=600) as response: result=json.load(response)
    if result.get('protocol')!=protocol: raise RuntimeError('Wrong protocol: update the GPU server code first')
    expected={c['id'] for c in payload['candidates']}
    if {r['id'] for r in result['results']}!=expected or len(result['results'])!=len(expected):
        raise RuntimeError('Missing/duplicate cases')
    return {'wallSeconds':time.perf_counter()-start, 'result':result}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    group=p.add_mutually_exclusive_group(required=True)
    group.add_argument('--payload',type=Path)
    group.add_argument('--photos',type=Path,help='Pilot folder containing top, bottom, shoes subfolders; not a held-out benchmark')
    p.add_argument('--prepare-only',action='store_true',help='Freeze input without contacting any GPU server')
    p.add_argument('--gateway',default='http://127.0.0.1:8092')
    p.add_argument('--out',required=True,type=Path)
    p.add_argument('--seed',type=int,default=42)
    args=p.parse_args()
    if args.payload:
        payload=json.loads(args.payload.read_text('utf-8-sig'))
    else:
        items=[];slots=[]
        for folder,category in [('top','상의'),('bottom','하의'),('shoes','신발')]:
            paths=sorted(f for f in (args.photos/folder).iterdir() if f.suffix.lower() in {'.jpg','.jpeg','.png','.webp'})[:3]
            if not paths:raise ValueError(f'Missing photos in {folder}')
            ids=[]
            for photo in paths:
                item_id=f'g{len(items)+1}';ids.append(item_id)
                items.append({'id':item_id,'image':base64.b64encode(photo.read_bytes()).decode(),
                    'category':category,'type':'unknown','color':'잘 모르겠어요','reviewed':False})
            slots.append(ids)
        candidates=[];seen=set()
        for n in range(6):
            ids=[slots[0][n%len(slots[0])],slots[1][(n//len(slots[0])+n)%len(slots[1])],slots[2][n%len(slots[2])]]
            if tuple(ids) in seen:continue
            seen.add(tuple(ids));candidates.append({'id':f'pilot{len(candidates)+1}','itemIds':ids})
        payload={'occasion':'일상·산책','items':items,'candidates':candidates}
    if not 1<=len(payload['candidates'])<=6:raise ValueError('Use 1–6 frozen cases per payload')
    args.out.mkdir(parents=True,exist_ok=False) # Never overwrite a prior experiment.
    frozen=json.dumps(payload,ensure_ascii=False,sort_keys=True)
    (args.out/'input.json').write_text(frozen,'utf-8')
    if args.prepare_only:
        print('Frozen pilot only; no GPU inference or quality claim:',args.out/'input.json');return
    protocols=['outfit-v2-evidence','outfit-v3-sources'];rng=random.Random(args.seed);rng.shuffle(protocols)
    records={}
    for protocol in protocols:
        print('Running',protocol,flush=True);records[protocol]=run(payload,args.gateway,protocol)
        (args.out/(protocol+'.json')).write_text(json.dumps(records[protocol],ensure_ascii=False,indent=2),'utf-8')
    key={};rows=[]
    for candidate in payload['candidates']:
        order=list(protocols);rng.shuffle(order)
        for n,protocol in enumerate(order):
            code=f"{candidate['id']}-{'AB'[n]}";key[code]=protocol
            value=next(r['evaluation'] for r in records[protocol]['result']['results'] if r['id']==candidate['id'])
            rows.append({'reviewId':code,'itemIds':'|'.join(candidate['itemIds']),
                'occasion':payload['occasion'],'decision':value['decision'],
                'explanation':' / '.join(r['observation'] for r in value['reasons']),
                'raterId':'','raterRole':'','wearable_1to5':'','factsSupported_yes_no_uncertain':'',
                'explanationSupported_yes_no_uncertain':'','notes':''})
    with (args.out/'blind-review.csv').open('w',newline='',encoding='utf-8-sig') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    item_map={i['id']:i for i in payload['items']};sections=[]
    for candidate in payload['candidates']:
        sheet=Image.new('RGB',(300*len(candidate['itemIds']),360),'#f7f5f0')
        for n,item_id in enumerate(candidate['itemIds']):
            with Image.open(io.BytesIO(base64.b64decode(item_map[item_id]['image']))) as image:
                photo=ImageOps.exif_transpose(image).convert('RGB');photo.thumbnail((280,340))
                sheet.paste(photo,(n*300+(300-photo.width)//2,(360-photo.height)//2))
        filename=hashlib.sha256(candidate['id'].encode()).hexdigest()[:16]+'.jpg';sheet.save(args.out/filename)
        variants=[r for r in rows if r['reviewId'] in {candidate['id']+'-A',candidate['id']+'-B'}]
        cards=''.join('<article><h3>'+html.escape(r['reviewId'])+'</h3><p>'+html.escape(r['decision'])+'</p><p>'+html.escape(r['explanation'])+'</p></article>' for r in variants)
        sections.append('<section><h2>'+html.escape(candidate['id'])+'</h2><p>'+html.escape(payload['occasion'])+'</p><img alt="평가할 동일 의류 사진" src="'+filename+'"><div>'+cards+'</div></section>')
    (args.out/'blind-review.html').write_text('<!doctype html><meta charset="utf-8"><title>코디 쌍별 평가</title><style>body{font:17px sans-serif;max-width:1000px;margin:30px auto;background:#f7f5f0}img{max-width:100%}section{margin:40px 0}section>div{display:flex;gap:24px}article{flex:1;background:white;padding:24px}</style><h1>동일 코디의 두 설명 비교</h1><p>방법명이 가려진 개발용 평가 자료입니다. 사진과 설명을 비교하고 blind-review.csv를 작성해주세요. 전문가 정답이나 추천 품질 검증 결과가 아닙니다.</p>'+''.join(sections),'utf-8')
    manifest={'inputSha256':hashlib.sha256(frozen.encode('utf-8')).hexdigest(),'seed':args.seed,
        'executionOrder':protocols,'cases':len(payload['candidates']),
        'status':'human review pending; no accuracy or improvement established',
        'model':records[protocols[0]]['result'].get('model'),
        'limitations':'A/B order is hidden, but wording can reveal the method. Reviewers must see the same garment photos. Source-entailment review additionally needs raw traces. Run independent raters; do not tune on these cases and call them held-out.'}
    (args.out/'private-key.json').write_text(json.dumps(key,indent=2),'utf-8')
    (args.out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf-8')
    print('Completed paired inference. Human review is still required:',args.out)

if __name__=='__main__':main()
