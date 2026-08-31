/**
 * Per-venue scenery ingestion config: which lidar collection, which orthophoto
 * scenes, and which ground patches get measured.
 *
 * This lives beside the baker rather than inside its `VENUES` table because the
 * ingestion round is not allowed to touch `scripts/layline-bake-venue.mjs`: the
 * shipped `long-beach.bin` has to stay byte-identical while the derived
 * products land. The baker imports this in the overhaul round that consumes
 * them; until then `scripts/layline-derive-scenery.mjs` is the only reader.
 *
 * `origin` and `bearing` are copies of the baker's own venue definition and are
 * checked against it, so a drift in either is a loud failure rather than a
 * silently misplaced tree list.
 *
 * The `provider` discriminator is what a second venue would switch on. Howe
 * Sound would be `s3-laz` (LidarBC mapsheet listing, UTM 10N, orthophotos in
 * the same bucket); Hauraki Gulf would be `cog-dsm` (LINZ DEM/DSM GeoTIFF pairs
 * in EPSG:2193, no point decode at all). Only the index strategy and the CRS
 * change; the derivation stage downstream is shared.
 */

/** The 16 NAIP quarter-quads tiling the 10.5 km Long Beach venue disc,
 * resolved once by a `Category=1` catalogue query over the venue envelope
 * (.tmp/lidar-research/raw/naip-catalog-venue.json). All 16 are NAIP 2022 at
 * 0.6 m, flown 11 and 12 May 2022; the scene names carry the date, so
 * `m_3311815_se_11_060_20220511` is quarter-quad 33118-15 SE, UTM 11, 60 cm,
 * 2022-05-11. Locking to these OBJECTIDs is what keeps an export reproducible
 * as the national mosaic gains newer years. */
const LONG_BEACH_QUADS = [
  { id: 16089, name: "m_3311814_ne_11_060_20220511", year: 2022, acquired: "2022-05-11", lon: [-118.3157, -118.2469], lat: [33.81, 33.8775] },
  { id: 16091, name: "m_3311814_se_11_060_20220511", year: 2022, acquired: "2022-05-11", lon: [-118.3157, -118.2469], lat: [33.7475, 33.815] },
  { id: 16093, name: "m_3311815_ne_11_060_20220511", year: 2022, acquired: "2022-05-11", lon: [-118.1906, -118.122], lat: [33.8101, 33.8774] },
  { id: 16094, name: "m_3311815_nw_11_060_20220511", year: 2022, acquired: "2022-05-11", lon: [-118.2531, -118.1845], lat: [33.81, 33.8775] },
  { id: 16095, name: "m_3311815_se_11_060_20220511", year: 2022, acquired: "2022-05-11", lon: [-118.1906, -118.122], lat: [33.7476, 33.8149] },
  { id: 16096, name: "m_3311815_sw_11_060_20220511", year: 2022, acquired: "2022-05-11", lon: [-118.2531, -118.1845], lat: [33.7475, 33.815] },
  { id: 16097, name: "m_3311816_ne_11_060_20220512", year: 2022, acquired: "2022-05-12", lon: [-118.0655, -117.9971], lat: [33.8102, 33.8773] },
  { id: 16098, name: "m_3311816_nw_11_060_20220512", year: 2022, acquired: "2022-05-12", lon: [-118.128, -118.0596], lat: [33.8101, 33.8774] },
  { id: 16099, name: "m_3311816_se_11_060_20220512", year: 2022, acquired: "2022-05-12", lon: [-118.0655, -117.9971], lat: [33.7477, 33.8148] },
  { id: 16100, name: "m_3311816_sw_11_060_20220512", year: 2022, acquired: "2022-05-12", lon: [-118.128, -118.0596], lat: [33.7476, 33.8149] },
  { id: 16102, name: "m_3311822_ne_11_060_20220511", year: 2022, acquired: "2022-05-11", lon: [-118.3157, -118.2469], lat: [33.685, 33.7525] },
  { id: 16104, name: "m_3311823_ne_11_060_20220511", year: 2022, acquired: "2022-05-11", lon: [-118.1906, -118.122], lat: [33.6851, 33.7524] },
  { id: 16105, name: "m_3311823_nw_11_060_20220511", year: 2022, acquired: "2022-05-11", lon: [-118.2531, -118.1844], lat: [33.685, 33.7525] },
  { id: 16106, name: "m_3311824_ne_11_060_20220512", year: 2022, acquired: "2022-05-12", lon: [-118.0654, -117.9971], lat: [33.6852, 33.7523] },
  { id: 16107, name: "m_3311824_nw_11_060_20220512", year: 2022, acquired: "2022-05-12", lon: [-118.128, -118.0596], lat: [33.6851, 33.7524] },
  { id: 16108, name: "m_3311824_se_11_060_20220512", year: 2022, acquired: "2022-05-12", lon: [-118.0655, -117.9971], lat: [33.6227, 33.6898] },
];

export const VENUE_SCENERY = {
  "long-beach": {
    /* Copies of scripts/layline-bake-venue.mjs VENUES["long-beach"], asserted
     * against it by tests/layline-scenery-ingest.test.ts. */
    origin: { lat: 33.742, lon: -118.155 },
    bearing: 215,

    lidar: {
      provider: "ept",
      endpoint: "https://s3-us-west-2.amazonaws.com/usgs-lidar-public",
      collection: "CA_LosAngeles_1_B23",
      /* 2016 is 2.05 pts/m2 over Island White against B23's 6.52 and reaches
       * only depth 10-11. Named so the choice is on the record, not used. */
      fallback: "USGS_LPC_CA_LosAngeles_2016_LAS_2018",
      srs: "EPSG:3857",
      verticalDatum: "NAVD88 (Geoid18)",
      /* Measured from the GPS times in the nodes themselves, not from a
       * catalogue field. The flight ran 04:19-05:21 UTC, which is 21:19-22:21
       * PDT on 2023-10-02: this survey was flown at night. */
      acquired: "2023-10-03",
      maxDepth: 13,
      classes: { ground: [2, 20], water: [9], noise: [7, 18], bridge: [17] },
      /* The finding that shapes the whole derivation. This collection emits
       * classes 1, 2, 7, 9, 17, 18 and 20 and never 5 (high vegetation) or 6
       * (building), including over a mature closed canopy at Recreation Park.
       * OSM stays the source of semantics; lidar contributes pure geometry, so
       * trees and masses come out of a normalised height model. */
      hasVegetationClass: false,
      hasBuildingClass: false,
    },

    ortho: {
      provider: "arcgis-imageserver",
      service: "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer",
      pin: "lockRaster",
      quads: LONG_BEACH_QUADS,
      groundSampleM: 0.6,
      acquired: "2022-05-11",
      rendering: { rasterFunction: "NaturalColor", interpolation: "RSP_BilinearInterpolation" },
      attribution: "NAIP orthoimagery, USGS/USDA public domain, via The National Map",
    },

    /* Ground patches, each a course-frame axis-aligned square about a centre
     * the baker already pins. The four islands and the crane rows are 3DEP's
     * own probe centres; `halfM` is the research round's box, kept so the
     * measured numbers stay comparable. */
    patches: [
      { name: "islandWhite", kind: "island", lon: -118.16, lat: 33.75249, halfM: 200 },
      { name: "islandGrissom", kind: "island", lon: -118.18162, lat: 33.75921, halfM: 200 },
      { name: "islandChaffee", kind: "island", lon: -118.13942, lat: 33.73987, halfM: 200 },
      { name: "islandFreeman", kind: "island", lon: -118.16188, lat: 33.7417, halfM: 200 },
      /* Centre of OSM way 1433959973, the Long Beach International Gateway
       * deck: both pylons and the class-17 deck are inside 300 m. */
      { name: "gatewayTowers", kind: "hero", lon: -118.2213, lat: 33.7648, halfM: 300 },
      { name: "cranesPierJ", kind: "infrastructure", lon: -118.2015, lat: 33.7405, halfM: 250 },
      { name: "downtownLB", kind: "massing", lon: -118.1937, lat: 33.7683, halfM: 250 },
      /* Queen Mary and the Spruce Goose dome (outer way of relation 6573072)
       * sit inside one 600 m box. */
      { name: "queenMary", kind: "hero", lon: -118.1903, lat: 33.7527, halfM: 300 },
    ],

    /* Island rings, by the OSM way ids the baker's `heroes.islands` pins. The
     * centres are the ring centroids, and the derivation re-derives each from
     * the Q1 cache and fails if it has moved more than `centroidToleranceM`. */
    islands: [
      { name: "islandWhite", label: "White", way: 40500920, patch: "islandWhite" },
      { name: "islandGrissom", label: "Grissom", way: 40500921, patch: "islandGrissom" },
      { name: "islandChaffee", label: "Chaffee", way: 40500949, patch: "islandChaffee" },
      { name: "islandFreeman", label: "Freeman", way: 40500950, patch: "islandFreeman" },
    ],
    centroidToleranceM: 40,

    /* NAIP crops, in ground metres about a centre. The first five are the
     * research round's targets, kept verbatim so their medians are directly
     * comparable; the two extra islands use the same recipe. */
    orthoCrops: [
      { name: "islandWhite", lon: -118.16, lat: 33.75249, metres: 400 },
      { name: "islandGrissom", lon: -118.18162, lat: 33.75921, metres: 400 },
      { name: "islandChaffee", lon: -118.13942, lat: 33.73987, metres: 400 },
      { name: "islandFreeman", lon: -118.16188, lat: 33.7417, metres: 400 },
      { name: "tankFarm", lon: -118.2137, lat: 33.7745, metres: 500 },
      { name: "cranesPierJ", lon: -118.2015, lat: 33.7405, metres: 500 },
      { name: "openWater", lon: -118.155, lat: 33.742, metres: 300 },
    ],

    /* Point swatches: a 15 px median at a named place, the readback the
     * research round reported. `material` is the substance the swatch is
     * evidence for, in the vocabulary of the baker's MAT_* indices. */
    swatchPoints: [
      { name: "islandDeck", crop: "islandWhite", lon: -118.16, lat: 33.75249, material: "islandDeck", windowPx: 15 },
      { name: "islandPlanting", crop: "islandGrissom", lon: -118.18162, lat: 33.75921, material: "veg", windowPx: 15 },
      { name: "tankFarm", crop: "tankFarm", lon: -118.2137, lat: 33.7745, material: "tank", windowPx: 15 },
      { name: "portApron", crop: "cranesPierJ", lon: -118.2015, lat: 33.7405, material: "apron", windowPx: 15 },
      { name: "openWater", crop: "openWater", lon: -118.155, lat: 33.742, material: "water", windowPx: 15 },
    ],

    /* Derivation parameters. Every one of these changes an output, so they are
     * config rather than literals buried in the algorithm. */
    derive: {
      cellM: 1,
      /* One 3x3 smoothing pass before the local-maximum sweep. Raw 1 m CHM
       * maxima fire several times per crown (594 on Island White); radius 1
       * gives 268 and radius 2 gives 170. The height distribution barely
       * moves across all three, the count does, so the count carries a stated
       * tolerance of roughly a factor of three. */
      crownSmoothRadius: 1,
      crownMinHeightM: 3,
      crownMaxHeightM: 35,
      massThresholdM: 20,
      massMinCells: 8,
      /* Crowns inside a detected mass's bounding box (plus this pad) are
       * screen panels, rig structure or rooftop plant, not trees. */
      massExclusionPadM: 2,
      /* Masses are matched to the nearest OSM element carrying a height tag
       * within this range; beyond it the mass keeps its geometry and reports
       * no semantic match. */
      osmMatchRadiusM: 40,
      /* Signed distance bins for the shoreline profile, negative outboard of
       * the OSM waterline. The deck reference is the inboard plateau. */
      shorelineBinM: 1,
      shorelineRangeM: [-40, 90],
      shorelineDeckWindowM: [40, 90],
      shorelineCrownWindowM: [-20, 40],
      shorelineMinBinPoints: 25,
      /* Colour masks, in signed distance from the OSM waterline. The rim band
       * is centred on the island's own measured rim crown rather than on the
       * ring: the ring is the waterline and the crown stands 8-12 m inboard of
       * it, so a band about the ring samples wet rock and reads as sea. The
       * deck band starts that far again inboard of the crown. */
      rimSwatchHalfWidthM: 4,
      deckSwatchInboardM: 20,
      waterSwatchOutboardM: 15,
      heightFieldFillPasses: 40,
    },

    /* Overpass responses this pipeline reads but does not own: the baker
     * fetches them, and the query text lives with the query in
     * scripts/layline-bake-venue.mjs. Recorded by file and sha256 so a product
     * still names the exact bytes it was derived from. */
    osmInputs: [
      { file: "overpass-long-beach.json", note: "baker Q1: coastline, breakwater and crane ways/nodes over the clip disc + 1500 m" },
      { file: "overpass-q2-long-beach.json", note: "baker Q2: buildings with a height tag at or over MASS_MIN_H" },
      { file: "overpass-q5-long-beach.json", note: "baker Q5: hero anchors pinned by OSM id, plus the Signal Hill well cluster" },
    ],
  },
};

export const venueScenery = (id) => {
  const config = VENUE_SCENERY[id];
  if (!config) {
    throw new Error(`no scenery config for "${id}"; known: ${Object.keys(VENUE_SCENERY).join(", ")}`);
  }
  return config;
};
