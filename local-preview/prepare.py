"""Copy only public demo assets into the portable portfolio preview."""
from pathlib import Path
import shutil
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
TYPES = {'.html', '.css', '.js', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.pdf', '.woff2'}
def copy_public(source, destination, extensions=TYPES):
    count = 0
    for path in source.rglob('*'):
        relative = path.relative_to(source)
        if any(part.startswith('.') or part in {'node_modules', '__pycache__'} for part in relative.parts):
            continue
        if path.is_file() and path.suffix.lower() in extensions:
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
            count += 1
    return count

def prepare():
    count = copy_public(ROOT / 'BeyondMaps/beyondmaps/explorer/dist', HERE / 'beyondmaps')
    for variant in ['github-basic', 'github-recommended', 'github-table', 'popup-action', 'table-vs-column', 'heatmap']:
        count += copy_public(ROOT / 'QuicksilverLabs-Copy/data-harmony-ui' / variant, HERE / 'data-harmony' / variant, {'.html', '.css', '.js'})
    count += copy_public(ROOT / 'Design of AI Products', HERE / 'documents', {'.pdf'})
    for filename in ['Spec Document.pdf', 'Sprint #1 Presentation.pdf']:
        target = HERE / 'stock-documents' / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / 'Alien Stock Sim' / filename, target)
        count += 1
    target = HERE / 'newsletter-preview/index.html'
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / 'QuicksilverLabs-Copy/newsletter-filter/digest_dryrun.html', target)
    print(f'Prepared {count + 1} public demo and document files.', flush=True)

if __name__ == '__main__':
    prepare()
