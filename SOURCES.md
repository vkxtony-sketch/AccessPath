# AccessPath — data source notes

Last checked: October 14, 2026.

This prototype intentionally starts from a small number of public sources. It does not claim that the listed sites or routes have been independently audited by the project creator.

Machine-readable source details (publisher, title, URL, license, retrieval date, and notes) live in `data/sources.json`. Each accessibility claim in `data/places.json` references one of those records by `sourceId`. This file is the human-readable companion to that catalog.

## 1. Louisville Waterfront Park

- Public information source: https://ourwaterfront.org/feature/accessibility/
- Address/contact source: https://ourwaterfront.org/contact/
- Published source says the park is wheelchair accessible, walkways were built to ADA standards, alternate walkways are present where stairs exist, and accessible signage includes raised letters, Braille, tactile graphics, and textured sidewalk cues.
- Prototype uses: wheelchair access information and tactile/Braille wayfinding information.
- Not verified here: accessible parking details at a specific lot, all route conditions, temporary closures, restroom access, exact route surface/grade, or current maintenance state.

## 2. Crescent Hill Branch Library

- Branch-specific source: https://www.lfpl.org/crescent-hill-1
- Branch directory: https://www.lfpl.org/branches
- Branch-specific published source describes wheelchair ramps from the parking lot and Birchwood Avenue, a push-button door, an interior elevator to the lower level, and two accessible parking spots next to the ramp.
- Prototype uses: wheelchair/ramp/door/elevator information and accessible parking information.
- Not verified here: whether a particular route is currently unobstructed, door/elevator service status, dimensions, exact step-free path from every parking spot, or current conditions.

## 3. Bon Air Branch Library

- Branch address: https://www.lfpl.org/branches
- Library-wide accessibility source: https://www.lfpl.org/accessibility-services
- The library's published accessibility-services page says all library locations are wheelchair accessible and offer parking for vehicles with disability permits. The branch address is listed in the branch directory.
- Prototype uses: library-wide wheelchair-access and disability-permit parking statements, with a caveat that branch-specific arrangements should be confirmed.
- Not verified here: ramp/door/elevator dimensions, path condition, exact parking configuration, tactile/Braille wayfinding, restroom details, or current conditions.

## 4. Library Computer Center

- Address source: https://www.lfpl.org/branches
- Library-wide accessibility source: https://www.lfpl.org/accessibility-services
- The branch directory lists the Library Computer Center at 721 South Brook Street. The library-wide accessibility source says all library locations are wheelchair accessible and offer parking for vehicles with disability permits.
- Prototype uses: library-wide wheelchair-access and disability-permit parking statements; exact arrangements at this center are explicitly caveated.
- Not verified here: exact entrance, parking spaces, access route, service hours, equipment accessibility, tactile/Braille wayfinding, or current conditions.

## Map

- Library: Leaflet 1.9.4, loaded from unpkg CDN, https://leafletjs.com/
- Base tiles: OpenStreetMap, https://www.openstreetmap.org/copyright
- Seed coordinates are approximate and should be checked against on-site entrances before real public use.

## City data source for a future version

- Louisville Metro Open Data Portal: https://data.louisvilleky.gov/
- 2025 LMPHW Public Facilities Survey — Restrooms: https://data.louisvilleky.gov/maps/LOJIC%3A%3A2025-lmphw-public-facilities-survey-restrooms/about
- The portal page says the dataset covers public restrooms at Metro-owned or -managed facilities and includes operating status, weekday hours, ADA accessibility, and other attributes. Before importing it, verify the downloadable dataset's data dictionary, geographic coverage, update cadence, license/terms, and whether records may be redistributed in this app.
