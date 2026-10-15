# AccessPath — Louisville prototype

**Purpose:** A mobile-friendly web prototype for finding published accessibility information and documenting potential barriers at public places in Louisville, Kentucky.

## What works in this first version

- Interactive OpenStreetMap map with four Louisville public destinations.
- Location data loads from `data/places.json`; sources load from `data/sources.json`. The app does not require editing `app.js` to add places.
- Search by location name, address, or type.
- Filters for wheelchair-access details, accessible-parking details, and tactile/Braille wayfinding.
- Each accessibility claim carries a `value` (`yes`, `limited`, `no`, or `unknown`), supporting `evidence`, a `scope`, a `sourceId`, and a `lastChecked` date. The map popup links to the cited source(s).
- A report form for potential barriers.
- Browser-local report storage using `localStorage`; map markers and the report counter update after a report is saved.
- Responsive layout, keyboard-accessible place cards, reduced-motion support, and form labels.
- The map fits the extent of the loaded locations when valid coordinates are present.

## Requirements

- A current version of Chrome, Edge, Firefox, or Safari.
- Internet connection for the Leaflet mapping library, OpenStreetMap tiles, and fonts.
- No `npm install`, API key, or paid service is required for this prototype.

## Run on Windows

1. Download and extract `AccessPath-Louisville-Prototype.zip`.
2. Open the extracted `accesspath` folder.
3. If Python is installed, open Command Prompt in that folder and run:

   ```bat
   py -m http.server 8000
   ```

   If `py` is not recognized but `python` is installed, run:

   ```bat
   python -m http.server 8000
   ```

4. Open <http://localhost:8000> in your browser.
5. Leave the command window running while testing. Press `Ctrl+C` to stop the local server.

You can try opening `index.html` directly, but a local server is the more reliable way to test browser storage and paths.

## Project files

- `index.html` — structure, accessibility labels, dialog, and page sections.
- `styles.css` — visual design and responsive layouts.
- `app.js` — data loading, map markers, filtering, report form, and local persistence.
- `data/places.json` — cleaned location records displayed by AccessPath.
- `data/sources.json` — publishers, titles, URLs, licenses, and retrieval dates for each cited source.
- `data/raw/` — original downloaded datasets (populated during data import).
- `scripts/` — planned helpers such as `normalize_data.py` for converting source data into the AccessPath format (added during data import).
- `SOURCES.md` — public information sources and data limitations.

### Location record format

Each record in `data/places.json` uses this structure for every accessibility feature (`wheelchair`, `parking`, `tactile`):

```json
{
  "value": "yes",
  "evidence": "official_source",
  "scope": "branch",
  "detail": "Description of the documented feature.",
  "sourceId": "source-record-id",
  "lastChecked": "2026-10-14"
}
```

`value` is one of `yes`, `limited`, `no`, or `unknown`. `evidence` is one of `official_source`, `field_checked`, `community_report`, or `unknown`. `sourceId` must match a key in `data/sources.json`. A `scope` of `system` means the claim applies to a whole library system rather than one branch.

## Important accuracy and privacy boundaries

- A `verified` label means that a cited public source documents that specific claim. It is not an independent inspection or ADA compliance certification.
- A feature marked `unknown` has not been verified for this prototype. Unknown does not mean absent or inaccessible.
- Coordinates are approximate map pins for discovery, not precision navigation. Confirm the actual entrance and conditions before visiting.
- The first version uses four seed locations, not a comprehensive city inventory.
- Reports are stored only in the current browser on the current device. They are not uploaded or sent to a government office, property manager, or other user.
- Do not enter names, personal medical details, contact information, or other sensitive information in reports.
- Do not describe the current app as offering turn-by-turn routing, a certified accessible route, live municipal data, or cross-user report syncing. Those features are not implemented yet.

## Suggested next steps

1. Test the site with keyboard only and on a phone-sized window.
2. Verify every map pin and feature with a person familiar with the location before presenting it as confirmed.
3. Ask potential users with different access needs to try the prototype and note where information is missing or confusing.
4. Consider importing the Louisville Metro Public Health and Wellness public-facilities inventory after checking data fields, license, update dates, and intended-use restrictions.
5. If reports should be shared across users, add a database and moderation process; avoid publishing unreviewed claims as facts.
6. Deploy the final build to a public HTTPS host and test the actual URL before recording the demo.

## Competition note

Be ready to explain the code, map library, source-data choices, limitations, and any AI assistance used. Follow the Congressional App Challenge's current rules and disclose AI use in your own words where required.
