# MyCrew liveries

The tools that build the WANTED and MyCrew liveries for Microsoft Flight
Simulator: Fenix A319/A320/A321, FlyByWire A32NX and FSLTL traffic.

Side-view designs in SVG (`designs/`) are rendered (`scripts/render-art.mjs`),
laid onto each model through Blender position maps (`blender/posmap.py`,
`blender/composite.py`) and packaged for the sim (`scripts/build-fleet.mjs`,
`build-fbw.mjs`, `build-fsltl.mjs`).

## What is not here

- `paintkits/`: the aircraft makers' paint kits. Download them from the makers.
- `tools/`: `texconv.exe` and `7zr.exe`. Download them from their projects.
- `dist/`, `work/`: built packages and working files.
- The C172's compiled parts, which derive from the sim's stock skin.

So the scripts do not run from a fresh clone without these.

## Licence

The code is under the Apache License 2.0 (`LICENSE`). The fonts in
`brand/fonts/` are under the SIL Open Font License (`brand/fonts/OFL.txt`, with
each font's copyright in its own metadata).

The licence does not cover the WANTED and MyCrew names and logos, or the livery
artwork they appear in. Those remain the property of their owners, all rights
reserved. Airbus, Fenix, FlyByWire, FSLTL and Microsoft Flight Simulator belong
to their owners; this project is not affiliated with them.
