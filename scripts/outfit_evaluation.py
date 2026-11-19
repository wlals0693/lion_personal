"""Bounded outfit contact-sheet evaluation using the resident local VLM."""
import base64, binascii, io, json, time
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw

PROMPT = (Path(__file__).parent/'outfit_prompt.txt').read_text('utf-8')
ASPECTS = {'color','pattern','texture','shape','overall'}
TEXT = {'type':'string','minLength':1,'maxLength':150}
SCHEMA = {'type':'object','additionalProperties':False,
    'required':['visual','context','reasons','contextReason','limitations'],
    'properties':{
        'visual':{'type':'string','enum':['cohesive','ordinary','review']},
        'context':{'type':'string','enum':['suitable','uncertain','unsuitable']},
        'reasons':{'type':'array','minItems':2,'maxItems':3,'items':{'type':'object','additionalProperties':False,
            'required':['aspect','observation'],'properties':{'aspect':{'type':'string','enum':['color','pattern','texture','shape','overall']},'observation':TEXT}}},
        'contextReason':TEXT,'limitations':{'type':'array','minItems':1,'maxItems':2,'items':TEXT}}}

def validate_evaluation(value):
    if not isinstance(value,dict) or value.get('visual') not in {'cohesive','ordinary','review'} or value.get('context') not in {'suitable','uncertain','unsuitable'}:
        raise RuntimeError('Invalid rating')
    def text(v): return isinstance(v,str) and 0 < len(v.strip()) <= 300
    reasons = value.get('reasons')
    if not isinstance(reasons,list) or not 1 <= len(reasons) <= 5 or any(not isinstance(r,dict) or r.get('aspect') not in ASPECTS or not text(r.get('observation')) for r in reasons):
        raise RuntimeError('Invalid reasons')
    limits = value.get('limitations')
    if not text(value.get('contextReason')) or not isinstance(limits,list) or not 1 <= len(limits) <= 5 or not all(text(v) for v in limits):
        raise RuntimeError('Invalid limitations')
    return {key:value[key] for key in ['visual','context','reasons','contextReason','limitations']}

def evaluate_batch(payload, llama):
    if not isinstance(payload,dict) or payload.get('occasion') not in ['일상·산책','출근·등교','약속·데이트','여행·나들이']:
        raise ValueError('Invalid occasion')
    candidates = payload.get('candidates')
    if not isinstance(candidates,list) or not 1 <= len(candidates) <= 6: raise ValueError('Invalid candidates')
    items = payload.get('items')
    if not isinstance(items,list) or not 2 <= len(items) <= 24: raise ValueError('Invalid items')
    decoded = {}
    for item in items:
        if not isinstance(item,dict) or not isinstance(item.get('id'),str) or item['id'] in decoded: raise ValueError('Invalid item id')
        try:
            raw = base64.b64decode(item['image'],validate=True)
            if len(raw) > 3*1024*1024: raise ValueError('Image too big')
            with Image.open(io.BytesIO(raw)) as image:
                image = ImageOps.exif_transpose(image).convert('RGB')
                image.thumbnail((360,340),Image.Resampling.LANCZOS)
                decoded[item['id']] = image.copy()
        except (KeyError, binascii.Error, OSError): raise ValueError('Unreadable image')
    results = []; start = time.perf_counter(); seen = set()
    for candidate in candidates:
        ids = candidate.get('itemIds') if isinstance(candidate,dict) else None
        if not isinstance(ids,list) or not 2 <= len(ids) <= 4 or not all(isinstance(i,str) and i in decoded for i in ids) or len(set(ids)) != len(ids): raise ValueError('Invalid outfit items')
        cid = candidate.get('id')
        if not isinstance(cid,str) or cid in seen: raise ValueError('Duplicate outfit')
        seen.add(cid)
        sheet = Image.new('RGB',(768,768),'#f7f5f0'); draw = ImageDraw.Draw(sheet)
        for i, item_id in enumerate(ids):
            image = decoded[item_id]; x=(i%2)*384; y=(i//2)*384
            sheet.paste(image,(x+(384-image.width)//2,y+28+(340-image.height)//2))
            draw.text((x+12,y+10),str(i+1),fill='black')
        buf = io.BytesIO(); sheet.save(buf,format='PNG')
        response = llama('/v1/chat/completions', {'messages':[{'role':'user','content':[
            {'type':'image_url','image_url':{'url':'data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode()}},
            {'type':'text','text':PROMPT+'\nOccasion: '+payload['occasion']}]}],
            'max_tokens':512,'temperature':0,'seed':42,'cache_prompt':False,
            'response_format':{'type':'json_object','schema':SCHEMA}})
        if response['choices'][0].get('finish_reason') == 'length': raise RuntimeError('Truncated evaluation')
        raw = response['choices'][0]['message']['content'].strip()
        if raw.startswith('```'): raw=raw.split('\n',1)[1].rsplit('```',1)[0].strip()
        try: value = json.loads(raw)
        except json.JSONDecodeError as error: raise RuntimeError('Invalid model JSON') from error
        results.append({'id':cid,'evaluation':validate_evaluation(value)})
    return {'results':results,'seconds':round(time.perf_counter()-start,3),'protocol':'outfit-v1-contact-sheet','model':'Qwen3-VL-4B-Q4_K_M'}
