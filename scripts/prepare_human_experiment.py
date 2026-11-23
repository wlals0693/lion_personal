"""Unpack browser experiment photos; verify bytes before creating a new run folder.

No model inference here. Human answers are deliberately in a separate file.
"""
import argparse
import base64
import hashlib
import json
import re
from pathlib import Path


def prepare(source, destination):
    data = json.loads(Path(source).read_text(encoding='utf-8-sig'))
    if data.get('version') != 1 or not data.get('lockedAt') or 'ratings' in data:
        raise ValueError('Expected a locked experiment file, without human ratings')
    items, candidates = data['items'], data['candidates']
    if not 3 <= len(items) <= 30 or not 1 <= len(candidates) <= 24:
        raise ValueError('Invalid experiment size')
    decoded, seen = [], set()
    for index, item in enumerate(items):
        if not isinstance(item['id'], str) or item['id'] in seen or item['slot'] not in ('tops', 'bottoms', 'shoes'):
            raise ValueError('Invalid or duplicate item')
        seen.add(item['id'])
        match = re.fullmatch(r'data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)', item['image'])
        if not match:
            raise ValueError('Only embedded JPG/PNG/WebP photos are supported')
        raw = base64.b64decode(match[2], validate=True)
        if len(raw) > 2 * 1024 * 1024 or hashlib.sha256(raw).hexdigest() != item['sha256']:
            raise ValueError('Photo size or SHA256 mismatch')
        name = f'images/item_{index:03d}.{match[1]}'
        decoded.append((name, raw, {k: item[k] for k in ('id', 'slot', 'sha256')}))
    by_id = {item['id']: item for item in items}
    candidate_ids = set()
    for c in candidates:
        if c['id'] in candidate_ids or len(c['itemIds']) != 3 or set(by_id[i]['slot'] for i in c['itemIds']) != {'tops', 'bottoms', 'shoes'}:
            raise ValueError('Invalid candidate')
        candidate_ids.add(c['id'])
    out = Path(destination)
    if out.exists():
        raise FileExistsError('Choose a new output directory; existing runs are preserved')
    out.mkdir(parents=True)
    (out / 'images').mkdir()
    manifest = {k: data[k] for k in ('version', 'setId', 'practice', 'lockedAt', 'occasion', 'candidates')}
    manifest['items'] = []
    for name, raw, metadata in decoded:
        (out / name).write_bytes(raw)
        manifest['items'].append({**metadata, 'image': name})
    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    result = prepare(args.input, args.out)
    print(f"Prepared {len(result['items'])} photos / {len(result['candidates'])} candidates. No inference performed.")
