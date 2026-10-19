# Local portfolio

## Open the website

From the portfolio folder:

```powershell
python .\local-preview\serve.py
```

Open http://localhost:8080. Keep the terminal running; press Ctrl+C to stop.
If the port is occupied, use `python .\local-preview\serve.py --port 8081`.
The launcher copies selected public demo files before serving and binds only to this computer.

You can also open `local-preview/index.html` with VS Code Live Server. The demo and document
links are relative, so the portfolio works both at the server root and under `/local-preview/`.
Do not open the HTML as a `file://` URL: StarExplorer needs HTTP to load its planet data.

## Refresh project files

```powershell
python .\local-preview\prepare.py
```

This copies the StarExplorer build, six table-pairing prototypes, design PDFs, two stock-simulator
PDFs, and saved newsletter digest into the corresponding folders inside `local-preview`.
It copies only the selected public files, excluding source credentials, environments, and application data.
Re-run this after changing the underlying projects; the Python launcher also runs it automatically.
These exported files are part of the static portfolio and should be included when serving it elsewhere.

StarExplorer has been rebuilt with relative asset and dataset URLs. To update its source:

```powershell
cd .\StarExplorer\star-explorer\explorer
npm run build
cd ..\..\..
python .\local-preview\prepare.py
```

## Project order and previews

- StarExplorer’s clickable preview is a screenshot of its actual initial view, saved as
  `media/starexplorer-preview.jpg`. Replace that image if the demo changes.
- Prototype order follows the explicit timeline in
  `QuicksilverLabs-Copy/data-harmony-ui/omniscience_handoff.md`:
  GitHub basic → GitHub recommended → GitHub table → Popup action → Table vs. column → Heatmap.
- No completion dates were inferred from file timestamps. The remaining project groups keep
  their existing order until reliable completion dates are supplied.
- The newsletter is a saved digest. MazeInteractive is a desktop application, and Alien Stock Sim
  still requires its own backend; neither has been converted into a live browser application.

## Orbital graph gallery

`orbital-forecasting/index.html` displays two genuine saved notebook outputs and one freshly run
Chronos-2 forecast plot. Each image opens at full size. Output files live in `media/orbits/`.
The two notebook images come from cells 2 and 3 of `space/notebooks/explore_orbits.ipynb`.
The forecast plot comes from the unchanged `space/scripts/radius/single_wave_chronos.py` script:
1,024 context samples, 512 forecast samples, realization 0, and eccentricities 0.1/0.3/0.5/0.7.

Export saved notebook images without additional packages:

```powershell
python .\local-preview\render_orbits.py
```

Regenerate the forecast using the existing space project environment and cached Chronos-2 model:

```powershell
.\QuicksilverLabs-Copy\space\.venv\Scripts\python.exe .\local-preview\render_orbits.py --forecast
```

The exporter runs offline and saves plots instead of opening graph windows.

## Editing the design

- **Colors:** Edit the marked `:root` palette at the top of `portfolio.css`.
- **Font:** The shared font is Google Sans Code, loaded from Google Fonts; monospace is the fallback.
- **About text:** Edit the `intro-copy` paragraphs in `index.html`.
- **Portrait:** Put your image at `local-preview/portrait.jpg`, then replace the
  `portrait-placeholder` div with the image tag shown above it in the HTML.
- **Pages:** About Me and Projects use `#about` and `#projects`; `#contact` jumps to the
  About Me contact section. Browser Back and direct links are supported.
- **Contact:** Fields validate in the browser; submission does not send or store messages.

## Check local links

Against the running preview (substitute your port):

```powershell
python .\local-preview\check_links.py http://127.0.0.1:8080/
```

To test a plain static server with the portfolio served under `/local-preview/`:

```powershell
python .\local-preview\check_links.py --static
```

The checker follows local links and supporting HTML assets, including the PDF documents,
prototype scripts and styles, screenshot, orbital graphs, and StarExplorer planet dataset.
