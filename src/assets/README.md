# Map provenance

`earth-land.json` contains projected land polygons derived from Natural Earth's 1:110m land GeoJSON. The asset records its upstream URL and the SHA-256 of the downloaded GeoJSON. Coordinates use an equirectangular projection into a 720 by 360 view box, rounded to one decimal place. Country markers are separate presentation data, not outage epicentres or network locations.

Natural Earth data is [public domain](https://www.naturalearthdata.com/about/terms-of-use/). The [upstream dataset](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson) is bundled locally so viewing the map does not fetch tiles or contact a map provider.

This licence applies to the geographic outline, not Cloudflare Radar data. No Radar data is included in this asset.
