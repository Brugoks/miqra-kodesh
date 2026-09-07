"""Fetch and hash-check the authoring sources. No changes to user Blender settings."""
import argparse, hashlib, json, pathlib, subprocess, urllib.request, zipfile
parser = argparse.ArgumentParser()
parser.add_argument('--cache', default='scripts/.cache/human-sources')
args = parser.parse_args()
cache = pathlib.Path(args.cache).resolve()
cache.mkdir(parents=True, exist_ok=True)
sources = json.loads(pathlib.Path(__file__).with_name('sources.json').read_text())
for pack in sources['packs']:
    archive = cache / pack['file']
    if not archive.exists():
        print('Downloading', pack['url'], flush=True)
        urllib.request.urlretrieve(pack['url'], archive)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    if digest != pack['sha256']:
        raise RuntimeError(f"Source archive hash changed: {archive}; review upstream before updating sources.json")
    destination = cache / pack['directory']
    destination.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive) as source:
        for name in source.namelist():
            if not (destination / name).resolve().is_relative_to(destination):
                raise RuntimeError('Unsafe archive path')
        source.extractall(destination)
mpfb = cache / 'mpfb2'
if not mpfb.exists():
    subprocess.run(['git', 'clone', '--no-checkout', sources['mpfb']['repository'], str(mpfb)], check=True)
subprocess.run(['git', '-C', str(mpfb), 'checkout', '--detach', sources['mpfb']['commit']], check=True)
print(f'Sources ready: --source {cache} --mpfb {mpfb}')
