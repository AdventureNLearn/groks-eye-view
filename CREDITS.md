# Credits

## God's Eye View — original

**Grok's Eye View** exists because [Bilawal Sidhu](https://github.com/bilawalsidhu)
built **[God's Eye View](https://github.com/bilawalsidhu/gods-eye-view)** and
released it under the MIT License.

The original is the source of the idea and the public-cockpit feeling. This
repo is a separate web recreation with a Grok-shaped personality. It does not
copy the original source tree. If you like this, go star and support that
project.

## Live public sources

| Layer | Source | Notes |
| --- | --- | --- |
| Aircraft | [OpenSky Network](https://opensky-network.org/) | Primary ADS-B. Rate limits apply. |
| Aircraft (fallback) | [adsb.lol](https://adsb.lol/) | Regional hubs + military. |
| Satellites | [CelesTrak](https://celestrak.org/) | GP / SGP4 catalog. |
| ISS | [Where The ISS At](https://wheretheiss.at/) | Live position. |
| Earthquakes | [USGS](https://earthquake.usgs.gov/) | M2.5+ day feed. |
| Fires | [NASA EONET](https://eonet.gsfc.nasa.gov/) | Natural events. |
| Launches | [Launch Library 2](https://thespacedevs.com/) | Upcoming missions. |
| Places | [Nominatim / OSM](https://nominatim.org/) | Geocoding. |
| Weather | [Open-Meteo](https://open-meteo.com/) | Tracked-contact WX. |
| Globe imagery | Esri World Imagery, OpenStreetMap, CARTO | Tiles at runtime. |
| Creedence radio | [Exclusive Radio](https://exclusive.radio/) | Public internet stream. |
| 70s / americana radio | [SomaFM](https://somafm.com/) | Left Coast 70s, Boot Liquor. |
| Station search | [Radio Browser](https://www.radio-browser.info/) | Directory for custom adds. |

Shipping lanes are modeled corridors, not live AIS. When a live flight feed is
unavailable the globe says so and draws simulated routes.

## Engine

- [CesiumJS](https://cesium.com/platform/cesiumjs/) — 3D globe
- [satellite.js](https://github.com/shashwatak/satellite-js) — SGP4

## License

Code: MIT. Third-party data and imagery: their own terms. Not for navigation.
