# B787 Performance Web App

This app reproduces your Excel calculators in a browser UI:

- Short Trip Fuel
- Long Range Cruise
  - Includes FRF (30 min hold at 1500 ft using landing weight), contingency (5% min 350 max 1200), and user-entered additional holding minutes
- Holding (two altitudes for comparison)
- Lose Time Enroute
- Lose Time strategy comparison:
  - Option A: continue LRC then hold at fix
  - Option B: reduce to hold speed before fix to absorb delay enroute
  - Dynamic fuel burn with 1-minute integration and weight-updated interpolation
  - Optional one-time climb/descent after user-entered elapsed minutes
  - Enroute hold-speed phase uses a 5% fuel reduction vs pattern holding fuel flow
- Endurance Available
- IAS / Mach / TAS conversion (ICAO ISA + compressible flow model)
  - Altitude source: FL
  - Temperature source: direct OAT or ISA deviation

## Run

Serve the folder over HTTP (required for service worker/PWA):

```bash
cd /Users/russellgillson/Documents/New\ project
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## iPad Offline Install

1. Deploy this folder to a static HTTPS host (for example Netlify or GitHub Pages), or run it locally and browse from iPad while on the same Wi-Fi.
2. Open the app URL in Safari on iPad.
3. Tap `Share` -> `Add to Home Screen`.
4. Launch once while online so assets are cached by the service worker.
5. After that, it can run offline from the Home Screen app.

## Global Setting

- `Flight Plan Performance Adjustment` is entered once (global) and applied to all fuel-related calculators.

## Data Source Mapping

Spreadsheet source file: `/Users/russellgillson/Desktop/B787_Calculators Final.xlsx`

- `Tables!A3:K14` -> Short-trip GNM/ANM wind conversion
- `Tables!A18:L37` -> Long-range GNM/ANM conversion
- `Tables!A41:G60` -> Long-range flight fuel + time
- `Tables!A74:L85` -> Short-trip fuel/alt/time
- `Tables!M3:Q72` -> Holding IAS/TAS/FF_ENG lookup data

Raw extracted ranges are preserved in:

- `/Users/russellgillson/Documents/New project/extracted_data.json`
- `/Users/russellgillson/Documents/New project/lrc_data.js`
- `/Users/russellgillson/Documents/New project/flaps_up_data.js`

## IAS/Mach/TAS Model

The IAS/Mach/TAS calculator does **not** use the spreadsheet equation.
It uses:

- Layered ISA-1976 pressure model (geopotential altitude basis)
- Pressure altitude derived from FL
- Actual OAT or ISA deviation for local speed of sound
- Compressible subsonic pitot-static relations to convert IAS(CAS)-Mach-TAS

This is materially more accurate than the spreadsheet approximation across altitude.
