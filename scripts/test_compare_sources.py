"""Output-contract test only; no GPU inference and no fashion-quality assertions."""
import base64
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image

spec=importlib.util.spec_from_file_location('compare_sources',Path(__file__).with_name('compare-outfit-sources.py'))
runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)

class ExperimentOutputTests(unittest.TestCase):
    def test_paired_export_contains_photos_and_no_fabricated_ratings(self):
        buf=io.BytesIO();Image.new('RGB',(10,10),'gray').save(buf,'PNG')
        image=base64.b64encode(buf.getvalue()).decode()
        payload={'occasion':'일상·산책','items':[{'id':i,'image':image} for i in ['a','b','c']],
                 'candidates':[{'id':'fixed1','itemIds':['a','b','c']}]}
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);source=root/'input.json';source.write_text(json.dumps(payload),'utf-8')
            out=root/'result';calls=[]
            def run(p,gateway,protocol):
                calls.append((p,protocol))
                return {'wallSeconds':1,'result':{'protocol':protocol,'model':'fixture-only','results':[
                    {'id':'fixed1','evaluation':{'decision':'hold','reasons':[{'observation':'Fixture <not markup>'}]}}]}}
            with patch.object(runner,'run',run),patch('sys.argv',['compare','--payload',str(source),'--out',str(out)]):
                runner.main()
            self.assertEqual(len(calls),2);self.assertEqual(calls[0][0],calls[1][0])
            self.assertEqual(len(list(out.glob('*.jpg'))),1)
            page=(out/'blind-review.html').read_text('utf-8')
            self.assertIn('&lt;not markup&gt;',page)
            self.assertNotIn('outfit-v3',page)
            self.assertIn('pending',json.loads((out/'manifest.json').read_text('utf-8'))['status'])
            self.assertNotIn('accuracy',json.loads((out/'manifest.json').read_text('utf-8')))

if __name__=='__main__':unittest.main()
