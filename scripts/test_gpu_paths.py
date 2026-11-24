import os
from pathlib import Path
import unittest
from unittest.mock import patch
from gpu_service import runtime_paths

class RuntimePaths(unittest.TestCase):
    def test_windows_default_is_preserved(self):
        with patch.dict(os.environ, {}, clear=True):
            exe, model, projector = runtime_paths(Path.cwd(), 'nt')
        self.assertEqual(exe.name,'llama-server.exe')
        self.assertEqual(model.name,'Qwen3VL-4B-Instruct-Q4_K_M.gguf')
        self.assertEqual(projector.name,'mmproj-Qwen3VL-4B-Instruct-F16.gguf')
    def test_linux_default_has_no_exe_suffix(self):
        with patch.dict(os.environ, {}, clear=True):
            exe, _, _ = runtime_paths(Path.cwd(), 'posix')
        self.assertEqual(exe.name,'llama-server')
    def test_build_binary_override_keeps_libraries_in_original_directory(self):
        target=Path.cwd()/'custom-build/bin/llama-server'
        with patch.dict(os.environ, {'WARDROBE_LLAMA_BIN':str(target)}):
            exe, _, _ = runtime_paths(Path.cwd(), 'posix')
        self.assertEqual(exe,target.resolve())

if __name__=='__main__':unittest.main()
