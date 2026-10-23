# GridAid

GridAid helps county emergency planners decide where to put backup power sites, so people who rely on electricity-dependent medical equipment can reach power during a long outage.

When the grid goes down, someone on a home oxygen concentrator, a ventilator or home dialysis has hours, not days. The Human and Health Services counts these people for every ZIP code in the country, and public buildings like libraries, schools and community centers could serve as places to recharge equipment. GridAid puts the two together: it maps who needs power, picks the buildings that put the most of them within reach, and shows what the plan would cost.

Built by Jintong (Hardy) Wang for the 2026 Congressional App Challenge.

## What it does

**Page 1: the map.** Scroll down from the landing screen and the map opens into the planner. Pick a county and GridAid shades every ZIP code by how many people there rely on powered medical equipment, places the recommended backup sites, and draws how far each one reaches. Denser population is represented by a darker shade. The side panel shows the share of people covered, an estimated budget with the FEMA share, the chosen sites, and the ZIP codes still out of reach.

**The storm game.** Drag the astronaut onto the map to drop yourself somewhere in the county. A storm knocks out power to a random 80% of ZIP codes. Then slide the backup generators on one at a time and watch which ZIPs get power back and whether you can reach a site.

**Page 2: costs and logistics.** Change the number of sites, the reach and the generator type, and everything updates: the map, a big budget comparison, prices for all four generator types, and a site-by-site table with people served, expected visitors, power needed, contact details and things to check before committing. Clicking a site on the map finds it in the table, and the other way around.

**Join us.** At the bottom of page 1, building owners, county planners and volunteers can send a message through a short form.

## How sites are picked

Every candidate building is compared with every ZIP code using straight-line (haversine) distance. A ZIP counts as covered if its center is within the reach distance of a site.

Choosing the set of sites that covers the most people is the maximum coverage problem. GridAid uses a greedy algorithm: it adds the building that covers the most people who are not yet covered, then repeats until it has placed the recommended number of sites or everyone is covered. Greedy is guaranteed to reach at least about 63% of the best possible coverage. Because sites are only ever added, the order is also a build order: a county can start with site 1 and add the rest as money allows.

On the logistics page you can ask for more sites than are needed. Extra sites go where they add the most backup, favoring people who can reach only one site so far. Budget is estimated based on population and location, so city officials are able to enter exact numbers that they know.

Candidate buildings come from OpenStreetMap: fire stations, libraries, community centers and schools inside the county. Unnamed buildings and buildings marked private are dropped, and a building mapped twice (same name, within about 150 meters) is kept once.

## Costs

Generator costs, fuel use and planning inputs come from GridAid_County_Plans.xlsx, my cost research workbook, which lists its sources.

| Option | Setup cost per site |
| --- | --- |
| Hookup only (rent a generator when needed) | $10,000 |
| Permanent generator, diesel | $58,333 |
| Permanent generator, natural gas | $104,644 |
| Solar panels plus battery | $589,147 |

Planning assumptions: FEMA could cover 75% of setup cost through hazard mitigation grants, 25% of covered people show up at a site, each needs 275 to 550 watts, and an outage lasts 3 days.

## Data

All data is public. See [DATA.md](DATA.md) for every file and its source.

- People who rely on powered medical equipment: HHS emPOWER program, ZIP level (Medicare data). HHS reports any count from 1 to 10 as 11 for privacy.
- ZIP and county boundaries: U.S. Census Bureau.
- Buildings: OpenStreetMap contributors, via the Overpass API.

## Limits

- emPOWER counts only Medicare members, so the real number of people who depend on power is higher.
- Distance is a straight line, not a drive. Rivers, highways and hills make real trips longer.
- People have to travel to a site. GridAid doesn't plan for delivering power or batteries to homes. Some utilities run programs for that, like PG&E's Portable Battery Program.
- It doesn't know which buildings already have a backup generator.
- OpenStreetMap is mapped by volunteers, so some buildings are missing or have no phone or website listed.
- Costs are planning estimates, not quotes.

## Built with

HTML, CSS and JavaScript, with no framework or build step.

- [Leaflet](https://leafletjs.com/) for the maps, with Esri World Light Gray Base tiles
- [Formspree](https://formspree.io/) for the Join us form
- Fonts: Source Serif 4 and Public Sans from Google Fonts

## Run it locally

The pages load data files with `fetch`, so they need a local server rather than opening the HTML file directly.

```
git clone https://github.com/h-ardy/CAC-GridAid.git
cd CAC-GridAid
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Files

| File | What it does |
| --- | --- |
| index.html | Page 1: landing, map planner and Join us |
| landing.js | The scroll animation: grid glow, rocket launch, smoke and the map opening |
| app.js | Page 1 map, coverage, budget and ZIP search |
| game.js | The astronaut storm game |
| reveal.js | Fades the Join us section in as you scroll to it |
| logistics.html, logistics.js | Page 2: costs, generator comparison and site table |
| shared.js | Data loading, distance, building cleanup and the site picker, used by both pages |
| style.css | All styles |
| data/ | County data files (see DATA.md) |

## Credits

I used Claude, an AI assistant made by Anthropic, while building this. It wrote drafts that I added to the project and it helped me find and fix bugs. 

I decided what the app does, how it looks and how it works. The cost research and planning numbers are my own.

## License

Code: MIT, see [LICENSE](LICENSE). OpenStreetMap data is (c) OpenStreetMap contributors under the Open Database License. HHS emPOWER and Census data are U.S. government works.
