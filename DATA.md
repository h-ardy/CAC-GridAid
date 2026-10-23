# Data

Data for three counties: Los Angeles County, CA (06037), Harris County, TX (48201) and Athens County, OH (39009).
All data is public. 

| File | What it holds | Source |
| --- | --- | --- |
| zips_FIPS.json | Every ZIP code in the county: center point, people who rely on electricity-dependent medical equipment (`people`), all Medicare members (`medicare`), and `masked` | HHS emPOWER REST Service, ZIP layer (Medicare data, updated Aug 2026) |
| zip_outlines_FIPS.json | ZIP boundary shapes, `{"zips": {"45701": {"a": square miles, "p": [polygons]}}, "missing": [...]}`. Points are [lat, lon]. | U.S. Census Bureau 2020 cartographic ZCTA boundaries, simplified to about 75 m |
| county_outline_FIPS.geojson | The county boundary | U.S. Census Bureau TIGERweb |
| buildings_FIPS.json | Fire stations, libraries, community centers and schools from OpenStreetMap, with phone, website, address and operator when mappers recorded them | OpenStreetMap contributors, via the Overpass API |
| costs.json | Generator types and costs, planning inputs (FEMA share, turnout, watts per person, reach, days, kW per site) and county budgets | GridAid_County_Plans.xlsx (my cost research; sources listed in the workbook) |

Notes on the data:

- `people` is HHS emPOWER's `Power_Dependent_Devices_DME`. HHS shows any count from 1 to 10 as 11 for privacy; those ZIPs have `masked: true`.
- ZIP centers are the centroids HHS returns for each ZIP.
- buildings_FIPS.json is the raw search result for a rectangle around the county. It still includes buildings just outside the county, buildings marked private (`access`), and some duplicates (the same school mapped twice). The app should filter these.
- ZIPs listed under `missing` in the outline files have no Census shape (P.O. box ZIPs); draw them as points.

Credit: the ZIP outline files and the raw OpenStreetMap and Census downloads were produced earlier by scripts from the GridAid project first built at a Hack Club hackathon with a team. The app code in this repository is new.

Licenses: OpenStreetMap data is (c) OpenStreetMap contributors, available under the Open Database License (ODbL). HHS emPOWER and Census data are U.S. government works.
