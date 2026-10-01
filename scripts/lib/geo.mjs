/**
 * The two frames the scenery ingestion moves between.
 *
 * EPSG:3857 (spherical web mercator) is what the 3DEP EPT collections and the
 * NAIP ImageServer both speak. Its horizontal unit is NOT a ground metre: at
 * latitude phi one mercator unit is cos(phi) metres, so a 62-unit octree node
 * over San Pedro Bay is 51.7 m across on the ground. Z is untouched by the
 * reprojection and stays real metres, NAVD88 orthometric for these collections.
 *
 * The course frame is the one the venue baker already baked L1 into: ENU metres
 * about the venue origin, rotated so +y runs up the course axis. It is
 * reproduced here from `scripts/layline-bake-venue.mjs` lines 326-327 constant
 * for constant, deliberately including `mPerLat = 110574` rather than a better
 * geodetic series. A WGS84 meridional series differs by about 3 m per km, which
 * is 30 m across the 10.5 km clip disc: derived products have to land in the
 * frame that is already on disk, not in a more correct one.
 */

const DEG = Math.PI / 180;
/** Spherical mercator radius, EPSG:3857's defining constant. */
export const R_MERCATOR = 6378137;

/** lon/lat degrees -> EPSG:3857 [x, y]. */
export function toMercator(lon, lat) {
  return [
    (lon * Math.PI * R_MERCATOR) / 180,
    R_MERCATOR * Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2)),
  ];
}

/** EPSG:3857 [x, y] -> lon/lat degrees. */
export function toLonLat(x, y) {
  return [
    (x * 180) / (Math.PI * R_MERCATOR),
    ((2 * Math.atan(Math.exp(y / R_MERCATOR)) - Math.PI / 2) * 180) / Math.PI,
  ];
}

/** Ground metres per mercator unit at a latitude. */
export const mercatorScale = (lat) => Math.cos(lat * DEG);

/**
 * The baker's course frame for one venue origin and course bearing.
 *
 * `project` and `unproject` are the baker's own functions; `mPerLat` and
 * `mPerLon` are exported so a caller can show that it used them rather than a
 * substitute.
 */
export function courseFrame({ lat, lon, bearing }) {
  const lat0 = lat;
  const lon0 = lon;
  const mPerLat = 110574;
  const mPerLon = 111320 * Math.cos(lat0 * DEG);
  const bearingRad = bearing * DEG;
  const cosB = Math.cos(bearingRad);
  const sinB = Math.sin(bearingRad);

  /** lat/lon -> course-frame metres { x: across, y: up the course axis }. */
  const project = (plat, plon) => {
    const e = (plon - lon0) * mPerLon;
    const n = (plat - lat0) * mPerLat;
    return { x: e * cosB - n * sinB, y: e * sinB + n * cosB };
  };

  /** course-frame metres -> { lat, lon }. */
  const unproject = (x, y) => {
    const e = x * cosB + y * sinB;
    const n = -x * sinB + y * cosB;
    return { lat: lat0 + n / mPerLat, lon: lon0 + e / mPerLon };
  };

  /** EPSG:3857 -> course-frame metres, the conversion the EPT reader uses. */
  const projectMercator = (mx, my) => {
    const [plon, plat] = toLonLat(mx, my);
    return project(plat, plon);
  };

  return { lat0, lon0, bearing, mPerLat, mPerLon, project, unproject, projectMercator };
}

/**
 * The EPSG:3857 envelope enclosing a course-frame axis-aligned square.
 *
 * The course frame is rotated relative to mercator, so the enclosing envelope
 * is larger than the square: this is what decides which octree nodes have to be
 * fetched, and it must over-cover rather than under-cover.
 */
export function mercatorEnvelopeOfCourseBox(frame, { x0, y0, x1, y1 }, padM = 0) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [cx, cy] of [
    [x0 - padM, y0 - padM],
    [x1 + padM, y0 - padM],
    [x1 + padM, y1 + padM],
    [x0 - padM, y1 + padM],
  ]) {
    const { lat, lon } = frame.unproject(cx, cy);
    const [mx, my] = toMercator(lon, lat);
    if (mx < minX) minX = mx;
    if (mx > maxX) maxX = mx;
    if (my < minY) minY = my;
    if (my > maxY) maxY = my;
  }
  return [minX, minY, maxX, maxY];
}
