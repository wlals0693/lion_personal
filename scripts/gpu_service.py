"""Local image gateway and persistent CUDA llama.cpp server. No photo files are saved."""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import base64, hmac, io, json, os, signal, subprocess, threading, time, urllib.request
from PIL import Image, ImageOps, UnidentifiedImageError
from outfit_evaluation import evaluate_batch

ROOT = Path(__file__).resolve().parents[1]
MODEL_ROOT = Path(os.environ.get('WARDROBE_MODEL_ROOT', str(ROOT.parent / 'wardrobe-desktop-handoff')))
LLAMA_PORT = int(os.environ.get('WARDROBE_LLAMA_PORT', '8091'))
GATEWAY_PORT = int(os.environ.get('WARDROBE_GPU_PORT', '8092'))
LOCK = threading.Lock()
PROMPT = (ROOT / 'scripts/registration_prompt.txt').read_text('utf-8')
TYPES = {'t_shirt','polo','shirt','sports_jersey','knit_sweater','sweatshirt','tank_top','hoodie','jacket','coat','other','unknown'}
COLORS = {'화이트','블랙','차콜','그레이','네이비','블루','베이지','브라운','그린','레드','핑크','옐로','오렌지','퍼플','멀티컬러'}
STYLES = {'캐주얼','미니멀','스트리트','클래식','스포티','빈티지'}
PATTERNS = {'무지','줄무늬','체크','도트','꽃무늬','기하학','카무플라주','기타'}
NECKLINES = {'라운드넥','브이넥','카라','폴로카라','헨리넥','후드','터틀넥','모크넥','스퀘어넥','보트넥','기타'}
MATERIALS = {'면 느낌','데님 느낌','니트 조직','메쉬 조직','플리스 느낌','코듀로이 조직','가죽 느낌','스웨이드 느낌','매끄러운 합성섬유 느낌','기타'}
TYPE_NAMES = dict(zip(['t_shirt','polo','shirt','sports_jersey','knit_sweater','sweatshirt','tank_top','hoodie','jacket','coat','other','unknown'],
                      ['티셔츠','폴로','셔츠','스포츠 저지','니트','맨투맨','민소매','후드','재킷','코트','기타','옷']))
TYPE_NAMES.update({'trousers':'바지','jeans':'청바지','shorts':'반바지','skirt':'치마','dress':'원피스','sneakers':'스니커즈','dress_shoes':'구두','boots':'부츠','sandals':'샌들'})
TYPES.update(TYPE_NAMES)

def attributes(prediction):
    uncertain = prediction.get('uncertain_fields')
    uncertain = [v for v in uncertain if isinstance(v, str)] if isinstance(uncertain, list) else []
    result = {}
    for field, allowed in [('color', COLORS), ('style', STYLES)]:
        value = prediction.get(field)
        result[field] = value if isinstance(value,str) and value in allowed else '잘 모르겠어요'
        if result[field] == '잘 모르겠어요': uncertain.append(field)
    for raw, key, allowed in [('pattern','pattern',PATTERNS), ('neckline','neckline',NECKLINES), ('material_guess','materialGuess',MATERIALS)]:
        value = prediction.get(raw)
        result[key] = value.strip() if isinstance(value,str) and value.strip() in allowed else ''
        if not result[key]: uncertain.append(raw)
    color_name = result['color'] if result['color'] != '잘 모르겠어요' else ''
    result['name'] = ' '.join(v for v in [color_name, TYPE_NAMES.get(prediction.get('type'), '옷')] if v)
    if result['materialGuess']: uncertain.append('material_guess')
    fields = {'name','type','sleeve','color','style','pattern','neckline','materialGuess'}
    normalized = ['materialGuess' if v == 'material_guess' else v for v in uncertain]
    result['uncertainFields'] = sorted(set(v for v in normalized if v in fields))
    return result

def llama(path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(f'http://127.0.0.1:{LLAMA_PORT}{path}', data=data, headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req, timeout=80) as response:
        return json.load(response)

class Handler(BaseHTTPRequestHandler):
    def reply(self, status, value):
        data = json.dumps(value, ensure_ascii=False).encode()
        try:
            self.send_response(status)
            self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Content-Length',str(len(data)))
            self.send_header('Cache-Control','no-store')
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # A cancelled upload/readiness request needs no second response.

    def do_GET(self):
        if self.path != '/health': return self.reply(404, {'error':'Not found'})
        try: return self.reply(200, {'status':llama('/health')['status'], 'model':'Qwen3-VL-4B Q4_K_M', 'device':'CUDA0'})
        except Exception: return self.reply(503, {'status':'unavailable'})

    def do_POST(self):
        if self.path == '/shutdown':
            token = os.environ.get('WARDROBE_SHUTDOWN_TOKEN','')
            if not token or not hmac.compare_digest(token,self.headers.get('X-Shutdown-Token','')):
                return self.reply(403, {'error':'Forbidden'})
            self.reply(200, {'status':'stopping'})
            threading.Thread(target=self.server.shutdown,daemon=True).start()
            return
        if self.path == '/outfits/evaluate': return self.evaluate_outfits()
        if self.path != '/analyze': return self.reply(404, {'error':'Not found'})
        try: length = int(self.headers.get('Content-Length', '0'))
        except ValueError: return self.reply(400, {'error':'Invalid length'})
        if not 0 < length <= 12 * 1024 * 1024: return self.reply(413, {'error':'12MB 이하 사진을 선택해주세요.'})
        if not LOCK.acquire(blocking=False): return self.reply(429, {'error':'다른 사진을 분석 중이에요. 잠시 후 다시 시도해주세요.'})
        try:
            start = time.perf_counter()
            with Image.open(io.BytesIO(self.rfile.read(length))) as raw:
                # Phone JPEGs can contain an MPO multi-picture container; analyze its first frame.
                if raw.format not in {'JPEG','MPO','PNG','WEBP'}: raise ValueError('Unsupported image')
                image = ImageOps.exif_transpose(raw).convert('RGB')
                image.thumbnail((768,768), Image.Resampling.LANCZOS)
                buf = io.BytesIO(); image.save(buf, format='PNG')
            body = {'messages':[{'role':'user','content':[
                {'type':'image_url','image_url':{'url':'data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode()}},
                {'type':'text','text':PROMPT}]}], 'max_tokens':384,'temperature':0,'seed':42,'cache_prompt':False}
            result = llama('/v1/chat/completions', body)
            text = result['choices'][0]['message']['content'].strip()
            if text.startswith('```'): text = text.split('\n',1)[1].rsplit('```',1)[0].strip()
            prediction = json.loads(text)
            kind = prediction.get('type')
            if kind not in TYPES: raise RuntimeError('Unexpected type')
            sleeve = prediction.get('sleeve')
            sleeve = sleeve.lower().replace('-','_').replace(' ','_') if isinstance(sleeve,str) else 'unknown'
            sleeve = {'short_sleeve':'short','short_sleeves':'short','long_sleeve':'long','long_sleeves':'long','sleeveless':'none','no_sleeves':'none'}.get(sleeve,sleeve)
            if sleeve not in {'short','long','none'}: sleeve = 'unknown'
            attrs = attributes(prediction)
            if sleeve == 'unknown': attrs['uncertainFields'] = sorted(set(attrs['uncertainFields'] + ['sleeve']))
            if kind == 'unknown': attrs['uncertainFields'] = sorted(set(attrs['uncertainFields'] + ['type']))
            self.reply(200, {**attrs, 'type':kind,'sleeve':sleeve,'inferenceMs':round((time.perf_counter()-start)*1000,2)})
        except json.JSONDecodeError:
            self.reply(502, {'error':'모델 응답을 읽지 못했어요. 다시 시도해주세요.'})
        except (UnidentifiedImageError, Image.DecompressionBombError, ValueError):
            self.reply(422, {'error':'사진을 읽지 못했어요. 다른 사진으로 다시 시도해주세요.'})
        except Exception:
            self.reply(502, {'error':'모델 분석을 완료하지 못했어요. 다시 시도해주세요.'})
        finally: LOCK.release()

    def evaluate_outfits(self):
        try: length = int(self.headers.get('Content-Length','0'))
        except ValueError: return self.reply(400, {'error':'Invalid length'})
        if not 0 < length <= 20*1024*1024: return self.reply(413, {'error':'사진 용량이 너무 커요.'})
        if not LOCK.acquire(blocking=False): return self.reply(429, {'error':'다른 사진을 분석 중이에요. 잠시 후 다시 시도해주세요.'})
        try:
            payload = json.loads(self.rfile.read(length))
            result = evaluate_batch(payload, llama)
            self.reply(200,result)
        except (ValueError, UnidentifiedImageError, Image.DecompressionBombError):
            self.reply(400, {'error':'코디 사진과 구성을 확인해주세요.'})
        except Exception:
            self.reply(502, {'error':'AI 코디 평가를 완료하지 못했어요. 다시 시도해주세요.'})
        finally: LOCK.release()

def runtime_paths(model_root=MODEL_ROOT, platform=None):
    platform = os.name if platform is None else platform
    executable = 'llama-server.exe' if platform == 'nt' else 'llama-server'
    exe = Path(os.environ.get('WARDROBE_LLAMA_BIN', str(model_root / 'runtime' / executable))).expanduser().resolve()
    return exe, model_root / 'models/Qwen3VL-4B-Instruct-Q4_K_M.gguf', model_root / 'models/mmproj-Qwen3VL-4B-Instruct-F16.gguf'

def main():
    logs = ROOT / '.logs'; logs.mkdir(exist_ok=True)
    exe, model, projector = runtime_paths()
    for file in (exe, model, projector):
        if not file.is_file(): raise FileNotFoundError(f'Required GPU runtime/model file not found: {file}')
    args = [str(exe), '-m',str(model),
        '--mmproj',str(projector),
        '-ngl','99','-c','4096','--host','127.0.0.1','--port',str(LLAMA_PORT),'--parallel','1',
        '--no-warmup','-lv','4','--device','CUDA0','--mmproj-device','CUDA0','--no-cache-prompt','-b','128','-ub','128']
    gateway = ThreadingHTTPServer(('127.0.0.1', GATEWAY_PORT), Handler)
    gateway.daemon_threads = True
    with (logs/'gpu-model.log').open('w',encoding='utf-8') as log:
        server = subprocess.Popen(args,stdout=log,stderr=subprocess.STDOUT,cwd=exe.parent)
        try:
            start = time.monotonic()
            while True:
                if server.poll() is not None: raise RuntimeError('Model exited. See .logs/gpu-model.log')
                try:
                    if llama('/health').get('status') == 'ok': break
                except Exception: pass
                if time.monotonic()-start > 180: raise TimeoutError('Model loading timed out')
                time.sleep(.3)
            print(f'GPU gateway ready: http://127.0.0.1:{GATEWAY_PORT} (Qwen3-VL 4B, CUDA0)',flush=True)
            gateway.serve_forever()
        finally:
            gateway.server_close()
            server.terminate(); server.wait(timeout=30)

if __name__ == '__main__':
    try: main()
    except KeyboardInterrupt: pass
