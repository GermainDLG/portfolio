"""Export genuine orbital notebook and forecasting outputs for the portfolio."""
from pathlib import Path
import os, sys, json, base64, runpy
HERE = Path(__file__).resolve().parent
SPACE = HERE.parent / 'QuicksilverLabs-Copy/space'
OUT = HERE / 'media/orbits'
OUT.mkdir(parents=True, exist_ok=True)
notebook = json.loads((SPACE / 'notebooks/explore_orbits.ipynb').read_text(encoding='utf-8'))
for cell, name in [(2, 'orbital-paths'), (3, 'orbital-radius')]:
    for output in notebook['cells'][cell]['outputs']:
        png = output.get('data', {}).get('image/png')
        if png:
            (OUT / f'{name}.png').write_bytes(base64.b64decode(''.join(png)))
            print(f'Exported saved notebook output: {name}', flush=True)
if '--forecast' in sys.argv:
    os.environ['MPLBACKEND'] = 'Agg'
    os.environ['HF_HUB_OFFLINE'] = '1'
    sys.path.insert(0, str(SPACE))
    import matplotlib.pyplot as plt
    def save_forecast():
        figure = plt.gcf()
        figure.suptitle('Chronos-2 orbital radius forecasts')
        figure.tight_layout()
        figure.savefig(OUT / 'chronos-radius-forecast.png', dpi=160, bbox_inches='tight')
        plt.close(figure)
        print('Saved Chronos-2 forecast plot from the original script.', flush=True)
    plt.show = save_forecast
    runpy.run_path(str(SPACE / 'scripts/radius/single_wave_chronos.py'), run_name='__main__')

if '--experiments' in sys.argv:
    os.environ['MPLBACKEND'] = 'Agg'
    os.environ['HF_HUB_OFFLINE'] = '1'
    sys.path.insert(0, str(SPACE))
    import importlib.util
    import matplotlib.pyplot as plt
    jobs = [
        ('radius/start_time_testing_chronos.py', 'start-time-chronos', 'Chronos-2 · start-time testing'),
        ('radius/start_time_testing_moirai.py', 'start-time-moirai', 'Moirai-2 · start-time testing'),
        ('XYPairs/generate_orbit_with_velocity_chronos.py', 'velocity-chronos', 'Chronos-2 · position and velocity'),
        ('radius/eccentricity_heatmap_chronos.py', 'heatmap-chronos', 'Chronos-2 · eccentricity heatmap'),
        ('radius/eccentricity_heatmap_moirai.py', 'heatmap-moirai', 'Moirai-2 · eccentricity heatmap'),
    ]
    for script, filename, title in jobs:
        if '--only' in sys.argv and filename != sys.argv[sys.argv.index('--only') + 1]:
            continue
        output = OUT / f'{filename}.png'
        if output.exists():
            print(f'Already exported: {filename}', flush=True)
            continue
        print(f'Running original experiment: {script}', flush=True)
        spec = importlib.util.spec_from_file_location(filename.replace('-', '_'), SPACE / 'scripts' / script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        def save_experiment(output=output, title=title):
            fig = plt.gcf()
            fig.suptitle(title)
            fig.tight_layout()
            fig.savefig(output, dpi=160, bbox_inches='tight')
            plt.close(fig)
            print(f'Saved {output.name}', flush=True)
        plt.show = save_experiment
        module.main()
