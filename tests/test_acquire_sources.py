import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('acquire_under_test', ROOT / 'scripts/acquire_sources.py')
acquire = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acquire)


class Response:
    def __init__(self, url, raw):
        self.url = url
        self.raw = raw
        self.headers = {'Content-Type': 'application/pdf' if url.endswith('.pdf') else 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return self.raw


class AcquisitionTests(unittest.TestCase):
    def test_fresh_project_creates_ignored_manifest_parent_with_real_source_bytes(self):
        # Only HTTPS transport is replaced; fixture bytes are the exact bundled originals.
        originals = {name: (ROOT / 'public/data' / name).read_bytes() for name in acquire.SOURCES}

        def response(request, timeout):
            name = next(name for name, url in acquire.SOURCES.items() if url == request.full_url)
            return Response(request.full_url, originals[name])

        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp)
            self.assertFalse((target / 'sources').exists())
            with patch.object(acquire, 'ROOT', target), patch.object(acquire.urllib.request, 'urlopen', side_effect=response), contextlib.redirect_stdout(io.StringIO()):
                acquire.main()
            manifest = json.loads((target / 'sources/manifest.json').read_text())
            self.assertEqual({f['file'] for f in manifest['files']}, set(originals))
            for item in manifest['files']:
                raw = (target / 'public/data' / item['file']).read_bytes()
                self.assertEqual(raw, originals[item['file']])
                self.assertEqual(item['sha256'], hashlib.sha256(raw).hexdigest())


if __name__ == '__main__':
    unittest.main()
