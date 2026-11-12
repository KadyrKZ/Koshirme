"""Operator-side packaging; the Windows build itself does not require Python."""
import html
import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'apps/student-desktop/package.json').read_text())['version']
release = root / 'apps/student-desktop/release'
release.mkdir(parents=True, exist_ok=True)

# Export the same Windows instructions to the public site.
def inline(value):
    value = html.escape(value)
    value = re.sub(r'\[([^\]]+)\]\((https?://[^ )]+)\)', r'<a href="\2">\1</a>', value)
    value = re.sub(r'`([^`]+)`', r'<code>\1</code>', value)
    return re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', value)

blocks = []
paragraph = []
code = None
list_kind = None

def flush():
    if paragraph:
        blocks.append('<p>' + inline(' '.join(paragraph)) + '</p>')
        paragraph.clear()

for line in (root / 'docs/WINDOWS.md').read_text().splitlines() + ['']:
    if line.startswith('```'):
        flush()
        if code is None:
            code = []
        else:
            blocks.append('<pre><code>' + html.escape('\n'.join(code)) + '</code></pre>')
            code = None
        continue
    if code is not None:
        code.append(line)
        continue
    match = re.match(r'^(?:\d+\. |(-) )(.*)', line)
    if list_kind and not match:
        blocks.append('</' + list_kind + '>')
        list_kind = None
    if not line.strip():
        flush()
    elif line.startswith('#'):
        flush()
        depth = len(line) - len(line.lstrip('#'))
        blocks.append(f'<h{depth}>' + inline(line[depth:].strip()) + f'</h{depth}>')
    elif match:
        flush()
        kind = 'ul' if match[1] else 'ol'
        if list_kind != kind:
            if list_kind:
                blocks.append('</' + list_kind + '>')
            blocks.append('<' + kind + '>')
            list_kind = kind
        blocks.append('<li>' + inline(match[2]) + '</li>')
    else:
        paragraph.append(line)

(root / 'apps/admin-web/public/windows-build.html').write_text('''<!doctype html>
<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KOSH!RME — Windows: запуск и сборка EXE</title>
<style>body{margin:0;background:#f4f6fc;color:#18253c;font:17px/1.6 system-ui,sans-serif}main{max-width:880px;margin:auto;padding:32px 20px}h1{font-size:32px;line-height:1.25}h2{margin-top:38px}a{color:#215dc4}pre{overflow:auto;background:#14253f;color:#f5f8ff;padding:18px;border-radius:10px;font-size:14px}p code,li code{background:#e3eaf6;border-radius:4px;padding:2px 5px;overflow-wrap:anywhere}li{margin:9px 0}.download{display:inline-block;background:#215dc4;color:white;padding:12px 18px;border-radius:8px;text-decoration:none}nav a{margin-right:20px}</style>
<main><nav><a href="/">KOSH!RME</a><a href="/guide.html">Инструкция ученику и учителю</a></nav>
''' + f'<p><a class="download" href="/downloads/KOSHIRME-{version}-Windows-source.zip">Скачать исходники Windows {version}</a></p>\n' + '\n'.join(blocks) + '</main></html>\n')

allowed_files = ['Build-Windows.cmd', 'package.json', 'package-lock.json', 'tsconfig.base.json', 'playwright.config.ts',
                 '.prettierrc.json', '.gitignore', '.env.example', 'docker-compose.yml', 'README.md']
allowed_dirs = ['apps', 'packages', 'tests', 'scripts', 'docs', '.github', 'enterprise-policy']
excluded_dirs = {'node_modules', 'release', 'out', 'dist', 'dist-worker', '.venv', '.wrangler',
                 'uploads', '__pycache__', '.ruff_cache', '.pytest_cache', 'test-results', '.git'}

def include(path):
    relative = path.relative_to(root)
    return (not excluded_dirs.intersection(relative.parts)
            and path.is_file()
            and not path.is_symlink()
            and not path.name.startswith(('.env', '.dev.vars'))
            and path.name != '.DS_Store'
            and path.suffix not in {'.db', '.pyc', '.p12', '.pfx', '.pem', '.key', '.tsbuildinfo'})

files = [root / name for name in allowed_files if (root / name).is_file()]
for directory in allowed_dirs:
    files.extend(path for path in (root / directory).rglob('*') if include(path))
archive = release / f'KOSHIRME-{version}-Windows-source.zip'
with ZipFile(archive, 'w', ZIP_DEFLATED) as bundle:
    for path in sorted(set(files)):
        bundle.write(path, 'examguard/' + path.relative_to(root).as_posix())
with ZipFile(archive) as bundle:
    assert bundle.testzip() is None
print(archive)
