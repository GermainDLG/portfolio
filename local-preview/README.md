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
Do not open the HTML as a `file://` URL: BeyondMaps needs HTTP to load its planet data.

## Refresh project files

```powershell
python .\local-preview\prepare.py
```

This copies the BeyondMaps build, six table-pairing prototypes, design PDFs, two stock-simulator
PDFs, and saved newsletter digest into the corresponding folders inside `local-preview`.
It copies only the selected public files, excluding source credentials, environments, and application data.
Re-run this after changing the underlying projects; the Python launcher also runs it automatically.
These exported files are part of the static portfolio and should be included when serving it elsewhere.

BeyondMaps has been rebuilt with relative asset and dataset URLs. To update its source:

```powershell
cd .\BeyondMaps\beyondmaps\explorer
npm run build
cd ..\..\..
python .\local-preview\prepare.py
```

## Project order and previews

- BeyondMaps’s clickable preview is a screenshot of its actual initial view, saved as
  `media/beyondmaps-preview.jpg`. Replace that image if the demo changes.
- Prototype order follows the explicit timeline in
  `QuicksilverLabs-Copy/data-harmony-ui/omniscience_handoff.md`:
  GitHub basic → GitHub recommended → GitHub table → Popup action → Table vs. column → Heatmap.
- Dates are based on the resume (HCII: August 2026), BeyondMaps' source README
  (started April 7, 2026; still in progress), course README/process books
  (Spring 2026 and Fall 2025), and the requested Summer 2026 Quicksilver dates.
  October import commits were not used as project dates.
- The newsletter is a saved digest. MazeInteractive remains a desktop application.
- Alien Stock Sim links to `stock-simulator/index.html`, a browser adaptation with simulated prices, trading, and local browser persistence. The original Django application has a separate local launcher; see `../Alien Stock Sim/PORTFOLIO.md`.

## Orbital graph gallery

The gallery shows orbital paths/radius first, paired Chronos/Moirai start-time
experiments second, the Chronos position-and-velocity experiment third, and paired
heatmaps fourth. Moirai has no velocity result for this project. Graphs open at full size.
The preview image is an actual screenshot of the gallery's orbital basics section.

Export the notebook figures:

```powershell
python .\local-preview\render_orbits.py
```

Run the original forecasting experiments using the existing project environment:

```powershell
.\QuicksilverLabs-Copy\space\.venv\Scripts\python.exe .\local-preview\render_orbits.py --experiments
```

The exporter uses cached models offline, saves each completed experiment, and skips
existing exported images so interrupted runs can resume. To regenerate a particular
experiment, remove only its corresponding PNG from `media/orbits/` before rerunning.
It uses the original scripts and their original sample counts, eccentricities,
random seeds, model choices, and color scales. It does not invent or interpolate results.

## Editing the design

- **Colors:** Edit the marked `:root` palette at the top of `portfolio.css`.
- **Font:** The shared font is Google Sans Code, loaded from Google Fonts; monospace is the fallback.
- **About text:** Edit the `intro-copy` paragraphs in `index.html`.
- **Portrait:** The image is `local-preview/portfolio_image.jpg`, referenced with a relative
  URL in `index.html`. Replace that file to update your photo.
- **Pages:** About Me and Projects use `#about` and `#projects`; `#contact` jumps to the
  About Me contact section. Browser Back and direct links are supported.
- **Contact:** Fields validate in the browser; submission opens a prefilled email to davisgermain621@gmail.com in the visitor's email app. The visitor sends it there. A direct email link is also provided.

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
prototype scripts and styles, screenshot, orbital graphs, and BeyondMaps planet dataset.
