/**
 * Bake real-world shore geometry for a Layline venue.
 *
 * Input: a venue id from VENUES below (origin lat/lon, course bearing).
 * Sources, both keyless and fetched at bake time only:
 *   - OpenStreetMap via Overpass: coastline ways, breakwaters, cranes.
 *   - AWS/Mapzen Terrarium elevation tiles (z11), decoded here without deps.
 * Output, committed to the repo so the runtime never touches the network:
 *   - public/prototype/layline/venues/<id>.bin  (gzipped LVN1 mesh)
 *   - public/prototype/layline/venues/<id>.json (manifest + attribution)
 *   - .tmp/venue-<id>.svg (top-down debug plot, not committed)
 *
 * Frames. ENU metres at the origin; course frame is ENU rotated so +y points
 * up the course axis (bearing degrees true). The scene maps course (x, y) to
 * world (x, -z), y up, 1 unit = 1 m; positions in the binary are world frame,
 * so the runtime does no math beyond dequantisation.
 *
 * The mesh is drawn unlit in one flat colour mixed toward the sky by haze,
 * exactly like the procedural shore it replaces, so only the silhouette
 * matters: interior seams between the cap, the relief grid and the walls are
 * invisible by construction. That is what lets a layer stay one draw call.
 *
 * The output carries semantic layers (design doc 2.1), one merged mesh and one
 * draw call each: L1 near terrain, L2 urban massing, L3 port infrastructure,
 * L4 hero landmarks, L5 far horizon curtain. Layers exist so the runtime can
 * vary the material per class (L2 runs with the ground grain off, L3 and L4
 * carry a material index per vertex, L5 runs its own shader) and so a later
 * round can skip a class per rig.
 *
 * LVN3 layout, little endian, after gunzip:
 *   u32 magic 0x334e564c  ("LVN3")
 *   u32 layerCount, u32 flags (reserved, 0), u32 bodyOffset
 *   layerCount x 24-byte records:
 *     u16 classId    1 terrain, 2 massing, 3 infrastructure, 4 heroes,
 *                    5 curtain, 6 reserved for vegetation
 *     u8  material   0 shore, 1 curtain
 *     u8  drawOrder  ascending
 *     u8  attrMask   bit0 aFade, bit1 aShade, bit2 aDist (i16), bit3 aBase (u8;
 *                    bit0 base vertex, bit1 far band), bit4 aMat (u8; 0 = take
 *                    the layer's own height ramp, 1..6 = a named substance),
 *                    bit5 aSun (u8), bit6 aAo (u8)
 *     u8  yUnit      y quantisation denominator; 10 means 0.1 m
 *     u8  idx32      1 if this layer's indices are u32
 *     u8  pad
 *     u32 vertCount, u32 indexCount, u32 vertOffset, u32 indexOffset
 *                    both offsets relative to bodyOffset
 *   body, per layer, in the LVN2 order already shipped, each channel present
 *   only when attrMask claims it:
 *     i16 pos[vertCount*3]   world x (m), y (0.1 m units), z (m)
 *     u8  fade[vertCount]    0..255, the aFade the shore shader already takes
 *     u8  shade[vertCount]   hillshade, 128 = flat colour, /128 multiplies it
 *     i16 dist[vertCount]    true horizontal range in 4 m units (curtain only)
 *     u8  base[vertCount]    0 ridge / 255 base vertex (curtain only)
 *     u8  mat[vertCount]     named substance index (port and heroes)
 *     u8  sun[vertCount]     0..255, the fraction of the solar disc the vertex
 *                            sees past the venue's own triangles (round 2)
 *     u8  ao[vertCount]      0..255, the fraction of the hemisphere its normal
 *                            opens that nearby geometry leaves open (round 2)
 *     pad to 4 bytes
 *     u16|u32 idx[indexCount]
 *
 * The curtain (classId 5, material 1) reinterprets `pos`: xz is the unit
 * horizontal direction times 1000 and y is the true summit height above sea
 * level. Its vertex shader relocates every vertex to a fixed radius around the
 * camera, so the mesh must be drawn with frustumCulled = false.
 *
 * Run: node scripts/layline-bake-venue.mjs long-beach
 */

import { gzipSync, inflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const VENUES = {
  "long-beach": {
    /* Long Beach outer harbour, inside the breakwater: flat water with the
     * working port wrapped around it, open toward Queens Gate up the course. */
    origin: { lat: 33.742, lon: -118.155 },
    bearing: 215, // deg true, direction of the course axis (+y, toward windward)
    /* Mapzen is the tile set, not the survey. Over the continental US
     * Terrarium composites USGS 3DEP from zoom 10 and NASA SRTM from zoom 7,
     * and tilezen/joerd's attribution page asks for the US sources by name,
     * courtesy of the U.S. Geological Survey. Both the story colophon and the
     * races library foot carry the same three lines. */
    attribution: [
      "Map data (c) OpenStreetMap contributors, ODbL",
      "Elevation: Mapzen Terrarium tiles via AWS Open Data",
      "Terrain: USGS 3DEP and NASA SRTM, courtesy of the U.S. Geological Survey",
    ],
    /* L4 hero anchors (design doc 9). A hero is curated, so its footprint and
     * its orientation are pinned to named OSM elements rather than searched
     * for: the ids below were resolved once, by hand, and are recorded with
     * their tags in .tmp/venue-audit/round5/provenance.md. Pinning by id also
     * makes Q5 the smallest of the five queries and keeps the bake
     * reproducible against an edit to any nearby feature.
     *
     * `islands` and `islandTowers` are already inside the Q1 and Q2 bodies, so
     * they are read from those rather than refetched. */
    heroes: {
      islands: [
        // GNIS/OSM island rings, doc 1.2. Order is the doc's priority order.
        { way: 40500950, name: "Freeman" },
        { way: 40500920, name: "White" },
        { way: 40500949, name: "Chaffee" },
        { way: 40500921, name: "Grissom" },
      ],
      /* THUMS camouflage towers the LA County LiDAR import already carries.
       * Round 5 draws them as hero geometry, so L2 must not extrude them too. */
      islandTowers: [441318136, 1382215822, 248607358],
      queenMary: 438331516,
      gateway: 1433959973,
      lionsLighthouse: 1054968664,
      longBeachLight: 566859523,
      /* The Spruce Goose dome is the outer way of OSM relation 6573072, "Long
       * Beach Cruise Terminal", `alt_name=Spruce Goose dome`. Design doc 1.2
       * carried an [EST] position 300 m away, which would have put a 122 m
       * dome inside the Queen Mary's hull; this is the real footprint. */
      dome: 721199801,
      /* Signal Hill oil field, the box the doc's derrick cluster sits in. */
      derrickBox: { south: 33.79, west: -118.19, north: 33.815, east: -118.145 },
    },
  },
};

/* Geometry budget. CLIP_R is the disc the shore is cut to; FADE_* dissolve the
 * far coast into the haze the way the procedural arc's taper did, so nothing
 * ends at a visible clip edge. Camera far plane is 12000. */
const CLIP_R = 10500;
const FADE_START = 6000;
const FADE_END = 10000;
const BASE_Y = -4; // wall foot, below every Gerstner trough
/* z11 Terrarium is 64 m per sample and reads the whole working harbour as sea
 * level: the profile out to the oil islands on bearing 30 is 0.0 m at every
 * 100 m step. Wharf decks and island revetments here stand 4 to 7 m over MLLW,
 * so the floor is the deck, not the water; at 2.5 m the near islands rendered
 * as oil slicks lying on the surface. */
const MIN_SHORE_H = 6;
const SIMPLIFY_NEAR = 10; // m tolerance inside 3 km
const SIMPLIFY_FAR = 45; // m tolerance beyond 6 km
/* Fine lattice pitch, matched to the DEM's own 64 m sampling: at 120 m the
 * bake threw away half of what the source knows, which is where the isolated
 * cones came from. Flat blocks fall back to 2x pitch, see buildRelief. */
const RELIEF_CELL = 60;
const RELIEF_DETAIL = 3; // m of height range in a 2x2 block that earns fine cells
const RELIEF_NEAR = 3200; // m, blocks nearer than this stay fine regardless
const SPIKE_TOL = 40; // m a corner may stand over its neighbours' median
const MIN_FEATURE_W = 34; // m; fingers thinner than this are pinched off
const MIN_RING_AREA = 6000; // m^2
const MIN_RING_ANGLE = 0.0035; // rad of mean width from the origin, about 6 px
const MIN_RING_W = 14; // m, the floor that angle test relaxes to up close
const BATTER_MIN = 8; // m of horizontal run on the shore face
const BATTER_MAX = 18;
const DEM_ZOOM = 11;
const ARC_STEP = (2 * Math.PI) / 180;

/* L2, urban massing (design doc 2.1). A prism is only worth its 22 triangles
 * when it clears about 3 px: 25 m at 7.5 km is 3.5 px under the 1056.2 px/rad
 * focal length in doc 0.3, and 45 m holds that line out to the clip radius. */
const MASS_MIN_H = 25;
const MASS_NEAR = 7500;
const MASS_FAR_MIN_H = 45;
const MASS_FOOT = 8; // footprint vertices after simplification

/* L3, port infrastructure. Crane dimensions are the round-3 doc's 9.1 figures,
 * every one of them at or under a published dimension for these wharves:
 * apex 72 to 80 m over the deck (against 89.6 m published crane height at
 * Pier 400), 69 m front outreach (ZPMC 68.9 m at LBCT), 27 m back reach
 * (ZPMC 27.4 m), 30 m rail gauge (30.48 m published at Pier 300/400). */
const CRANE_MIN_SPACING = 55; // m, from the measured 54 m median crane spacing
const CRANE_MAX = 40;
const CRANE_LOD_NEAR = 5000; // m; beyond this a crane is under 11 px
const CRANE_APEX_MIN = 72;
const CRANE_APEX_SPAN = 8;
const CRANE_OUTREACH = 69;
const CRANE_BACKREACH = 27;
const CRANE_GAUGE = 30;
const CRANE_WIDTH = 18; // m along the wharf, between the two leg pairs
const TANK_MAX = 60;
const TANK_MIN_R = 7; // m; smaller tanks are under 2 px of width at 4 km
const TANK_MIN_H = 6; // m; below this a tank is a disc lying on the ground
const BLOCK_MAX = 40; // container blocks
const BLOCK_H = 12; // m, a five-high stack
const DECK_H = 6; // m, wharf and pier deck over MLLW (measured: 5.1 to 5.2 m)
const DECK_MAX_SEG = 66; // 12 triangles each, the doc's 800-triangle deck line
const DECK_W = 12; // m, a pier deck's drawn width
/* z11 Terrarium carries bathymetry and harbour spikes: the tiles read -361 m at
 * the Queen Mary berth and +85 m on the Pier G wharf (design doc 4.1), and an
 * unclamped read floated one Pier E crane 37 m over the water. A wharf is not a
 * hill. The LA County import measures these decks at 5.1 m on Pier J and 5.2 m
 * on Pier G, so anything standing on the apron takes a deck datum in this band
 * instead of the DEM's word for it. */
const DECK_MAX_H = 12;
const TANK_MAX_H = 25; // tank farms may sit inland, but not on a spike
const MASS_GROUND_MAX = 40; // DEM fallback for the 8 buildings with no OSM ele

/* L4, hero landmarks (design doc 9). Every dimension below is at or under a
 * published figure for the thing it draws; the sources, the rendered value and
 * the pixel height each one buys are tabulated in
 * .tmp/venue-audit/round5/provenance.md.
 *
 * The THUMS towers are the one line item the doc flagged against the approved
 * dimension policy: published heights are 175 ft (53.3 m, AOGHS) and 180 ft
 * (54.9 m, Long Beach Business Journal), and OSM's LiDAR import independently
 * measures 52.6 m of tower on Island White standing on ground at 6.0 m. The
 * bake uses the MEASURED 52.6 m for every unsourced tower rather than the
 * 54.9 m ceiling, so nothing here needs per-feature approval. */
/* The islands' own OSM rings carry `ele` 0, 0, 0 and 3, so their decks stand
 * within a metre or two of the MIN_SHORE_H the coast is floored at. Nothing on
 * an island is allowed a higher datum than this. */
const ISLE_DECK_MAX = 8;
/* Round 0 (catalogue 6.2) replaced two guesses with the lidar shoreline profile,
 * scripts/venue-data/long-beach/shoreline.json, which bins class 2 and 20 ground
 * z by signed distance to each island's own OSM ring.
 *
 *   island      crownAtM   lipM
 *   White         12       1.05
 *   Grissom        9       0.08   lip an outlier: that ring's crown barely
 *   Chaffee        8       1.08   stands over its deck at 1 m bins
 *   Freeman       11       1.28
 *
 * The inset takes the median crown distance, 10 m, against the 22 m guessed
 * from L1's batter width; the lip takes the median of the four measured lips,
 * 1.065 m, against 3.4. Both medians rather than means, because that is how the
 * product itself reduces a bin and because Grissom's 0.08 would drag a mean.
 *
 * Round 1 (catalogue 6.2) stops averaging the four islands together. Every
 * island whose profile is in the product is now swept from ITS OWN bins, so
 * these three are the fallback an island without a profile takes and the shape
 * of the rim is measured per island rather than shared. ISLE_RIM_W drops from
 * 18 m to the measured 2 m: the width from the crown to the first inboard bin
 * back at the deck is 3 m on White, 2 on Chaffee, 2 on Freeman and 1 on
 * Grissom (its crown bin is 9 and the strict `>` in rimProfile finds its deck
 * return at 10; audit round-1 K1). All four profiles resolve a deck return, so
 * the ISLE_RIM_W fallback fires on none of them; 2 m is the median of
 * {3, 2, 2, 1} and stands ready for a venue whose profile cannot resolve one. */
const ISLE_RIM_INSET = 10; // m inside the OSM waterline: shoreline.json median crownAtM
const ISLE_RIM_W = 2; // m of rock rim inboard of the crown: shoreline.json, see above
const ISLE_RIM_LIP = 1.07; // m of rim crown over the island deck: shoreline.json median lipM
/* Round 1 rebuilds the islands from the committed lidar and NAIP products
 * (scripts/venue-data/<venue>/), so the vegetation, tower and screen constants
 * round 5 invented are gone: the planting is trees.json's measured crowns, the
 * towers and screens are masses.json's measured structures, and the rim is
 * swept from shoreline.json's measured profile.
 *
 * What is left here is tessellation and the two shape calls no product carries.
 *
 * ISLE_RIM_STEP is a resolution, not a dimension: at 6 m a rim facet subtends
 * 32 px at the owner's 200 m viewing distance under the 1056.2 px/rad focal
 * length, which is enough for the armour to read as placed rock rather than as
 * a ruled ribbon. It is NOT a stone size. The armour is documented at up to
 * 5 tons, about 1.2 m of block [P1e], and the asset's positions are quantised
 * to 1 m in x and z, so a single stone cannot be carried by this format at all.
 *
 * ISLE_TOWER_MIN_TOP separates the drilling-tower masses from everything else
 * standing on the islands, and 40 m is the middle of the gap the measurement
 * itself leaves: the tallest masses are 54.75, 54.62 and 51.59 m and the next
 * one down is 34.65 m. Three towers on three islands, none on Freeman, which is
 * the count catalogue 6.3 derives from the lidar and from OSM independently.
 *
 * ISLE_SCREEN_MIN_FOOT separates a wall from a mast at the same 20 m threshold
 * masses.json itself was cut at: a 20 m2 footprint is a structure with extent,
 * below it is a pole. It is a classification, not a dimension.
 *
 * ISLE_TOWER_TAPER and ISLE_SCREEN_BOW are the two INFERRED numbers in this
 * round and both are flagged as such. The sources describe "one tapered cream
 * tower" and walls that are "smooth, futuristic concrete, some curving inward,
 * some outward" [P1d, Five Star cover photograph]; neither publishes a taper
 * ratio or a radius, so these are the smallest values that read at 200 m. */
const ISLE_RIM_STEP = 6; // m along the ring between rim facets
const ISLE_DECK_LIFT = 0.4; // m the hero deck stands over the L1 terrain cap
const ISLE_TOWER_MIN_TOP = 40; // m; masses.json tops above this are drilling towers
const ISLE_SCREEN_MIN_FOOT = 20; // m2; masses.json footprints above this are walls
const ISLE_TOWER_TAPER = 0.8; // fraction of the measured footprint at the top [INFERRED]
const ISLE_SCREEN_BOW = 0.12; // sagitta as a fraction of wall length [INFERRED]
const ISLE_SCREEN_THICK = 2; // m of wall section; the 1 m position lattice's floor
const ISLE_CROWN_RING = 8; // vertices round a crown
const ISLE_CROWN_NECK_LOW = 1.5; // height/radius at which a crown is widest low down
const ISLE_CROWN_NECK_SPAN = 5; // more height/radius to carry the widest point to the top
/* Samples along one offset ray in insetPoly. 32 puts the search step at 0.5 m
 * for the 15 m offsets an island rim asks for, half the asset's own 1 m position
 * lattice, so the answer is exact at the resolution anything is drawn at. */
const ISLE_OFFSET_PROBES = 32;
/* Queen Mary: 310.7 m LOA and 55.2 m to the funnel tops (Wikipedia); OSM way
 * 438331516 carries the hull outline and `height=10`, which is the hull to the
 * promenade deck. Everything above that is the superstructure.
 *
 * Round 0 (catalogue 7.1) changed what these two are measured FROM, not their
 * values. The bake already assigned the correct near-black to the hull, then
 * drew the band from -3 to +10 in absolute world y while the terrain L1 puts
 * around her berth stands at 6.0 to 12.0 m (probed at bake time over her own
 * hull ring). Most of the black was underground and the ship read as a pale
 * grey box, which inverts the single most recognisable thing about her. They
 * are now offsets from the ground under her berth: 10 m of black hull standing
 * clear on every side, which is what OSM's `height=10` measures, and 3 m of it
 * buried so her foot does not float.
 *
 * QM_DECK1, QM_DECK2 and QM_FUNNEL_TOP stay ABSOLUTE deliberately. Carrying the
 * datum up through them would put her funnel tops at 67 m over a sea her own
 * source says she stands 55.2 m above, which is exactly the kind of dimension
 * inflation contract amendment 3 requires owner approval for. Held where they
 * are, she draws 10 m of hull, 16 m of upperworks and 17 m of funnel over a
 * waterline at 9 m: 46 m of ship above the sea, against the 43.4 m her sourced
 * 55.2 m keel-to-funnel figure implies once her 11.8 m draught is taken off. */
const QM_HULL_TOP = 10;
const QM_HULL_BOTTOM = -3;
const QM_DECK1 = 30;
const QM_DECK2 = 38;
const QM_FUNNEL_TOP = 55.2;
/* Long Beach International Gateway: 157 m towers, 62 m of deck clearance and a
 * 305 m main span (Wikipedia). OSM way 1433959973 gives the alignment. */
const GATEWAY_TOWER_H = 157;
const GATEWAY_DECK_H = 62;
const GATEWAY_SPAN = 305;
const GATEWAY_DECK_W = 30;
/* Spruce Goose dome: 122 m clear span, 35 m high (Structurae). Position comes
 * from the real OSM footprint, way 721199801, the outer way of relation
 * 6573072; the doc's [EST] position it replaces was 300 m off. */
const DOME_R = 61;
const DOME_H = 35;
const DOME_SEGMENTS = 12;
/* Long Beach Light: OSM node 566859523 carries `height=13`, against the doc's
 * 15 m estimate. The sourced figure wins. */
const ROBOT_H = 13;
/* Signal Hill: OSM has 214 `man_made=petroleum_well` nodes over the field. The
 * doc asks for 6 to 8 silhouettes on the 111 m hill. Mast height is the one
 * unsourced number in this layer: 18 m sits under the low end of the 80 ft
 * historic derrick range and reads at 2.7 px from the course. [EST] */
const DERRICK_COUNT = 7;
const DERRICK_H = 18;
const DERRICK_SPACING = 120; // m; the field is denser than the screen can resolve

/* L5, the far horizon curtain (design doc 5). Everything the inventory names
 * beyond the 10.5 km clip disc is profile, never terrain: Palos Verdes at
 * 16.7 km, Catalina at 47 km, the San Gabriels and the Santa Anas at 54 to
 * 77 km. Two bands come out of one ray march, at the zooms doc 4.2 assigns:
 * z11 (63.6 m per sample) over the mid band and z10 (127 m) over the far one.
 *
 * The cut-off is 90 km. San Gorgonio at 129 km and San Jacinto at 137 km are
 * geometrically visible and were dropped in doc 1.4: the one Long Beach
 * visibility source found puts the 54 to 77 km ranges in view after storms and
 * says nothing about 130 km. */
const CURTAIN_STEP_DEG = 0.2; // 3.7 px per sample at the 1056.2 px/rad focal
const CURTAIN_MID_ZOOM = 11;
const CURTAIN_FAR_ZOOM = 10;
const CURTAIN_MID_FROM = 10500; // the clip radius: the curtain starts where L1 stops
const CURTAIN_MID_TO = 35000;
const CURTAIN_FAR_TO = 90000;
const CURTAIN_MID_STEP = 60; // m, at or under the band's own sample pitch
const CURTAIN_FAR_STEP = 120;
/* 0.015 deg is 0.3 px at frame centre. Over the open Pacific this skips most
 * of the compass, which is where the triangle budget comes from. */
const CURTAIN_MIN_ANGLE = 0.015 * (Math.PI / 180);
/* Standard refraction, 7/6 of the Earth's radius (design doc 0.5). Drop at
 * range d is d^2 / (2 R_EFF); the shader recomputes the same term per frame
 * from the vertex's true range, so bake and runtime cannot disagree. */
const R_EFF = 7432833;

/* Container channel bits, in the order a layer block lays them out. */
const ATTR_FADE = 1;
const ATTR_SHADE = 2;
const ATTR_DIST = 4; // i16, 4 m units
/* u8 column code: bit0 marks a base vertex, bit1 marks the far band. The band
 * bit is what the runtime orders the two curtain bands in depth by; deriving it
 * from the range instead cannot work, because the mid march ends and the far
 * march begins at the same 35 km. */
const ATTR_BASE = 8;
const COLUMN_BASE = 1;
const COLUMN_FAR = 2;
/* u8 substance index. 0 means "no named substance here, use the layer's own
 * height ramp", which is what most vertices carry, so the byte only ships on
 * the two layers that hold a substance a height ramp cannot separate: L4, where
 * a rock rim, a planted mass and a screen tower sit inside twenty metres, and
 * L3, where a 6 to 25 m storage tank sits inside the container yard's band.
 * The substances are the ones design doc 9 and the colour research between them
 * actually name; VenueShore.tsx holds the matching reflectances and the same
 * numbering. */
const ATTR_MAT = 16;
const MAT_RAMP = 0;
const MAT_ROCK = 1; // island rock rim, Catalina boulder armour
const MAT_VEG = 2; // island planting, palms and shrub mass
const MAT_PALE = 3; // screen towers, the bridge towers, ship upperworks
const MAT_DARK = 4; // ship hull, derrick and bridge steel
const MAT_ACCENT = 5; // Cunard funnel red
const MAT_TANK = 6; // storage-tank paint, chalky off-white for solar reflectance
/* Round 0 (catalogue 7.4 and 10.2): the Spruce Goose dome is white aluminium
 * panel and the Long Beach Harbor Light is a white concrete box tower. Both
 * were taking MAT_PALE, which round 5 derived from the THUMS screen towers and
 * which the grey-concrete bridge towers also take, so neither could be made
 * white without repainting the other two. */
const MAT_WHITE = 7; // the dome and the harbour light, white
/* Round 1 (catalogue 6.3, 6.4, 6.6). The THUMS screens and towers are cream
 * concrete carrying blue panels; MAT_PALE cannot be either, because round 5
 * derived it as a 42/26/14/12/6 MIX of the tower's own concrete, its blue infill
 * panel and a shaded reveal, and it also paints the bridge towers and the ship's
 * upperworks. Drawing the blue as geometry needs the two apart. The deck the
 * planting stands on is a third: NAIP measures it at rgb(129,127,113), a warm
 * grey that is neither the rim's rock nor the port apron. */
const MAT_SCREEN = 8; // sculpted screen walls and tower bodies, smooth concrete
const MAT_PANEL = 9; // the blue panels up the sides of the towers
const MAT_DECK = 10; // the island deck under the planting
/* Round 2. Two more bytes on every shore layer, both computed by
 * bakeOcclusion() below against the venue's own triangles: what the sun can
 * see of a vertex, and what the sky can. aShade carries a face's own
 * orientation and has no way to carry what stands in front of it, which is
 * why a tower here threw nothing on the ground it stands on. The curtain
 * takes neither: its vertices are directions, not places. */
const ATTR_SUN = 32;
const ATTR_AO = 64;
const ATTR_BYTES = {
  [ATTR_FADE]: 1,
  [ATTR_SHADE]: 1,
  [ATTR_DIST]: 2,
  [ATTR_BASE]: 1,
  [ATTR_MAT]: 1,
  [ATTR_SUN]: 1,
  [ATTR_AO]: 1,
};
const Y_UNIT = 10; // y quantised in 0.1 m

const DEG = Math.PI / 180;
const CACHE = ".tmp/venue-cache";
mkdirSync(CACHE, { recursive: true });
mkdirSync(".tmp", { recursive: true });

const venueId = process.argv[2];
const venue = VENUES[venueId];
if (!venue) {
  console.error(`unknown venue "${venueId}"; known: ${Object.keys(VENUES).join(", ")}`);
  process.exit(1);
}

/* --------------------------------------------------- committed data products */

/* USGS 3DEP lidar and NAIP orthoimagery, reduced once by
 * scripts/layline-derive-scenery.mjs and COMMITTED under scripts/venue-data/,
 * so the bake reads shape and colour off measurement without a network call and
 * without a dependency. Every file carries its own frame block, its method, its
 * parameters, a `valuesSha256` over the numbers it publishes, and a pointer into
 * provenance.json, where every raw tile behind it is listed with its own sha256.
 *
 * These are OPTIONAL for a venue without hero islands: such a venue bakes
 * exactly as it did before, on the constants above, and absence is logged.
 * A venue that DOES declare hero islands requires all three (round 1 removed
 * the constant-based island builders, so a missing product would silently bake
 * bare islands); buildHeroes fails the bake loudly instead. */
const DATA_DIR = join("scripts", "venue-data", venueId);
function loadProduct(name) {
  const path = join(DATA_DIR, `${name}.json`);
  if (!existsSync(path)) return null;
  const json = JSON.parse(readFileSync(path, "utf8"));
  console.log(
    `data product ${name}: schema ${json.schema}, values sha256 ${String(json.valuesSha256).slice(0, 16)}`,
  );
  return json;
}
const PRODUCTS = {
  trees: loadProduct("trees"),
  shoreline: loadProduct("shoreline"),
  masses: loadProduct("masses"),
};
for (const [name, json] of Object.entries(PRODUCTS)) {
  if (!json) console.log(`data product ${name}: ABSENT, falling back to constants`);
}

/* ------------------------------------------------------------------ frames */

/* A product SAYS it is in this baker's course frame. That is a claim in a JSON
 * file, and a silently rotated product would place 1,079 tree crowns in the
 * water without any error at all, so the claim is checked rather than trusted.
 * Origin and bearing must match exactly; the metres-per-degree pair is allowed
 * a part in 10^4, which is 0.03 m over the 300 m half-width of an island. */
function checkProductFrame(name, json) {
  if (!json?.frame) return;
  const f = json.frame;
  const bad = [];
  if (f.origin.lat !== venue.origin.lat || f.origin.lon !== venue.origin.lon) {
    bad.push(`origin ${f.origin.lat},${f.origin.lon} vs ${venue.origin.lat},${venue.origin.lon}`);
  }
  if (f.bearingDeg !== venue.bearing) bad.push(`bearing ${f.bearingDeg} vs ${venue.bearing}`);
  if (Math.abs(f.mPerLat / mPerLat - 1) > 1e-4) bad.push(`mPerLat ${f.mPerLat} vs ${mPerLat}`);
  if (Math.abs(f.mPerLon / mPerLon - 1) > 1e-4) bad.push(`mPerLon ${f.mPerLon} vs ${mPerLon}`);
  if (bad.length) {
    console.error(`data product ${name}: frame does not match the bake frame: ${bad.join("; ")}`);
    process.exit(1);
  }
}

const lat0 = venue.origin.lat;
const lon0 = venue.origin.lon;
const mPerLat = 110574;
const mPerLon = 111320 * Math.cos(lat0 * DEG);
const bearingRad = venue.bearing * DEG;
const cosB = Math.cos(bearingRad);
const sinB = Math.sin(bearingRad);
for (const [name, json] of Object.entries(PRODUCTS)) checkProductFrame(name, json);

/** lat/lon -> course-frame metres { x: across, y: up the course axis }. */
function project(lat, lon) {
  const e = (lon - lon0) * mPerLon;
  const n = (lat - lat0) * mPerLat;
  return { x: e * cosB - n * sinB, y: e * sinB + n * cosB };
}

/** course-frame -> lat/lon, for DEM sampling of derived points. */
function unproject(x, y) {
  const e = x * cosB + y * sinB;
  const n = -x * sinB + y * cosB;
  return { lat: lat0 + n / mPerLat, lon: lon0 + e / mPerLon };
}

/* ------------------------------------------------------------------- fetch */

async function cachedFetch(url, cacheName, binary) {
  const path = join(CACHE, cacheName);
  if (existsSync(path)) {
    return binary ? readFileSync(path) : readFileSync(path, "utf8");
  }
  const res = await fetch(url, { headers: { "User-Agent": "layline-venue-bake/1" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const body = binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
  writeFileSync(path, body);
  return body;
}

const OVERPASS = "https://overpass-api.de/api/interpreter";

const bboxOf = (margin) =>
  `${lat0 - margin / mPerLat},${lon0 - margin / mPerLon},${lat0 + margin / mPerLat},${
    lon0 + margin / mPerLon
  }`;

/** Q2 and Q3 are longer than a URL wants, so they go over POST. Same endpoint,
 * same query text, same cache convention as Q1. */
async function cachedPost(query, cacheName) {
  const path = join(CACHE, cacheName);
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: {
      "User-Agent": "layline-venue-bake/1",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${cacheName}`);
  const text = await res.text();
  writeFileSync(path, text);
  return JSON.parse(text);
}

/* Q1, the coast: unchanged since round 2 and pinned by the design doc 6.2. */
async function fetchOverpass() {
  const bbox = bboxOf(CLIP_R + 1500);
  const query = `[out:json][timeout:180];(
    way["natural"="coastline"](${bbox});
    way["man_made"="breakwater"](${bbox});
    node["man_made"="crane"](${bbox});
    way["man_made"="crane"](${bbox});
  );out geom;`;
  const text = await cachedFetch(
    OVERPASS + "?data=" + encodeURIComponent(query),
    `overpass-${venueId}.json`,
    false,
  );
  return JSON.parse(text);
}

/* Q2, urban massing: every building the LA County LiDAR import puts over 25 m
 * inside the bake box. 90.8 per cent of buildings here carry `height`. */
const fetchMassing = () =>
  cachedPost(
    `[out:json][timeout:180];
way["building"]["height"](if:number(t["height"])>=${MASS_MIN_H})(${bboxOf(CLIP_R + 1500)});
out geom;`,
    `overpass-q2-${venueId}.json`,
  );

/* Q3, port infrastructure: tank farms, silos, pier decks, and the terminal
 * polygons the container blocks are allowed to stand inside. */
const fetchInfrastructure = () =>
  cachedPost(
    `[out:json][timeout:180];(
  way["man_made"="storage_tank"](${bboxOf(CLIP_R + 1500)});
  way["man_made"="silo"](${bboxOf(CLIP_R + 1500)});
  way["man_made"="pier"](${bboxOf(CLIP_R + 1500)});
  way["landuse"="industrial"](${bboxOf(CLIP_R + 1500)});
);out geom;`,
    `overpass-q3-${venueId}.json`,
  );

/* Q5, hero anchors: the named OSM elements design doc 9 curates a landmark on
 * top of, plus the Signal Hill oil field. Pinned by id rather than searched by
 * tag, so a rename or a retag upstream cannot silently move a hero; the well
 * nodes are the one part that has to come by area, because the doc asks for a
 * cluster and no single well is the landmark. */
const fetchHeroAnchors = () => {
  const h = venue.heroes;
  const box = h.derrickBox;
  return cachedPost(
    `[out:json][timeout:180];(
  way(id:${h.queenMary},${h.gateway},${h.lionsLighthouse},${h.dome});
  node(id:${h.longBeachLight});
  node["man_made"="petroleum_well"](${box.south},${box.west},${box.north},${box.east});
);out geom;`,
    `overpass-q5-${venueId}.json`,
  );
};

/* ------------------------------------------------- terrarium PNG elevation */

/** Minimal PNG decode: 8-bit RGB/RGBA, non-interlaced, which is what the
 * Terrarium tiles are. Returns { width, height, channels, data }. */
function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      const interlace = data.readUInt8(12);
      if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`unsupported PNG: depth ${bitDepth} color ${colorType} interlace ${interlace}`);
      }
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.allocUnsafe(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    const line = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let value = row[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`PNG filter ${filter}`);
      line[i] = value & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

const demTiles = new Map();

async function demTile(tx, ty, zoom = DEM_ZOOM) {
  const key = `${zoom}/${tx}/${ty}`;
  let tile = demTiles.get(key);
  if (!tile) {
    const buffer = await cachedFetch(
      `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${tx}/${ty}.png`,
      `terrarium-${zoom}-${tx}-${ty}.png`,
      true,
    );
    tile = decodePng(buffer);
    demTiles.set(key, tile);
  }
  return tile;
}

/** Fractional tile-pixel coordinates of a lat/lon at one zoom, in the same
 * bilinear convention `demAt` samples with (pixel centres at half steps). */
function demPixel(lat, lon, zoom) {
  const scale = 2 ** zoom;
  const latRad = lat * DEG;
  return {
    px: ((lon + 180) / 360) * scale * 256 - 0.5,
    py: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale * 256 - 0.5,
  };
}

/** Elevation in metres at lat/lon, bilinear across the tile mosaic.
 * Terrarium encodes bathymetry too, so open water reads negative.
 *
 * The zoom is a parameter because the curtain marches the same decoder over the
 * coarser z11/z10 mosaics (design doc 4.2); every call inside the 10.5 km disc
 * still lands on DEM_ZOOM, so L1's heights are bit-for-bit what round 2 baked. */
function demAt(lat, lon, zoom = DEM_ZOOM) {
  const { px, py } = demPixel(lat, lon, zoom);
  const sample = (ix, iy) => {
    const tx = Math.floor(ix / 256);
    const ty = Math.floor(iy / 256);
    const tile = demTiles.get(`${zoom}/${tx}/${ty}`);
    if (!tile) return 0;
    const cx = ix - tx * 256;
    const cy = iy - ty * 256;
    const at = (cy * tile.width + cx) * tile.channels;
    return tile.data[at] * 256 + tile.data[at + 1] + tile.data[at + 2] / 256 - 32768;
  };
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const u = px - x0;
  const v = py - y0;
  return (
    sample(x0, y0) * (1 - u) * (1 - v) +
    sample(x0 + 1, y0) * u * (1 - v) +
    sample(x0, y0 + 1) * (1 - u) * v +
    sample(x0 + 1, y0 + 1) * u * v
  );
}

async function prefetchDem() {
  const scale = 2 ** DEM_ZOOM;
  const margin = CLIP_R + 1000;
  const corners = [
    [lat0 + margin / mPerLat, lon0 - margin / mPerLon],
    [lat0 - margin / mPerLat, lon0 + margin / mPerLon],
  ];
  const tiles = corners.map(([lat, lon]) => {
    const latRad = lat * DEG;
    return [
      Math.floor(((lon + 180) / 360) * scale),
      Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale),
    ];
  });
  const [x0, y0] = tiles[0];
  const [x1, y1] = tiles[1];
  const jobs = [];
  for (let tx = Math.min(x0, x1); tx <= Math.max(x0, x1); tx++) {
    for (let ty = Math.min(y0, y1); ty <= Math.max(y0, y1); ty++) {
      jobs.push(demTile(tx, ty));
    }
  }
  await Promise.all(jobs);
  console.log(`DEM: ${jobs.length} terrarium tiles at z${DEM_ZOOM}`);
}

/* Places where the DEM is known to be wrong and a published ground height
 * exists, filled in from the venue's hero anchors before any geometry is built.
 *
 * z11 Terrarium is 64 m per sample and the archived probe
 * (.tmp/venue-cache/provenance/dem-readings.json) measures what it does to the
 * THUMS islands: Island Grissom reads -27 to +153 m with a mean of 23.1 over a
 * 300 m box, Island White -114 to +20. They are 10-acre artificial islands
 * whose own OSM rings carry `ele` 0 and 3. Left alone, L1 draws Grissom as a
 * 23 m mound, and round 5's hero towers then stand on top of that and reach
 * 77 m against a 53 m published tower. This is the clamp design doc 4.1
 * predicted would be needed and never wrote. */
const heightClamps = [];
function clampedGroundRing(ring) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { ring, minX, maxX, minY, maxY };
}
function insideRing(box, x, y) {
  if (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY) return false;
  const ring = box.ring;
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/* Even-odd containment is undefined for a point that lies exactly on the ring,
 * and the island coastlines ARE clamp rings, so their own shore vertices land
 * there: of Grissom's 13, five test outside and eight inside. `RING_ON_TOL` is
 * float slack, not a design distance; the ring the coast builder walks and the
 * ring the clamp was built from come from the same project() calls, so an
 * on-ring vertex sits at distance 0 and everything else is metres away. */
const RING_ON_TOL = 1e-3;
function onOrInsideRing(box, x, y) {
  if (insideRing(box, x, y)) return true;
  if (
    x < box.minX - RING_ON_TOL ||
    x > box.maxX + RING_ON_TOL ||
    y < box.minY - RING_ON_TOL ||
    y > box.maxY + RING_ON_TOL
  ) {
    return false;
  }
  const ring = box.ring;
  const p = { x, y };
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (pointSegDist(p, ring[j], ring[i]) <= RING_ON_TOL) return true;
  }
  return false;
}

/** The lowest cap covering a point, or Infinity where no clamp claims it. */
function clampCapAt(x, y) {
  let cap = Infinity;
  for (const clamp of heightClamps) {
    if (onOrInsideRing(clamp.box, x, y)) cap = Math.min(cap, clamp.max);
  }
  return cap;
}

/** Ground height in course-frame metres. */
function groundAt(x, y) {
  const { lat, lon } = unproject(x, y);
  const h = demAt(lat, lon);
  for (const clamp of heightClamps) {
    if (insideRing(clamp.box, x, y)) return Math.min(h, clamp.max);
  }
  return h;
}

/* -------------------------------------------------- coastline ring assembly */

const keyOf = (p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;

/** Join ways that share endpoints into maximal chains. */
function assembleChains(ways) {
  const chains = ways.map((way) => way.geometry.map((g) => project(g.lat, g.lon)));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < chains.length; i++) {
      for (let j = 0; j < chains.length; j++) {
        if (i === j) continue;
        const a = chains[i];
        const b = chains[j];
        if (keyOf(a[a.length - 1]) === keyOf(b[0])) {
          chains[i] = a.concat(b.slice(1));
          chains.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return chains;
}

const inside = (p) => p.x * p.x + p.y * p.y <= CLIP_R * CLIP_R;

/** Intersection of segment a->b with the clip circle, the one crossing t in (0,1]. */
function circleHit(a, b, wantExit) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const A = dx * dx + dy * dy;
  const B = 2 * (a.x * dx + a.y * dy);
  const C = a.x * a.x + a.y * a.y - CLIP_R * CLIP_R;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const t1 = (-B - root) / (2 * A);
  const t2 = (-B + root) / (2 * A);
  const t = wantExit ? t2 : t1;
  if (t < 0 || t > 1) {
    const other = wantExit ? t1 : t2;
    if (other < 0 || other > 1) return null;
    return { x: a.x + dx * other, y: a.y + dy * other };
  }
  return { x: a.x + dx * t, y: a.y + dy * t };
}

/** Clip one chain to the disc. Returns { closed, open } pieces. A chain whose
 * ends meet is a ring; clipping can split any chain into several pieces. */
function clipChain(points) {
  const isRing = keyOf(points[0]) === keyOf(points[points.length - 1]);
  if (isRing && points.every(inside)) {
    return { closed: [points.slice(0, -1)], open: [] };
  }
  if (isRing && !points.some(inside)) {
    return { closed: [], open: [] };
  }
  const open = [];
  let piece = null;
  const finish = () => {
    if (piece && piece.length >= 2) open.push(piece);
    piece = null;
  };
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const aIn = inside(a);
    const bIn = inside(b);
    if (aIn && bIn) {
      if (!piece) piece = [a];
      piece.push(b);
    } else if (aIn && !bIn) {
      if (!piece) piece = [a];
      const hit = circleHit(a, b, true);
      if (hit) piece.push(hit);
      finish();
    } else if (!aIn && bIn) {
      const hit = circleHit(a, b, false);
      piece = hit ? [hit, b] : [b];
    } else {
      /* both outside; the segment can still cross the disc */
      const hitIn = circleHit(a, b, false);
      const hitOut = circleHit(a, b, true);
      if (hitIn && hitOut && (hitIn.x !== hitOut.x || hitIn.y !== hitOut.y)) {
        open.push([hitIn, hitOut]);
      }
    }
  }
  finish();
  if (isRing && open.length === 0 && inside(points[0])) {
    return { closed: [points.slice(0, -1)], open: [] };
  }
  /* A clipped ring's first and last pieces are one boundary run when the ring
   * starts inside: stitch them. */
  if (isRing && open.length >= 2 && inside(points[0])) {
    const first = open[0];
    const last = open.pop();
    if (keyOf(last[last.length - 1]) === keyOf(first[0])) {
      open[0] = last.concat(first.slice(1));
    } else {
      open.push(last);
    }
  }
  return { closed: [], open };
}

/** Close clipped open chains against the circle. Coastline is drawn with land
 * on the left, and disc-interior is on the left walking the circle CCW, so
 * from each chain exit the boundary continues CCW to the nearest chain entry. */
function closeAgainstCircle(openChains) {
  const rings = [];
  /* The stitch below assumes every endpoint sits on the circle. A dangling
   * end inside the disc is a break in the source data; extend it radially and
   * say so, which costs a chord out to the rim instead of a chord across the
   * whole disc. */
  const snapped = openChains.map((chain) => {
    const out = chain.slice();
    for (const end of [0, out.length - 1]) {
      const p = out[end];
      const r = Math.hypot(p.x, p.y);
      if (r < CLIP_R - 1) {
        console.warn(
          `  warning: dangling chain end at r=${Math.round(r)} (${Math.round(p.x)},${Math.round(p.y)}), extending to rim`,
        );
        const rim = { x: (p.x / r) * CLIP_R, y: (p.y / r) * CLIP_R };
        if (end === 0) out.unshift(rim);
        else out.push(rim);
      }
    }
    return out;
  });
  const unused = snapped.slice();
  const angleOf = (p) => Math.atan2(p.y, p.x);
  while (unused.length > 0) {
    let ring = unused.shift().slice();
    let guard = 0;
    for (;;) {
      if (guard++ > 500) throw new Error("ring closing did not converge");
      const exit = ring[ring.length - 1];
      const exitAngle = angleOf(exit);
      /* nearest entry CCW from the exit, the start of some unused chain or of
       * this ring itself */
      let best = -1;
      let bestDelta = Infinity;
      const candidates = unused.map((chain) => angleOf(chain[0]));
      candidates.push(angleOf(ring[0]));
      for (let i = 0; i < candidates.length; i++) {
        let delta = candidates[i] - exitAngle;
        while (delta <= 1e-9) delta += 2 * Math.PI;
        if (delta < bestDelta) {
          bestDelta = delta;
          best = i;
        }
      }
      /* walk the arc */
      for (let a = ARC_STEP; a < bestDelta; a += ARC_STEP) {
        ring.push({
          x: Math.cos(exitAngle + a) * CLIP_R,
          y: Math.sin(exitAngle + a) * CLIP_R,
        });
      }
      if (best === candidates.length - 1) {
        rings.push(ring);
        break;
      }
      const next = unused.splice(best, 1)[0];
      ring = ring.concat(next);
    }
  }
  return rings;
}

function signedArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/** Douglas-Peucker with distance-scaled tolerance. */
function simplify(ring) {
  const tolAt = (p) => {
    const d = Math.hypot(p.x, p.y);
    const t = Math.min(Math.max((d - 3000) / 3000, 0), 1);
    return SIMPLIFY_NEAR + (SIMPLIFY_FAR - SIMPLIFY_NEAR) * t;
  };
  const keep = new Array(ring.length).fill(false);
  keep[0] = true;
  keep[ring.length - 1] = true;
  const stack = [[0, ring.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop();
    if (to - from < 2) continue;
    const a = ring[from];
    const b = ring[to];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let worst = -1;
    let worstDist = 0;
    for (let i = from + 1; i < to; i++) {
      const p = ring[i];
      const dist = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
      if (dist > worstDist) {
        worstDist = dist;
        worst = i;
      }
    }
    if (worst >= 0 && worstDist > tolAt(ring[worst])) {
      keep[worst] = true;
      stack.push([from, worst], [worst, to]);
    }
  }
  const out = ring.filter((_, i) => keep[i]);
  /* ring: drop the duplicate closing point if present */
  if (out.length > 1 && keyOf(out[0]) === keyOf(out[out.length - 1])) out.pop();
  return out;
}

function perimeter(ring) {
  let p = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    p += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return p;
}

/** Distance from p to segment a->b. */
function pointSegDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0), 1) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** True when segments a->b and c->d cross at a point interior to both. Touching
 * endpoints and collinear overlap read as no crossing, which is what shared ring
 * vertices are. */
function segmentsCross(a, b, c, d) {
  const side = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const s1 = side(a, b, c);
  const s2 = side(a, b, d);
  const s3 = side(c, d, a);
  const s4 = side(c, d, b);
  return s1 !== 0 && s2 !== 0 && s3 !== 0 && s4 !== 0 && s1 !== s2 && s3 !== s4;
}

/** Indices of every vertex bounding a self-crossing edge of a closed ring.
 * O(n^2) with a bounding-box reject; bake-time only, on rings of a few hundred
 * points. */
function selfCrossingVerts(ring) {
  const n = ring.length;
  const hit = new Set();
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const loX = Math.min(a.x, b.x);
    const hiX = Math.max(a.x, b.x);
    const loY = Math.min(a.y, b.y);
    const hiY = Math.max(a.y, b.y);
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // the two edges meeting at ring[0]
      const c = ring[j];
      const d = ring[(j + 1) % n];
      if (Math.min(c.x, d.x) > hiX || Math.max(c.x, d.x) < loX) continue;
      if (Math.min(c.y, d.y) > hiY || Math.max(c.y, d.y) < loY) continue;
      if (!segmentsCross(a, b, c, d)) continue;
      hit.add(i).add((i + 1) % n).add(j).add((j + 1) % n);
    }
  }
  return hit;
}

/** The narrowest feature worth keeping at this range, on the same distance
 * schedule the simplify tolerance already uses: what is a readable spit at
 * 700 m is a torn hairline at 5 km. */
function featureWidth(x, y) {
  const t = Math.min(Math.max((Math.hypot(x, y) - 700) / 4300, 0), 1);
  return MIN_FEATURE_W * (0.55 + 0.95 * t);
}

/** Cut a ring at every pinch narrower than the local feature width. Both halves
 * keep the pinch pair, so a split where both halves survive is invisible; the
 * point is that a finger hanging off a body by a hair becomes its own ring and
 * can then be measured and dropped on its own merits. */
function splitPinches(ring, depth = 0) {
  const n = ring.length;
  if (n < 5 || depth > 16) return [ring];
  let best = null;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (n - (j - i) < 3) continue;
      const a = ring[i];
      const b = ring[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const limit = featureWidth((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (d < limit && (best === null || d / limit < best.score)) {
        best = { i, j, score: d / limit };
      }
    }
  }
  if (best === null) return [ring];
  const head = ring.slice(best.i, best.j + 1);
  const tail = ring.slice(best.j).concat(ring.slice(0, best.i + 1));
  return splitPinches(head, depth + 1).concat(splitPinches(tail, depth + 1));
}

/**
 * Undo a pinch split whose two halves both survived.
 *
 * splitPinches leaves the chord in both halves, and buildLand reads every ring
 * edge as coastline: a surviving pair therefore ran opposing sea-level batter
 * faces, skirts and the shader's surf band straight through the interior of a
 * land neck. The split only exists so a doomed finger can be measured and
 * dropped on its own, so once both halves are through the filter the pair is
 * put back: the two rings carry the chord in opposite directions, so walking A
 * from the chord's far end all the way round to its near end and then walking B
 * the same way, skipping the two shared vertices the second time, gives the
 * union's boundary and dissolves the chord. Repeats to a fixpoint, for a ring
 * that split into three or more surviving pieces.
 */
function mergeSplitChords(rings) {
  const out = rings.map((ring) => ring.slice());
  const key = (a, b) => `${a.x.toFixed(3)},${a.y.toFixed(3)}|${b.x.toFixed(3)},${b.y.toFixed(3)}`;
  let merges = 0;
  for (;;) {
    const seen = new Map();
    let pair = null;
    search: for (let ri = 0; ri < out.length; ri++) {
      const ring = out[ri];
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const rev = seen.get(key(b, a));
        if (rev && rev.ri !== ri) {
          pair = { a: rev, b: { ri, i } };
          break search;
        }
        seen.set(key(a, b), { ri, i });
      }
    }
    if (!pair) break;
    const A = out[pair.a.ri];
    const B = out[pair.b.ri];
    const merged = [];
    for (let k = 0; k < A.length; k++) merged.push(A[(pair.a.i + 1 + k) % A.length]);
    for (let k = 0; k < B.length - 2; k++) merged.push(B[(pair.b.i + 2 + k) % B.length]);
    out[pair.a.ri] = merged;
    out.splice(pair.b.ri, 1);
    merges += 1;
  }
  /* The bound on the assumption above: one shared chord per pair.
   *
   * The search only pairs edges in DIFFERENT rings, so a second chord shared by
   * the same two rings survives the merge as a reversed duplicate edge INSIDE
   * the merged ring, where nothing looks for it again. buildLand reads every
   * ring edge as coastline, so that leftover would run a batter face, a skirt
   * and the shader's surf band straight through the middle of a land neck: the
   * round-2b defect, one merge later. It cannot happen on this venue's data and
   * it is not detectable downstream, so it is asserted here rather than trusted.
   * (Round-2b latent, closed in round 6.) */
  for (let ri = 0; ri < out.length; ri++) {
    const ring = out[ri];
    const seen = new Set();
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      seen.add(key(a, b));
    }
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (seen.has(key(b, a))) {
        throw new Error(
          `ring ${ri} carries its own edge in both directions at (${a.x.toFixed(1)}, ${a.y.toFixed(
            1,
          )}): mergeSplitChords left a chord behind, so a land neck would be drawn as coast`,
        );
      }
    }
  }
  return { rings: out, merges };
}

/** A ring worth drawing: real area, and a mean width (2A/P) that still spans
 * pixels at its own range.
 *
 * The width test is angular rather than metric on purpose. A metric floor
 * cannot tell a 20 m wide, 1.9 km long training wall at 4.4 km, which is a
 * structure and reads as one, from a 14 m wide flake at 7.1 km, which is three
 * pixels; measured earlier, a metric filter threw away the first and with it
 * the only land on the up-course bearing. */
function substantial(ring) {
  if (ring.length < 3) return false;
  /* Splitting at a pinch also cuts the mouth off an inlet narrower than the
   * feature width. That lobe comes back wound clockwise, because it is water,
   * and the land ring keeps the chord across the mouth. */
  const area = signedArea(ring);
  if (area < MIN_RING_AREA) return false;
  let cx = 0;
  let cy = 0;
  for (const p of ring) {
    cx += p.x / ring.length;
    cy += p.y / ring.length;
  }
  const width = (2 * area) / (perimeter(ring) || 1);
  return width >= Math.max(MIN_RING_W, MIN_RING_ANGLE * Math.hypot(cx, cy));
}

/** Even-odd point in polygon over a set of rings, each carrying a bounding box
 * so the relief lattice's hundred thousand corner tests skip most rings. */
function ringBoxes(rings) {
  return rings.map((ring) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { ring, minX, maxX, minY, maxY };
  });
}

function insideLand(boxes, x, y) {
  let hit = false;
  for (const box of boxes) {
    if (y < box.minY || y > box.maxY || x > box.maxX) continue;
    const ring = box.ring;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
        hit = !hit;
      }
    }
  }
  return hit;
}

/* ------------------------------------------------------------ triangulation */

/** Ear clipping, O(n^2), bake-time only. Ring must be CCW, no holes. Returns
 * index triples into the ring. */
function earcut(ring) {
  const n = ring.length;
  if (n < 3) return [];
  const next = new Array(n);
  const prev = new Array(n);
  for (let i = 0; i < n; i++) {
    next[i] = (i + 1) % n;
    prev[i] = (i + n - 1) % n;
  }
  const cross = (o, a, b) =>
    (ring[a].x - ring[o].x) * (ring[b].y - ring[o].y) -
    (ring[a].y - ring[o].y) * (ring[b].x - ring[o].x);
  const inTriangle = (a, b, c, p) => {
    const s1 = cross(a, b, p);
    const s2 = cross(b, c, p);
    const s3 = cross(c, a, p);
    return s1 >= -1e-9 && s2 >= -1e-9 && s3 >= -1e-9;
  };
  const triangles = [];
  let remaining = n;
  let ear = 0;
  let missCount = 0;
  while (remaining > 3) {
    const a = prev[ear];
    const b = ear;
    const c = next[ear];
    let isEar = cross(a, b, c) > 1e-9;
    if (isEar) {
      for (let p = next[c]; p !== a; p = next[p]) {
        if (inTriangle(a, b, c, p)) {
          isEar = false;
          break;
        }
      }
    }
    if (isEar) {
      triangles.push(a, b, c);
      next[a] = c;
      prev[c] = a;
      remaining -= 1;
      ear = a;
      missCount = 0;
    } else {
      ear = next[ear];
      missCount += 1;
      if (missCount > remaining) {
        /* degenerate remainder (collinear slivers); clip whatever is left */
        triangles.push(a, b, c);
        next[a] = c;
        prev[c] = a;
        remaining -= 1;
        ear = a;
        missCount = 0;
      }
    }
  }
  triangles.push(prev[ear], ear, next[ear]);
  return triangles;
}

/* ------------------------------------------------------------- mesh builder */

/* One buffer set per semantic layer (design doc 2.1). Builders write into
 * `current`; `into` switches it for the length of one builder. Vertex dedup is
 * per layer, so a layer is always a self-contained mesh. */
function newLayer(classId, name, drawOrder, material = 0) {
  return {
    classId,
    name,
    drawOrder,
    material, // 0 shore, 1 curtain
    /* Which channels this layer's block carries, in the container's fixed
     * order. The shore layers pay for fade and shade; the curtain pays for a
     * true range and a base flag instead and would waste a byte per vertex on
     * either of the other two. Port and heroes pay one byte more for the
     * substance index, because a height ramp cannot tell a rock rim from the
     * planting standing on it (round-4d residual 6.1), nor a storage tank from
     * the container stack beside it at the same 12 m. */
    attrMask:
      material === 1
        ? ATTR_DIST | ATTR_BASE
        : ATTR_FADE |
          ATTR_SHADE |
          ATTR_SUN |
          ATTR_AO |
          (classId === 3 || classId === 4 ? ATTR_MAT : 0),
    positions: [],
    fades: [],
    shades: [],
    dists: [],
    bases: [],
    mats: [],
    /* filled in one pass at the end of the bake, once every builder has run:
     * a tower cannot be asked what it shades while half the venue is missing */
    suns: [],
    aos: [],
    indices: [],
    vertexIndex: new Map(),
    /* Morton order pays on a mesh of scattered small solids and costs nothing
     * on one that is already a monotone sweep (design doc 2.2). */
    morton: !process.env.BAKE_NO_MORTON && (classId === 2 || classId === 3 || classId === 4),
  };
}

/* The curtain draws first: it is 11.8 km out and everything else in the venue
 * is inside 10.5 km, so drawOrder 0 puts it behind the lot. */
const LAYERS = [
  newLayer(5, "curtain", 0, 1),
  newLayer(1, "terrain", 10),
  newLayer(2, "massing", 20),
  newLayer(3, "port", 21),
  newLayer(4, "heroes", 22),
];
const [L_CURTAIN, L_TERRAIN, L_MASSING, L_PORT, L_HEROES] = LAYERS;
let current = L_TERRAIN;

function into(layer, build) {
  const previous = current;
  current = layer;
  try {
    return build();
  } finally {
    current = previous;
  }
}

/* The substance every vertex emitted inside `build` is made of. Stamped on the
 * vertex rather than passed down through `face` and `member`, because those two
 * are shared with L2 and L3 and neither has any use for the channel. */
let currentMat = MAT_RAMP;
function withMat(mat, build) {
  const previous = currentMat;
  currentMat = mat;
  try {
    return build();
  } finally {
    currentMat = previous;
  }
}

/* The scene's one sun (sky.ts: elevation 22, azimuth 305 in the course frame),
 * expressed in bake space (x, up, courseY). Form is baked as a per-vertex
 * lambert against it: unlit flat colour reads as cardboard from any camera
 * above the horizon, and the freeform rig goes there. */
const SUN_EL = 22 * DEG;
const SUN_AZ = 305 * DEG;
const SUN = {
  x: Math.cos(SUN_EL) * Math.sin(SUN_AZ),
  h: Math.sin(SUN_EL),
  y: Math.cos(SUN_EL) * Math.cos(SUN_AZ),
};

/** Shade byte for a surface normal: 128 = the flat colour, below is shadow
 * side, above is sun side. The runtime multiplies the shore colour by
 * shade/128. */
function shadeOf(nx, nh, ny) {
  const len = Math.hypot(nx, nh, ny) || 1;
  const lambert = Math.max((nx * SUN.x + nh * SUN.h + ny * SUN.y) / len, 0);
  return Math.max(0, Math.min(255, Math.round((0.62 + 0.55 * lambert) * 128)));
}

const SHADE_FLAT = shadeOf(0, 1, 0);

function fadeAt(x, y) {
  const d = Math.hypot(x, y);
  const t = Math.min(Math.max((d - FADE_START) / (FADE_END - FADE_START), 0), 1);
  const s = 1 - t * t * (3 - 2 * t);
  return s;
}

function vertex(x, h, y, shade = SHADE_FLAT) {
  /* quantise here so dedup sees the shipped coordinates */
  const qx = Math.round(x);
  const qh = Math.round(h * 10);
  const qz = Math.round(-y);
  /* the substance joins the dedup key: two hero faces that meet along an edge
   * but are made of different things do not share a vertex, the same rule
   * faceting already applies to the shade byte */
  const key = `${qx},${qh},${qz},${shade},${currentMat}`;
  let index = current.vertexIndex.get(key);
  if (index === undefined) {
    index = current.positions.length / 3;
    current.positions.push(qx, qh, qz);
    current.fades.push(Math.round(fadeAt(x, y) * 255));
    current.shades.push(shade);
    current.mats.push(currentMat);
    current.vertexIndex.set(key, index);
  }
  return index;
}

/** A curtain vertex. Its three position slots already hold quantised integers
 * (a direction times 1000 and a summit height in 0.1 m), so unlike `vertex`
 * there is nothing left to round; the dedup key is the whole tuple, which is
 * what lets two bands share a column direction without sharing a vertex. */
function curtainVertex(dirX, height, dirZ, dist, base) {
  const key = `${dirX},${height},${dirZ},${dist},${base}`;
  let index = current.vertexIndex.get(key);
  if (index === undefined) {
    index = current.positions.length / 3;
    current.positions.push(dirX, height, dirZ);
    current.dists.push(dist);
    current.bases.push(base);
    current.vertexIndex.set(key, index);
  }
  return index;
}

function triangle(a, b, c) {
  if (a === b || b === c || a === c) return;
  /* positions are already quantised integers here, so this is an exact test:
   * three collinear corners cover no pixels and only cost bytes. Ear clipping
   * on a simplified footprint produces a few of them. */
  const p = current.positions;
  const ux = p[b * 3] - p[a * 3];
  const uh = p[b * 3 + 1] - p[a * 3 + 1];
  const uz = p[b * 3 + 2] - p[a * 3 + 2];
  const vx = p[c * 3] - p[a * 3];
  const vh = p[c * 3 + 1] - p[a * 3 + 1];
  const vz = p[c * 3 + 2] - p[a * 3 + 2];
  const nx = uh * vz - uz * vh;
  const nh = uz * vx - ux * vz;
  const nz = ux * vh - uh * vx;
  if (nx === 0 && nh === 0 && nz === 0) return;
  current.indices.push(a, b, c);
}

/** Shore height at a ring vertex: the higher of the ground right there and a
 * short distance inland, so a bluff behind a beach still shapes the coast
 * wall. Clamped well below the hills: the wall is the waterline face, the
 * relief surface behind it owns the skyline. Inland is the left side of the
 * boundary direction.
 *
 * The height clamp is owned by the VERTEX, not by the samples. An edge normal
 * leaves the polygon at a sharp corner, and on a 180 m island a 100 m step off
 * the corner clears the ring entirely, so the samples come back holding the
 * unclamped z11 spike the clamp exists to kill: round 5 left Grissom's western
 * corner reading 88.3 m (drawn 25.0 m after the crest cap) beside eight
 * neighbours the clamp had already flattened to 6.0 m. Capping the result by
 * the vertex's own region fixes that without moving any ground outside a ring:
 * every other coast vertex is metres clear of every clamp ring, so its cap is
 * Infinity.
 *
 * The samples come from the filtered relief lattice, not from a raw `groundAt`.
 * That is one rule with two consequences, and both of them are the harbour
 * entrance. A z11 Terrarium sample is 64 m across and this basin's carries the
 * structures standing in it: the texels beside the Queens Gate training wall
 * read 30, 34, 74, 82, 88 and 97 m against open water at -0.4. The lattice
 * already refuses those, because it clamps every corner to its neighbours'
 * median plus SPIKE_TOL and then smooths twice; the crest ring did not, so it
 * drew a 25 m cap (the buildLand ceiling, off a 75 m read) 21 m from the Long
 * Beach Light, whose 19 m top then sat 6 m under the terrain beside it. And a
 * lattice corner only exists on land, so a feature the 60 m lattice cannot
 * resolve at all, and that training wall is 19.7 m wide over 1.8 km, has no
 * corner to read and takes MIN_SHORE_H, which is what a rubble mound crest is.
 * A DEM that cannot see a feature cannot be asked how tall it is. */
function shoreHeight(ring, i) {
  const a = ring[i];
  const b = ring[(i + 1) % ring.length];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  let h = null;
  for (const off of [0, 40, 100]) {
    const s = reliefHeightAt(a.x + nx * off, a.y + ny * off);
    if (s !== null && (h === null || s > h)) h = s;
  }
  if (h === null) h = MIN_SHORE_H;
  return Math.min(Math.max(Math.min(h, clampCapAt(a.x, a.y)), MIN_SHORE_H), 90);
}

/**
 * Pull a ring inward along its own angle bisectors, by `want` metres or by as
 * much as the local feature width allows, whichever is less. The offset ring is
 * where the land surface starts; the original ring stays put as the waterline,
 * so the batter between them is a slope carved out of the land rather than any
 * new ground pushed into the sea.
 */
function insetRing(ring, wants) {
  const n = ring.length;
  const out = [];
  const runs = [];
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const a = ring[(i - 1 + n) % n];
    const b = ring[(i + 1) % n];
    const l0 = Math.hypot(p.x - a.x, p.y - a.y) || 1;
    const l1 = Math.hypot(b.x - p.x, b.y - p.y) || 1;
    /* land is on the left of the boundary direction, so inward is the left
     * normal; the bisector is the two incident edge normals summed */
    let nx = -(p.y - a.y) / l0 - (b.y - p.y) / l1;
    let ny = (p.x - a.x) / l0 + (b.x - p.x) / l1;
    const nl = Math.hypot(nx, ny);
    if (nl < 1e-6) {
      out.push({ x: p.x, y: p.y });
      runs.push(0);
      continue;
    }
    nx /= nl;
    ny /= nl;
    let clearance = Infinity;
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      if (j === i || k === i) continue; // the two edges that meet at p
      clearance = Math.min(clearance, pointSegDist(p, ring[j], ring[k]));
    }
    const run = Math.min(wants[i], 0.3 * clearance, 0.4 * Math.min(l0, l1));
    out.push({ x: p.x + nx * run, y: p.y + ny * run });
    runs.push(run);
  }
  return { ring: out, runs };
}

/**
 * The land, as one surface in three parts that never fight:
 *
 * - the waterline: the OSM ring itself, held at y = 0, with a skirt dropped to
 *   BASE_Y so the sea never sees under the coast;
 * - the batter: a sloped face from that waterline up and inward to the crest,
 *   carrying its own lambert, which is what puts an edge and a value break
 *   where land meets water instead of a cut-out sitting on a plate;
 * - a cap over the inset crest ring, heights from the shoreline only and
 *   clamped to 25 m, sealing every polygon so land is never hollow from above.
 *
 * The relief lattice (buildRelief) rises out of the cap. All of it carries
 * baked hillshade. The old build gave every relief cell a skirt to below the
 * waterline and dropped low neighbours, which is where the hollow pyramid tents
 * in the first review pass came from; this one has no skirts below the crest.
 */
function buildLand(rings) {
  let capTris = 0;
  let wallTris = 0;
  let flat = 0;
  let pulled = 0;
  for (const ring of rings) {
    const n = ring.length;
    const heights = ring.map((_, i) => Math.min(shoreHeight(ring, i), 25));
    /* a low shore gets a wide gentle run, a bluff a short steep one */
    const wants = heights.map((h) => Math.min(Math.max(1.5 * h, BATTER_MIN), BATTER_MAX));
    /* The bisector offset folds wherever the inward runs of two stretches of
     * shore meet, and a fold that stays local leaves the ring's area almost
     * intact, so the area guard below never sees it while earcut turns it into
     * overlapping cap and batter. Pull the runs back only where the crest
     * actually crosses itself: halve every run bounding a crossing edge, snap
     * anything under 5 cm to zero, and re-offset. Runs that reach zero put that
     * span of crest back on the waterline, which is simple by construction, so
     * the loop terminates; the count of rings that needed it is reported. */
    const limits = wants.slice();
    let crest = insetRing(ring, limits);
    let pulls = 0;
    for (let attempt = 0; attempt < 24; attempt++) {
      const folded = selfCrossingVerts(crest.ring);
      if (folded.size === 0) break;
      for (const i of folded) limits[i] = limits[i] * 0.5 < 0.05 ? 0 : limits[i] * 0.5;
      crest = insetRing(ring, limits);
      pulls += 1;
    }
    if (pulls > 0) pulled += 1;
    const area = signedArea(ring);
    if (selfCrossingVerts(crest.ring).size > 0 || signedArea(crest.ring) < 0.25 * area) {
      /* the offset folded through itself; this ring keeps a vertical face */
      crest = { ring: ring.map((p) => ({ x: p.x, y: p.y })), runs: new Array(n).fill(0) };
      flat += 1;
    }
    /* cap over the crest ring */
    const tris = earcut(crest.ring);
    for (let t = 0; t < tris.length; t += 3) {
      triangle(
        vertex(crest.ring[tris[t]].x, heights[tris[t]], crest.ring[tris[t]].y),
        vertex(crest.ring[tris[t + 1]].x, heights[tris[t + 1]], crest.ring[tris[t + 1]].y),
        vertex(crest.ring[tris[t + 2]].x, heights[tris[t + 2]], crest.ring[tris[t + 2]].y),
      );
    }
    capTris += tris.length / 3;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = ring[i];
      const b = ring[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      /* outward horizontal is the right normal of the boundary direction */
      const ox = dy / len;
      const oy = -dx / len;
      /* batter: the face spans the along-shore edge and the up-and-inward run,
       * so its normal leans out by the run and up by the rise */
      const rise = (heights[i] + heights[j]) / 2;
      const run = (crest.runs[i] + crest.runs[j]) / 2;
      const faceShade = shadeOf(ox * rise, run, oy * rise);
      const wetShade = shadeOf(ox, 0, oy);
      const capA = vertex(crest.ring[i].x, heights[i], crest.ring[i].y, faceShade);
      const capB = vertex(crest.ring[j].x, heights[j], crest.ring[j].y, faceShade);
      const seaA = vertex(a.x, 0, a.y, faceShade);
      const seaB = vertex(b.x, 0, b.y, faceShade);
      triangle(seaA, seaB, capB);
      triangle(seaA, capB, capA);
      /* skirt, only ever seen through a wave trough */
      const botA = vertex(a.x, BASE_Y, a.y, wetShade);
      const botB = vertex(b.x, BASE_Y, b.y, wetShade);
      triangle(botA, botB, vertex(b.x, 0, b.y, wetShade));
      triangle(botA, vertex(b.x, 0, b.y, wetShade), vertex(a.x, 0, a.y, wetShade));
      wallTris += 4;
    }
  }
  console.log(
    `land: ${rings.length} rings, ${capTris} cap tris, ${wallTris} shore tris, ${pulled} crests unfolded, ${flat} rings kept vertical`,
  );
}

/**
 * The terrain surface, as a restricted quadtree over two pitches.
 *
 * The lattice is built at RELIEF_CELL, the DEM's own resolution, then 2x2
 * blocks of it collapse back to one quad wherever the block is entirely on
 * land and its nine corners span less than RELIEF_DETAIL of height. A coarse
 * block that borders a fine one is emitted as a fan through its centre that
 * picks up the shared edge midpoints, so the two pitches meet without a
 * T-junction and no cell ever shows sky through a crack.
 *
 * Heights are filtered in lattice space rather than by sampling the DEM five
 * times per corner. z11 Terrarium carries buildings and bridge decks as single
 * -sample spikes; unfiltered, one of those becomes a 140 m cone standing alone
 * on flat ground, which is what the round0 skyline was made of. Each corner is
 * first clamped to its neighbours' median plus SPIKE_TOL, then two binomial
 * passes run over land corners only, so a coastal height is never dragged down
 * by the sea on the other side of the shoreline.
 */
/* The filtered relief lattice. `buildReliefField` fills it before any geometry
 * is emitted, so the shore crest, the relief and every structure that stands on
 * them read one surface; null only while the coast rings are being assembled. */
let reliefField = null;

/**
 * The filtered height of the land under one course-frame point, or null where
 * the lattice does not resolve land there.
 *
 * All four corners of the containing cell must be land, which is the same test
 * buildRelief uses before it draws a cell: where the answer is a height, the
 * relief really does draw a surface at it. A coastal cell with one land corner
 * is not a height of anything. Its lone corner may be a hill 85 m inland or a
 * harbour spike the despike only halved, and reading either onto a waterline
 * vertex puts a bluff on a wharf. Read bilinearly for the same reason: it is
 * what the emitted quad interpolates, so a crest cannot rise above the relief
 * that grows out of it.
 */
function reliefHeightAt(x, y) {
  if (reliefField === null) return null;
  const { N, half, cell, land, height } = reliefField;
  const i0 = Math.floor(x / cell) + half;
  const j0 = Math.floor(y / cell) + half;
  if (i0 < 0 || j0 < 0 || i0 + 1 >= N || j0 + 1 >= N) return null;
  const c00 = j0 * N + i0;
  const c10 = c00 + 1;
  const c01 = c00 + N;
  const c11 = c01 + 1;
  if (!land[c00] || !land[c10] || !land[c01] || !land[c11]) return null;
  const u = x / cell + half - i0;
  const v = y / cell + half - j0;
  return (
    height[c00] * (1 - u) * (1 - v) +
    height[c10] * u * (1 - v) +
    height[c01] * (1 - u) * v +
    height[c11] * u * v
  );
}

/**
 * The lowest lattice corner within `reach` metres of (x, y), or null where the
 * footprint touches no land corner at all.
 *
 * The minimum rather than a bilinear read, and over a radius rather than one
 * cell: a 30 m crane gauge spans a whole lattice cell, and a foot only counts
 * as planted when it is under the ground at every corner it stands over.
 */
function latticeLow(x, y, reach) {
  if (reliefField === null) return { low: null, edge: true };
  const { N, half, cell, land, height } = reliefField;
  const span = Math.ceil(reach / cell);
  const i0 = Math.floor(x / cell) + half;
  const j0 = Math.floor(y / cell) + half;
  let low = null;
  let edge = false;
  for (let dj = -span; dj <= span + 1; dj++) {
    for (let di = -span; di <= span + 1; di++) {
      const i = i0 + di;
      const j = j0 + dj;
      if (i < 0 || j < 0 || i >= N || j >= N) {
        edge = true;
        continue;
      }
      const cx = (i - half) * cell;
      const cy = (j - half) * cell;
      if (Math.hypot(cx - x, cy - y) > reach + cell) continue;
      const c = j * N + i;
      /* A water corner in reach means the lattice does not tessellate the cell
       * under this assembly: what L1 draws there is the ring cap, which can sit
       * metres below the nearest lattice corner. */
      if (!land[c]) {
        edge = true;
        continue;
      }
      if (low === null || height[c] < low) low = height[c];
    }
  }
  return { low, edge };
}

/**
 * A foot that cannot float. `clampGround` reads the raw DEM through a band
 * clamp; L1 draws a despiked, twice-smoothed, MIN_SHORE_H-floored lattice, and
 * where the raw read runs higher than the drawn surface the assembly ends up
 * standing on nothing. Round 4a left five of them 1 to 4 m in the air. Counted,
 * so a rebake reports how many needed the correction.
 */
let footSnaps = 0;
function footBelow(x, y, base, reach) {
  const { low, edge } = latticeLow(x, y, reach);
  /* Where the footprint reaches water, L1 draws the ring cap rather than the
   * lattice, and the cap's floor is MIN_SHORE_H however high the nearest hill
   * corner reads. Inland, the lattice is the surface and the assembly plants
   * against it rather than being dragged down to the waterline. */
  const floor = edge ? Math.min(low ?? Infinity, MIN_SHORE_H) : low;
  if (floor === null || !Number.isFinite(floor) || base <= floor - 1) return base;
  footSnaps += 1;
  return floor - 1;
}

/* The drawn L1 surface, indexed from the triangles the terrain layer actually
 * emitted rather than from the lattice it was built out of.
 *
 * `latticeLow` answers a question about the relief lattice, and the lattice is
 * only one of the three things L1 draws: along a quay the surface under a crane
 * is the shore ring's batter, which runs from the waterline up to an inset
 * crest, and the batter at the wharf edge sits metres below the lowest lattice
 * corner near the assembly centre. Round 4b grounded a whole crane on one
 * lattice minimum sampled at its centre and left 20 seaward feet 0.6 to 4.8 m
 * clear of the batter under them. Reading the emitted triangles removes the
 * proxy: whatever L1 draws under a foot is what the foot is planted against. */
let terrainTris = null;
let terrainGrid = null;
const TERRAIN_CELL = 64;

/** Index L_TERRAIN's emitted triangles by xz cell. Positions are already
 * quantised and in render axes (x, h in 0.1 m, z = -courseY); this converts
 * them back to the course frame the placement code works in. */
function buildTerrainIndex() {
  terrainTris = [];
  terrainGrid = new Map();
  const p = L_TERRAIN.positions;
  const index = L_TERRAIN.indices;
  for (let t = 0; t < index.length; t += 3) {
    const corner = [];
    for (let k = 0; k < 3; k++) {
      const v = index[t + k] * 3;
      corner.push([p[v], -p[v + 2], p[v + 1] / 10]);
    }
    const [a, b, c] = corner;
    const area2 = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(area2) < 1e-9) continue; // vertical wall: no xz footprint
    const id = terrainTris.length;
    terrainTris.push([a, b, c, area2]);
    const i0 = Math.floor(Math.min(a[0], b[0], c[0]) / TERRAIN_CELL);
    const i1 = Math.floor(Math.max(a[0], b[0], c[0]) / TERRAIN_CELL);
    const j0 = Math.floor(Math.min(a[1], b[1], c[1]) / TERRAIN_CELL);
    const j1 = Math.floor(Math.max(a[1], b[1], c[1]) / TERRAIN_CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const key = `${i},${j}`;
        let cell = terrainGrid.get(key);
        if (!cell) terrainGrid.set(key, (cell = []));
        cell.push(id);
      }
    }
  }
  console.log(`terrain index: ${terrainTris.length} triangles over ${terrainGrid.size} cells`);
}

/** The highest drawn L1 surface at one course-frame point, or null where L1
 * draws nothing there (open water). The maximum, because L1 stacks a cap over
 * a batter over a skirt and only the top of that stack is visible. */
function terrainHeightAt(x, y) {
  if (terrainGrid === null) return null;
  const cell = terrainGrid.get(
    `${Math.floor(x / TERRAIN_CELL)},${Math.floor(y / TERRAIN_CELL)}`,
  );
  if (!cell) return null;
  let best = null;
  for (const id of cell) {
    const [a, b, c, area2] = terrainTris[id];
    const w0 = ((b[0] - x) * (c[1] - y) - (c[0] - x) * (b[1] - y)) / area2;
    const w1 = ((c[0] - x) * (a[1] - y) - (a[0] - x) * (c[1] - y)) / area2;
    const w2 = 1 - w0 - w1;
    if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
    const h = w0 * a[2] + w1 * b[2] + w2 * c[2];
    if (best === null || h > best) best = h;
  }
  return best;
}

/* How far a foot is driven below the surface it stands on, and how wide a
 * stencil the surface is read over. The stencil covers a leg's own bottom face
 * (the widest member is 2.0 m square, half-diagonal 1.41 m) so the corner
 * vertices are planted, not just the axis; the embed is the same 1 m
 * `footBelow` already uses, which is four times the 0.1 m the position
 * quantiser rounds to. */
const FOOT_EMBED = 1;
const FOOT_STENCIL = 1.5;

/**
 * Where one leg's bottom belongs: at the assembly's own rail height, or driven
 * under the L1 surface beneath that leg wherever the surface runs lower. Legs
 * only ever grow downward, so the rail stays the assembly's structural datum
 * and the apex, portal and hinge heights are untouched.
 */
let perFootDrops = 0;
function footOnTerrain(x, y, rail) {
  let low = null;
  for (const [dx, dy] of [
    [0, 0],
    [FOOT_STENCIL, FOOT_STENCIL],
    [FOOT_STENCIL, -FOOT_STENCIL],
    [-FOOT_STENCIL, FOOT_STENCIL],
    [-FOOT_STENCIL, -FOOT_STENCIL],
  ]) {
    const h = terrainHeightAt(x + dx, y + dy);
    if (h === null) continue;
    if (low === null || h < low) low = h;
  }
  if (low === null || rail <= low - FOOT_EMBED) return rail;
  perFootDrops += 1;
  return low - FOOT_EMBED;
}

/**
 * The filtered height field, built before any geometry so the shore crest and
 * the relief that rises out of it read the same surface.
 *
 * It used to be computed inside buildRelief, which ran after buildLand, so the
 * crest ring took raw `groundAt` reads while the lattice 60 m away took
 * despiked and smoothed ones. That is the whole of the harbour-entrance defect:
 * see shoreHeight.
 */
function buildReliefField(boxes) {
  const half = Math.ceil(FADE_END / RELIEF_CELL);
  const N = 2 * half + 1;
  const at = (i, j) => j * N + i;
  const cornerX = (i) => (i - half) * RELIEF_CELL;
  const cornerY = (j) => (j - half) * RELIEF_CELL;

  const land = new Uint8Array(N * N);
  const height = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = cornerX(i);
      const y = cornerY(j);
      if (Math.hypot(x, y) > FADE_END + RELIEF_CELL) continue;
      if (!insideLand(boxes, x, y)) continue;
      land[at(i, j)] = 1;
      height[at(i, j)] = Math.min(Math.max(groundAt(x, y), 0), 500);
    }
  }

  const OFF = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];
  const neighbours = (src, i, j, into) => {
    into.length = 0;
    for (const [di, dj] of OFF) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
      const c = at(ii, jj);
      if (land[c]) into.push(src[c]);
    }
    return into;
  };

  /* Both the corner under test and its neighbours are read from the unclamped
   * snapshot, and clamps land in `height`. Reading neighbours from the array
   * the loop is writing made every corner's median depend on which of its
   * neighbours the scan had already reached, so clamps cascaded down a row and
   * the result changed with traversal order. */
  let spikes = 0;
  const bag = [];
  const raw = height.slice();
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const c = at(i, j);
      if (!land[c]) continue;
      const ns = neighbours(raw, i, j, bag);
      if (ns.length < 5) continue;
      ns.sort((a, b) => a - b);
      const med = ns[ns.length >> 1];
      if (raw[c] - med > SPIKE_TOL) {
        height[c] = med + SPIKE_TOL;
        spikes += 1;
      } else if (med - raw[c] > SPIKE_TOL) {
        height[c] = med - SPIKE_TOL;
        spikes += 1;
      }
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const src = height.slice();
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const c = at(i, j);
        if (!land[c]) continue;
        let sum = 4 * src[c];
        let weight = 4;
        for (const [di, dj, w] of [
          [-1, 0, 2], [1, 0, 2], [0, -1, 2], [0, 1, 2],
          [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1],
        ]) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
          const n = at(ii, jj);
          if (!land[n]) continue;
          sum += w * src[n];
          weight += w;
        }
        height[c] = sum / weight;
      }
    }
  }
  for (let c = 0; c < height.length; c++) {
    if (land[c] && height[c] < MIN_SHORE_H) height[c] = MIN_SHORE_H;
  }

  /* Publish the filtered field so the structure layers can stand on the same
   * surface L1 actually draws. `groundAt` is a raw DEM read; this has been
   * despiked, twice smoothed and floored at MIN_SHORE_H, and the two differ by
   * metres, which is what left five round-4a assemblies hanging 1 to 4 m over
   * their own ground. */
  reliefField = { N, half, cell: RELIEF_CELL, land, height };
  console.log(`relief field: ${N}x${N} corners at ${RELIEF_CELL} m, ${spikes} DEM spikes clamped`);
}

function buildRelief() {
  const { N, half, land, height } = reliefField;
  const at = (i, j) => j * N + i;
  const cornerX = (i) => (i - half) * RELIEF_CELL;
  const cornerY = (j) => (j - half) * RELIEF_CELL;

  /* per-corner shade from the filtered lattice gradient; a water neighbour
   * reads as height 0, which steepens the coastal slope a little, in the right
   * direction */
  const shadeCache = new Int16Array(N * N).fill(-1);
  const cornerShade = (i, j) => {
    const c = at(i, j);
    if (shadeCache[c] >= 0) return shadeCache[c];
    const sample = (ii, jj) => (ii < 0 || jj < 0 || ii >= N || jj >= N ? 0 : height[at(ii, jj)]);
    const sx = (sample(i - 1, j) - sample(i + 1, j)) / (2 * RELIEF_CELL);
    const sy = (sample(i, j - 1) - sample(i, j + 1)) / (2 * RELIEF_CELL);
    const s = shadeOf(-sx, 1, -sy);
    shadeCache[c] = s;
    return s;
  };

  const corner = (i, j) => vertex(cornerX(i), height[at(i, j)], cornerY(j), cornerShade(i, j));

  /* Blocks are 2x2 fine cells. A block only exists where all nine of its
   * corners are land, which is also the only place a coarse quad could be
   * legal; everything else is left to the fine cells, whose own four-corner
   * test resolves the coastline at RELIEF_CELL. */
  const B = (N - 1) >> 1;
  const blockAt = (bi, bj) => bj * B + bi;
  const blockFine = new Uint8Array(B * B);
  const blockDraw = new Uint8Array(B * B);
  for (let bj = 0; bj < B; bj++) {
    for (let bi = 0; bi < B; bi++) {
      const i0 = bi * 2;
      const j0 = bj * 2;
      let all = true;
      let lo = Infinity;
      let hi = -Infinity;
      for (let dj = 0; dj <= 2 && all; dj++) {
        for (let di = 0; di <= 2; di++) {
          const c = at(i0 + di, j0 + dj);
          if (!land[c]) {
            all = false;
            break;
          }
          if (height[c] < lo) lo = height[c];
          if (height[c] > hi) hi = height[c];
        }
      }
      const b = blockAt(bi, bj);
      const cx = cornerX(i0 + 1);
      const cy = cornerY(j0 + 1);
      const r = Math.hypot(cx, cy);
      if (r > FADE_END) continue;
      blockDraw[b] = 1;
      /* the cap already seals everything at or under the crest band, so a
       * block that never rises above it draws nothing at all */
      if (all && hi <= MIN_SHORE_H + 1.5) {
        blockDraw[b] = 0;
        continue;
      }
      blockFine[b] = !all || hi - lo > RELIEF_DETAIL || r < RELIEF_NEAR ? 1 : 0;
    }
  }
  const fineNeighbour = (bi, bj) => {
    if (bi < 0 || bj < 0 || bi >= B || bj >= B) return false;
    const b = blockAt(bi, bj);
    return blockDraw[b] === 1 && blockFine[b] === 1;
  };

  let coarse = 0;
  let fine = 0;
  let fans = 0;
  for (let bj = 0; bj < B; bj++) {
    for (let bi = 0; bi < B; bi++) {
      const b = blockAt(bi, bj);
      if (!blockDraw[b]) continue;
      const i0 = bi * 2;
      const j0 = bj * 2;
      if (blockFine[b]) {
        for (let dj = 0; dj < 2; dj++) {
          for (let di = 0; di < 2; di++) {
            const i = i0 + di;
            const j = j0 + dj;
            const c00 = at(i, j);
            const c10 = at(i + 1, j);
            const c01 = at(i, j + 1);
            const c11 = at(i + 1, j + 1);
            if (!land[c00] || !land[c10] || !land[c01] || !land[c11]) continue;
            const hi = Math.max(height[c00], height[c10], height[c01], height[c11]);
            if (hi <= MIN_SHORE_H + 1.5) continue;
            const v00 = corner(i, j);
            const v10 = corner(i + 1, j);
            const v01 = corner(i, j + 1);
            const v11 = corner(i + 1, j + 1);
            triangle(v00, v10, v11);
            triangle(v00, v11, v01);
            fine += 1;
          }
        }
        continue;
      }
      /* coarse: one quad, unless a finer neighbour has put a vertex on a
       * shared edge, in which case fan through the centre and pick it up */
      const edges = [
        fineNeighbour(bi, bj - 1),
        fineNeighbour(bi + 1, bj),
        fineNeighbour(bi, bj + 1),
        fineNeighbour(bi - 1, bj),
      ];
      if (!edges[0] && !edges[1] && !edges[2] && !edges[3]) {
        const v00 = corner(i0, j0);
        const v20 = corner(i0 + 2, j0);
        const v02 = corner(i0, j0 + 2);
        const v22 = corner(i0 + 2, j0 + 2);
        triangle(v00, v20, v22);
        triangle(v00, v22, v02);
        coarse += 1;
        continue;
      }
      const loop = [];
      loop.push(corner(i0, j0));
      if (edges[0]) loop.push(corner(i0 + 1, j0));
      loop.push(corner(i0 + 2, j0));
      if (edges[1]) loop.push(corner(i0 + 2, j0 + 1));
      loop.push(corner(i0 + 2, j0 + 2));
      if (edges[2]) loop.push(corner(i0 + 1, j0 + 2));
      loop.push(corner(i0, j0 + 2));
      if (edges[3]) loop.push(corner(i0, j0 + 1));
      const mid = corner(i0 + 1, j0 + 1);
      for (let k = 0; k < loop.length; k++) {
        triangle(mid, loop[k], loop[(k + 1) % loop.length]);
      }
      fans += 1;
    }
  }
  console.log(
    `relief: ${fine} fine cells (${RELIEF_CELL} m), ${coarse} coarse + ${fans} stitched blocks (${
      2 * RELIEF_CELL
    } m)`,
  );
}

/**
 * Breakwater ways that are not part of the coastline, as rubble mounds rather
 * than flat ribbons.
 *
 * The old build extruded a box 36 m wide and 4 m tall with two vertical sides
 * and a flat lid. Seen from a kilometre up-course that is a paper strip lying
 * on the water beside the land it belongs to, which is most of what the round0
 * pass read as detached slivers. A mound has two battered flanks that take
 * their own lambert, so the sunward flank, the crest and the shaded flank are
 * three values, and its foot sits in the shader's waterline band the way a
 * structure the sea breaks over should.
 */
function buildBreakwaters(ways, coastlineIds) {
  const HEIGHT = 5;
  const CREST_VARY = 0.7; // m of crest undulation either side of HEIGHT
  const BASE_HALF = 30;
  /* Round 0 (catalogue 10.1). The USACE Coastal Hydraulics Laboratory section
   * table gives the Middle Breakwater a 16 ft crest at +14 ft MLLW and states
   * that the Long Beach Breakwater is the same section but for its core
   * elevation [P7a]. 16 ft is 4.877 m, so the half-width is 2.44 and not the 9
   * that drew an 18 m crest, nearly four times too wide, and turned a rubble
   * mound into a road. HEIGHT stays at 5 m: the table's +14 ft is 4.27 m and
   * the drawn 5 is within a rounding of it. */
  const CREST_HALF = 2.44;
  let built = 0;
  for (const way of ways) {
    if (coastlineIds.has(way.id)) continue;
    const line = way.geometry.map((g) => project(g.lat, g.lon)).filter(inside);
    if (line.length < 2) continue;
    /* per-vertex normal, averaged over the incident segments, so a bend in the
     * mole does not open a notch in the flank */
    const normals = line.map((_, i) => {
      let nx = 0;
      let ny = 0;
      for (const [p, q] of [
        [line[i - 1], line[i]],
        [line[i], line[i + 1]],
      ]) {
        if (!p || !q) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        nx += -dy / len;
        ny += dx / len;
      }
      const len = Math.hypot(nx, ny) || 1;
      return { x: nx / len, y: ny / len };
    });
    /* Crest height along the mole, and the whole of the round-5 change here.
     *
     * D6 was a ruler-straight waterline; round 2 fixed the plan view and left
     * the elevation ruled, so 3 km of rubble mound draws one perfectly flat
     * line. A real armour-stone crest is not flat: it is placed stone with a
     * metre of tolerance and decades of settlement. The offset is a hash of the
     * quantised vertex position, so it is reproducible and independent of the
     * order the ways arrive in, then smoothed once along the line so the crest
     * undulates over 100 m rather than jittering per vertex. The mean is the
     * 5 m the bake already used and Appendix C flags as unverified: this varies
     * it, it does not raise it. At the 2.1 to 3.2 km the near arm sits at, the
     * +/-0.7 m band is +/-0.3 px, which is what takes the hard edge off. */
    const raw = line.map((p) => HEIGHT + (hash01(p.x, p.y) - 0.5) * 2 * CREST_VARY);
    const crest = raw.map((h, i) => {
      const a = raw[Math.max(i - 1, 0)];
      const b = raw[Math.min(i + 1, raw.length - 1)];
      return (a + 2 * h + b) / 4;
    });
    const strip = (halfA, hA, halfB, hB, side, shade) => {
      for (let i = 0; i < line.length - 1; i++) {
        const p = line[i];
        const q = line[i + 1];
        const np = normals[i];
        const nq = normals[i + 1];
        const a0 = vertex(p.x + np.x * halfA * side, hA(i), p.y + np.y * halfA * side, shade(i));
        const b0 = vertex(q.x + nq.x * halfA * side, hA(i + 1), q.y + nq.y * halfA * side, shade(i));
        const a1 = vertex(p.x + np.x * halfB * side, hB(i), p.y + np.y * halfB * side, shade(i));
        const b1 = vertex(q.x + nq.x * halfB * side, hB(i + 1), q.y + nq.y * halfB * side, shade(i));
        triangle(a0, b0, b1);
        triangle(a0, b1, a1);
      }
    };
    const flat = (h) => () => h;
    const at = (i) => crest[i];
    /* a flank normal leans out by the rise and up by the run */
    const flankShade = (i, side) => {
      const p = line[Math.min(i, line.length - 2)];
      const q = line[Math.min(i, line.length - 2) + 1];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const ox = ((-dy / len) * side) / 1;
      const oy = ((dx / len) * side) / 1;
      return shadeOf(ox * HEIGHT, BASE_HALF - CREST_HALF, oy * HEIGHT);
    };
    for (const side of [1, -1]) {
      /* skirt below the waterline, then the flank up to the crest */
      strip(BASE_HALF, flat(BASE_Y), BASE_HALF, flat(0), side, (i) => flankShade(i, side));
      strip(BASE_HALF, flat(0), CREST_HALF, at, side, (i) => flankShade(i, side));
    }
    strip(CREST_HALF, at, -CREST_HALF, at, 1, () => SHADE_FLAT);
    /* close both ends so the mound is never seen through */
    for (const end of [0, line.length - 1]) {
      const p = line[end];
      const n = normals[end];
      const cap = (half, h) => vertex(p.x + n.x * half, h, p.y + n.y * half, SHADE_FLAT);
      const b0 = cap(BASE_HALF, 0);
      const b1 = cap(-BASE_HALF, 0);
      const c0 = cap(CREST_HALF, crest[end]);
      const c1 = cap(-CREST_HALF, crest[end]);
      triangle(b0, b1, c1);
      triangle(b0, c1, c0);
    }
    built += 1;
    if (process.env.BAKE_DEBUG) {
      const mid = line[line.length >> 1];
      console.log(
        `  breakwater ${line.length} pts, mid r=${Math.round(Math.hypot(mid.x, mid.y))} (${Math.round(
          mid.x,
        )},${Math.round(mid.y)})`,
      );
    }
  }
  console.log(`breakwaters: ${built} ways`);
}

/* ----------------------------------------------------- L5, horizon curtain */

/**
 * One azimuth column of a profile band: the sample between `from` and `to`
 * whose elevation angle from a sea-level eye is the largest, with the Earth's
 * curvature already taken out of it.
 *
 * Everything at or below sea level is skipped rather than clamped. Terrarium
 * carries ETOPO1 bathymetry under water, so an unfiltered march would raise a
 * ridge out of the sea floor; the profile has to be land or nothing.
 */
function marchColumn(dx, dy, from, to, step, zoom) {
  let bestAngle = -Infinity;
  let bestD = 0;
  let bestH = 0;
  for (let d = from; d <= to; d += step) {
    const { lat, lon } = unproject(dx * d, dy * d);
    const h = demAt(lat, lon, zoom);
    if (h <= 0) continue;
    const angle = (h - (d * d) / (2 * R_EFF)) / d;
    if (angle > bestAngle) {
      bestAngle = angle;
      bestD = d;
      bestH = h;
    }
  }
  return bestAngle > CURTAIN_MIN_ANGLE ? { d: bestD, h: bestH, angle: bestAngle } : null;
}

/** Every tile the march will read, including the far corner each bilinear
 * sample reaches into. Collected by walking the march's own grid rather than
 * by bounding a box, so the prefetch and the march can never disagree. */
function curtainTiles(from, to, step, zoom) {
  const wanted = new Set();
  const columns = Math.round(360 / CURTAIN_STEP_DEG);
  for (let c = 0; c < columns; c++) {
    const cb = c * CURTAIN_STEP_DEG * DEG;
    const dx = Math.sin(cb);
    const dy = Math.cos(cb);
    for (let d = from; d <= to; d += step) {
      const { lat, lon } = unproject(dx * d, dy * d);
      const { px, py } = demPixel(lat, lon, zoom);
      const x0 = Math.floor(px);
      const y0 = Math.floor(py);
      for (const ix of [x0, x0 + 1]) {
        for (const iy of [y0, y0 + 1]) {
          wanted.add(`${Math.floor(ix / 256)}/${Math.floor(iy / 256)}`);
        }
      }
    }
  }
  return [...wanted].sort();
}

async function prefetchCurtainDem() {
  for (const [from, to, step, zoom] of [
    [CURTAIN_MID_FROM, CURTAIN_MID_TO, CURTAIN_MID_STEP, CURTAIN_MID_ZOOM],
    [CURTAIN_MID_TO, CURTAIN_FAR_TO, CURTAIN_FAR_STEP, CURTAIN_FAR_ZOOM],
  ]) {
    const tiles = curtainTiles(from, to, step, zoom);
    for (const key of tiles) {
      const [tx, ty] = key.split("/").map(Number);
      await demTile(tx, ty, zoom);
    }
    console.log(`curtain DEM: ${tiles.length} terrarium tiles at z${zoom}`);
  }
}

/**
 * L5: the two profile bands, ray marched out of the DEM and emitted as one
 * quad strip per band into one mesh and one draw (design doc 5.2).
 *
 * The layer reinterprets `pos`, and it is the container's only semantic
 * overload: `pos.xz` is the unit horizontal direction times 1000 and `pos.y` is
 * the vertex's true summit height above sea level, both still Int16 in the same
 * slots. `aDist` carries the true horizontal range so the vertex shader can
 * recompute the exact elevation angle for whatever height the eye is at; a
 * curtain nailed to a fixed y would swing 3.8 degrees between the water-level
 * and the 779 m freeform cameras where the real Palos Verdes ridge swings 2.7,
 * and that 1.1 degree error is 21 px on a 28 px ridge.
 */
function buildCurtain() {
  const columns = Math.round(360 / CURTAIN_STEP_DEG);
  const bands = [
    { name: "mid", from: CURTAIN_MID_FROM, to: CURTAIN_MID_TO, step: CURTAIN_MID_STEP, zoom: CURTAIN_MID_ZOOM },
    { name: "far", from: CURTAIN_MID_TO, to: CURTAIN_FAR_TO, step: CURTAIN_FAR_STEP, zoom: CURTAIN_FAR_ZOOM },
  ];
  /* A column is two vertices on one direction: the summit, and sea level at
   * the same range. The shader runs one formula over both and only the base
   * takes the horizon clamp, so a base vertex ships its column's real range
   * and a height of zero. That zero is also what gzip gets a run of. */
  const columnVertex = (c, sample, base, bandBit) => {
    const cb = c * CURTAIN_STEP_DEG * DEG;
    return curtainVertex(
      Math.round(Math.sin(cb) * 1000),
      base ? 0 : Math.round(sample.h * Y_UNIT),
      Math.round(-Math.cos(cb) * 1000),
      Math.round(sample.d / 4),
      (base ? COLUMN_BASE : 0) | bandBit,
    );
  };
  for (const band of bands) {
    const bandBit = band.name === "far" ? COLUMN_FAR : 0;
    const ridgeVertex = (c, sample) => columnVertex(c, sample, false, bandBit);
    const baseVertex = (c, sample) => columnVertex(c, sample, true, bandBit);
    const profile = [];
    for (let c = 0; c < columns; c++) {
      const cb = c * CURTAIN_STEP_DEG * DEG;
      profile.push(marchColumn(Math.sin(cb), Math.cos(cb), band.from, band.to, band.step, band.zoom));
    }
    let quads = 0;
    let widest = 0;
    let run = 0;
    for (let c = 0; c < columns; c++) {
      const next = (c + 1) % columns;
      run = profile[c] === null ? 0 : run + 1;
      widest = Math.max(widest, run);
      if (profile[c] === null || profile[next] === null) continue;
      triangle(ridgeVertex(c, profile[c]), baseVertex(c, profile[c]), baseVertex(next, profile[next]));
      triangle(
        ridgeVertex(c, profile[c]),
        baseVertex(next, profile[next]),
        ridgeVertex(next, profile[next]),
      );
      quads += 1;
    }
    const live = profile.filter(Boolean);
    const peak = live.reduce((best, p) => (p.angle > best.angle ? p : best), live[0]);
    console.log(
      `curtain ${band.name}: ${live.length} of ${columns} columns carry land, ${quads} quads, ` +
        `widest run ${(widest * CURTAIN_STEP_DEG).toFixed(1)} deg, ` +
        `highest ${peak.h.toFixed(0)} m at ${(peak.d / 1000).toFixed(1)} km ` +
        `(${(peak.angle / DEG).toFixed(3)} deg, ${(peak.angle * 1056.2).toFixed(1)} px)`,
    );
  }
}

/* ------------------------------------------------- L2 and L3 solid geometry */

/* Vector helpers in bake space (x across, h up, y up the course axis). */
const v3 = (x, h, y) => ({ x, h, y });
const sub3 = (a, b) => v3(a.x - b.x, a.h - b.h, a.y - b.y);
const add3 = (a, b) => v3(a.x + b.x, a.h + b.h, a.y + b.y);
const mul3 = (a, s) => v3(a.x * s, a.h * s, a.y * s);
const dot3 = (a, b) => a.x * b.x + a.h * b.h + a.y * b.y;
const cross3 = (a, b) =>
  v3(a.h * b.y - a.y * b.h, a.y * b.x - a.x * b.y, a.x * b.h - a.h * b.x);
const norm3 = (a) => {
  const len = Math.hypot(a.x, a.h, a.y) || 1;
  return v3(a.x / len, a.h / len, a.y / len);
};

/** One flat face, wound so its normal points outward, with its own shade byte
 * on all four corners and no vertex shared with the next face. Faceting is what
 * makes a box read as a box under a colour this flat (design doc 2.3). */
function face(p0, p1, p2, p3, normal) {
  const wind = dot3(cross3(sub3(p1, p0), sub3(p2, p0)), normal) >= 0;
  const [q0, q1, q2, q3] = wind ? [p0, p1, p2, p3] : [p3, p2, p1, p0];
  const shade = shadeOf(normal.x, normal.h, normal.y);
  const a = vertex(q0.x, q0.h, q0.y, shade);
  const b = vertex(q1.x, q1.h, q1.y, shade);
  const c = vertex(q2.x, q2.h, q2.y, shade);
  const d = vertex(q3.x, q3.h, q3.y, shade);
  triangle(a, b, c);
  triangle(a, c, d);
}

/**
 * A structural member: a rectangular prism from `a` to `b`, `wide` metres
 * across `across` and `thick` metres across the remaining axis, optionally
 * tapering to `wideB` x `thickB` at the far end. 8 corners, 6 faces, 12
 * triangles, per-face normals. This is what replaces the flat silhouette quads
 * the round-2 cranes were drawn with: a quad seen edge on is one pixel (D9).
 */
function member(a, b, across, wide, thick, wideB = wide, thickB = thick) {
  const axis = norm3(sub3(b, a));
  let l1 = sub3(across, mul3(axis, dot3(across, axis)));
  if (Math.hypot(l1.x, l1.h, l1.y) < 1e-6) {
    l1 = sub3(v3(0, 1, 0), mul3(axis, dot3(v3(0, 1, 0), axis)));
  }
  l1 = norm3(l1);
  const l2 = norm3(cross3(axis, l1));
  const at = (end, w, t, su, sv) =>
    add3(add3(end, mul3(l1, (su * w) / 2)), mul3(l2, (sv * t) / 2));
  const a00 = at(a, wide, thick, -1, -1);
  const a10 = at(a, wide, thick, 1, -1);
  const a11 = at(a, wide, thick, 1, 1);
  const a01 = at(a, wide, thick, -1, 1);
  const b00 = at(b, wideB, thickB, -1, -1);
  const b10 = at(b, wideB, thickB, 1, -1);
  const b11 = at(b, wideB, thickB, 1, 1);
  const b01 = at(b, wideB, thickB, -1, 1);
  face(a10, a11, b11, b10, l1);
  face(a00, a01, b01, b00, mul3(l1, -1));
  face(a01, a11, b11, b01, l2);
  face(a00, a10, b10, b00, mul3(l2, -1));
  face(a00, a10, a11, a01, mul3(axis, -1));
  face(b00, b10, b11, b01, axis);
}

/** Deterministic per-site jitter: a hash of the quantised position, so a
 * rebake reproduces every crane byte for byte whatever order they arrive in.
 * The round-2 build used a shared LCG, which was reproducible but only as long
 * as nothing upstream reordered the placements. */
function hash01(x, y) {
  let h = Math.imul(Math.round(x) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(y) | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Ground under a structure, clamped into a band the DEM's harbour spikes
 * cannot reach. */
const clampGround = (x, y, low, high) => Math.min(Math.max(groundAt(x, y), low), high);

const centroidOf = (ring) => {
  let cx = 0;
  let cy = 0;
  for (const p of ring) {
    cx += p.x / ring.length;
    cy += p.y / ring.length;
  }
  return { x: cx, y: cy };
};

/** Way geometry -> course-frame ring, closing duplicate dropped. */
function ringOf(way) {
  const ring = way.geometry.map((g) => project(g.lat, g.lon));
  if (ring.length > 1 && keyOf(ring[0]) === keyOf(ring[ring.length - 1])) ring.pop();
  return ring;
}

/** Walk a closed ring and emit a point every `step` metres of arc, starting at
 * ring[0]. Unlike reduceRing this does not respect the source's own vertices: an
 * OSM island ring carries 39 vertices on White and 158 on Grissom for outlines
 * of about the same length, so a per-vertex rim would be four times coarser on
 * one island than on the next for no reason in the world. Even spacing makes the
 * rim's facet size a property of the metre, which is what a stone is. */
function resampleRing(ring, step) {
  const out = [];
  let next = 0;
  let acc = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    while (next < acc + len) {
      const t = (next - acc) / len;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      next += step;
    }
    acc += len;
  }
  /* a final sample that landed back on the first one closes nothing and welds */
  if (out.length > 2) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.hypot(last.x - first.x, last.y - first.y) < step * 0.5) out.pop();
  }
  return out;
}

/** Visvalingam: drop the vertex whose ear has the least area until `want`
 * remain. Douglas-Peucker cannot hit an exact vertex budget, and the budget is
 * what L2's 22 triangles per prism are bought with. */
function reduceRing(ring, want) {
  const out = ring.slice();
  while (out.length > want) {
    let worst = 0;
    let worstArea = Infinity;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length];
      const p = out[i];
      const b = out[(i + 1) % out.length];
      const area = Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / 2;
      if (area < worstArea) {
        worstArea = area;
        worst = i;
      }
    }
    out.splice(worst, 1);
  }
  return out;
}

/** Nearest coastline segment: its direction, and the seaward normal. Land is
 * on the left of the boundary direction, so the right normal points at water,
 * which is the side a container crane's boom hangs over. */
function quayFrame(rings, p) {
  let dir = { x: 1, y: 0 };
  let bestDist = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0), 1);
      const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
      if (d < bestDist) {
        bestDist = d;
        const len = Math.hypot(dx, dy) || 1;
        dir = { x: dx / len, y: dy / len };
      }
    }
  }
  return { quay: dir, sea: { x: dir.y, y: -dir.x }, dist: bestDist };
}

/**
 * L2, urban massing: one faceted prism per OSM building that clears the
 * screen-space cut in design doc 2.1, extruded from its own footprint to its
 * own `height` tag. Ground under it comes from the LA County import's
 * `ele - height` where the building carries `ele` (measured median 5.1 m on the
 * Pier J wharf and 5.2 m on Pier G against a published 4 to 7 m MLLW deck, so
 * the datum needs no offset), and from the DEM where it does not.
 */
function buildMassing(ways) {
  let prisms = 0;
  let fromEle = 0;
  let footVerts = 0;
  /* The THUMS camouflage towers are in this query too, and L4 draws them as
   * curated heroes with the island rim and planting around them. Extruding
   * them here as well would put two towers in the same 187 m2 footprint. */
  const heroTowers = new Set(venue.heroes?.islandTowers ?? []);
  const picked = [];
  for (const way of ways) {
    if (heroTowers.has(way.id)) continue;
    const height = Number.parseFloat(way.tags?.height);
    if (!Number.isFinite(height) || height < MASS_MIN_H) continue;
    let ring = ringOf(way);
    if (ring.length < 3) continue;
    const centre = centroidOf(ring);
    const d = Math.hypot(centre.x, centre.y);
    if (d > CLIP_R) continue;
    if (d > MASS_NEAR && height < MASS_FAR_MIN_H) continue;
    if (signedArea(ring) < 0) ring.reverse();
    if (ring.length > MASS_FOOT) ring = reduceRing(ring, MASS_FOOT);
    /* positions ship as Int16 metres, so an edge shorter than the quantiser
     * lands as a zero-area wall: drop those corners rather than emit them */
    const kept = [];
    for (const p of ring) {
      if (kept.length === 0 || Math.hypot(p.x - kept[kept.length - 1].x, p.y - kept[kept.length - 1].y) >= 2) {
        kept.push(p);
      }
    }
    while (kept.length > 2 && Math.hypot(kept[0].x - kept[kept.length - 1].x, kept[0].y - kept[kept.length - 1].y) < 2) {
      kept.pop();
    }
    ring = kept;
    if (ring.length < 3) continue;
    if (Math.abs(signedArea(ring)) < 40) continue;
    const ele = Number.parseFloat(way.tags?.ele);
    const base = Number.isFinite(ele)
      ? Math.max(ele - height, 0)
      : clampGround(centre.x, centre.y, 0, MASS_GROUND_MAX);
    if (Number.isFinite(ele)) fromEle += 1;
    /* The walls run from below the terrain surface, not from the building's own
     * ground datum: the relief lattice under it is a 60 m DEM sample and the
     * two disagree by metres. A prism whose foot stops at its own base is the
     * floating slab defect (D3) waiting to come back at a grazing angle. */
    const foot = Math.max(Math.min(base, clampGround(centre.x, centre.y, 0, MASS_GROUND_MAX), MIN_SHORE_H) - 3, BASE_Y);
    picked.push({ ring, foot, base, top: base + height, height, d });
  }
  for (const b of picked) {
    const n = b.ring.length;
    for (let i = 0; i < n; i++) {
      const a = b.ring[i];
      const c = b.ring[(i + 1) % n];
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      /* CCW ring: the outward normal is the right normal of the edge */
      const normal = v3(dy / len, 0, -dx / len);
      face(
        v3(a.x, b.foot, a.y),
        v3(c.x, b.foot, c.y),
        v3(c.x, b.top, c.y),
        v3(a.x, b.top, a.y),
        normal,
      );
    }
    const roof = earcut(b.ring);
    const top = b.ring.map((p) => vertex(p.x, b.top, p.y, SHADE_FLAT));
    for (let i = 0; i < roof.length; i += 3) {
      triangle(top[roof[i]], top[roof[i + 1]], top[roof[i + 2]]);
    }
    prisms += 1;
    footVerts += n;
  }
  console.log(
    `massing: ${prisms} prisms of ${ways.length} candidates, ${fromEle} on OSM ele ground, ` +
      `${(footVerts / Math.max(prisms, 1)).toFixed(1)} footprint verts each, ` +
      `${heroTowers.size} THUMS towers left to L4`,
  );
}

/**
 * L3, port infrastructure: container gantries as real volumes at real scale,
 * the tank farms, the wharf and pier decks, and stylised container blocks
 * inside terminal polygons that hold a crane.
 *
 * The crane frame is the real one: rails run along the quay, the gauge and the
 * boom both lie in the plane perpendicular to it, and the boom hangs seaward.
 * The round-2 build drew the boom along the quay instead, which is why the
 * cranes never read as a comb of gantries over the water (D9).
 */
function buildPort(cranePoints, infra, rings, boxes) {
  const placed = [];
  /* the whole disc, not round 2's 7.5 km: the Pier T, Pier 400 and Pier 300
   * banks sit at 7.4 to 9.1 km and the doc's inventory keeps all three */
  const candidates = cranePoints
    .filter((p) => inside(p))
    .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
  for (const p of candidates) {
    if (placed.length >= CRANE_MAX) break;
    if (placed.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < CRANE_MIN_SPACING)) continue;
    placed.push(p);
  }
  let near = 0;
  let far = 0;
  for (const p of placed) {
    const { quay, sea } = quayFrame(rings, p);
    const at = (u, v, h) =>
      v3(p.x + sea.x * u + quay.x * v, h, p.y + sea.y * u + quay.y * v);
    const across = v3(quay.x, 0, quay.y);
    const seaV = v3(sea.x, 0, sea.y);
    const sill = clampGround(p.x, p.y, MIN_SHORE_H, DECK_MAX_H);
    /* legs start inside the apron, never on top of it, and never above the
     * relief lattice L1 actually draws under the wharf */
    const rail = footBelow(p.x, p.y, sill - 2, CRANE_GAUGE);
    const apex = sill + CRANE_APEX_MIN + hash01(p.x, p.y) * CRANE_APEX_SPAN;
    const portal = sill + (apex - sill) * 0.42;
    const hinge = sill + (apex - sill) * 0.62;
    const g = CRANE_GAUGE / 2;
    const w = CRANE_WIDTH / 2;
    const d = Math.hypot(p.x, p.y);
    /* One rail height for the whole gantry is what left 20 seaward feet in the
     * air: the gauge is 30 m, so the waterside pair stands over the shore
     * batter while the landside pair stands on the apron behind it, and a
     * single lattice minimum taken at the centre cannot be under both. Each leg
     * reads the L1 surface under its own footprint and grows down to meet it. */
    const railAt = (u, v) => footOnTerrain(p.x + sea.x * u + quay.x * v, p.y + sea.y * u + quay.y * v, rail);
    /* The legs carry the boom, so they run to the hinge, not to the portal
     * beam. Round 4a stopped them at 0.42 of the apex and hung the boom and the
     * backreach at 0.62, which left both members floating about 16 m clear of
     * anything, and put the A-frame 6 m to one side of the boom root as well.
     * Both leg pairs now reach the hinge and a beam runs across each pair
     * through the root the member springs from, which is where a real gantry
     * carries that load. */
    if (d <= CRANE_LOD_NEAR) {
      /* 14 members, 168 triangles: the design doc 9.1 archetype plus the two
       * hinge beams the boom and the backreach are attached with */
      for (const u of [g, -g]) {
        for (const v of [w, -w]) member(at(u, v, railAt(u, v)), at(u, v, hinge), across, 1.8, 1.8);
      }
      for (const u of [g, -g]) member(at(u, -w, portal), at(u, w, portal), seaV, 1.6, 1.6);
      member(at(g, 0, portal), at(-g, 0, portal), across, 1.6, 1.6);
      for (const u of [g, -g]) member(at(u, -w, hinge), at(u, w, hinge), seaV, 2.2, 2.0);
      for (const v of [w, -w]) member(at(g, v, hinge), at(-g * 0.1, 0, apex), across, 1.6, 1.6);
      member(at(g, 0, hinge), at(g + CRANE_OUTREACH, 0, hinge + 2), across, 3.0, 2.6, 1.8, 1.8);
      member(at(-g, 0, hinge), at(-g - CRANE_BACKREACH, 0, hinge + 4), across, 2.6, 2.4);
      member(at(-g * 0.55, -w * 0.9, portal + 4), at(-g * 0.55, w * 0.9, portal + 4), seaV, 8, 7);
      near += 1;
    } else {
      /* 6 members, 72 triangles: four legs, the beam that ties the waterside
       * pair together, and the gantry beam it carries. Under 11 px that
       * silhouette is all a crane has left (design doc 9.1). */
      for (const u of [g, -g]) {
        for (const v of [w, -w]) member(at(u, v, railAt(u, v)), at(u, v, hinge), across, 2.0, 2.0);
      }
      member(at(g, -w, hinge), at(g, w, hinge), seaV, 2.4, 2.2);
      member(
        at(-g - CRANE_BACKREACH, 0, hinge),
        at(g + CRANE_OUTREACH, 0, hinge + 2),
        across,
        2.8,
        2.4,
      );
      far += 1;
    }
  }
  console.log(
    `cranes: ${placed.length} of ${cranePoints.length} candidates, ${near} near (168 tris) + ${far} far (72)`,
  );

  /* tanks: the widest silhouettes first, since a tank is a 14 m wall read
   * across its diameter rather than up its height */
  const tanks = [];
  for (const way of infra) {
    const kind = way.tags?.man_made;
    if (kind !== "storage_tank" && kind !== "silo") continue;
    const ring = ringOf(way);
    if (ring.length < 3) continue;
    const centre = centroidOf(ring);
    const d = Math.hypot(centre.x, centre.y);
    if (d > MASS_NEAR || !inside(centre)) continue;
    let radius = 0;
    for (const p of ring) radius = Math.max(radius, Math.hypot(p.x - centre.x, p.y - centre.y));
    if (radius < TANK_MIN_R) continue;
    const tagged = Number.parseFloat(way.tags?.height);
    const height = Number.isFinite(tagged) ? tagged : 12;
    /* a 46 m disc standing 2.7 m tall is 0.5 px of height and 18 px of width:
     * that is a pancake on the ground, the shape round 2 spent its whole
     * budget removing. Tanks below the deck freeboard are not drawn. */
    if (height < TANK_MIN_H) continue;
    /* most of these carry `building` too, from the same LiDAR import. Only the
     * ones over the L2 cut have already been extruded there from their real
     * footprint; drawing those twice is worse than not drawing them here. */
    if (way.tags?.building && height >= MASS_MIN_H) continue;
    tanks.push({ centre, radius, height, d });
  }
  /* rank by the silhouette each one actually presents, not by footprint alone */
  tanks.sort((a, b) => (b.radius * b.height) / b.d ** 2 - (a.radius * a.height) / a.d ** 2);
  const drawnTanks = tanks.slice(0, TANK_MAX);
  /* The one substance in this layer that the height ramp gets wrong. A tank is
   * 6 to 25 m, the same band the container blocks 12 m over the apron occupy,
   * so the ramp paints it VENUE_YARD: a stack of boxes, when the real thing is
   * painted chalky off-white for solar reflectance. One byte per L3 vertex is
   * what separates them. */
  let shellArea = 0;
  let lidArea = 0;
  withMat(MAT_TANK, () => {
    for (const tank of drawnTanks) {
      const ground = clampGround(tank.centre.x, tank.centre.y, MIN_SHORE_H, TANK_MAX_H);
      /* into the lattice, never floating over it */
      const base = footBelow(tank.centre.x, tank.centre.y, ground - 2, tank.radius);
      const top = ground + tank.height;
      const ring = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        ring.push({
          x: tank.centre.x + Math.cos(a) * tank.radius,
          y: tank.centre.y + Math.sin(a) * tank.radius,
        });
      }
      for (let i = 0; i < 8; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % 8];
        const mx = (a.x + b.x) / 2 - tank.centre.x;
        const my = (a.y + b.y) / 2 - tank.centre.y;
        const len = Math.hypot(mx, my) || 1;
        face(
          v3(a.x, base, a.y),
          v3(b.x, base, b.y),
          v3(b.x, top, b.y),
          v3(a.x, top, a.y),
          v3(mx / len, 0, my / len),
        );
        shellArea += Math.hypot(b.x - a.x, b.y - a.y) * (top - base);
      }
      const lid = earcut(ring);
      const rim = ring.map((p) => vertex(p.x, top, p.y, SHADE_FLAT));
      for (let i = 0; i < lid.length; i += 3) {
        triangle(rim[lid[i]], rim[lid[i + 1]], rim[lid[i + 2]]);
      }
      lidArea += 2 * Math.SQRT2 * tank.radius ** 2;
    }
  });
  console.log(
    `tanks: ${drawnTanks.length} of ${tanks.length} inside ${MASS_NEAR} m, ` +
      `${Math.round(shellArea)} m2 of shell over ${Math.round(lidArea)} m2 of lid ` +
      `(${((100 * shellArea) / (shellArea + lidArea)).toFixed(1)} per cent shell)`,
  );

  /* decks: the longest pier lines first, simplified in the same pass the coast
   * uses, drawn as a slab so the pier reads as a structure standing over the
   * water rather than as a line drawn on it */
  const piers = [];
  for (const way of infra) {
    if (way.tags?.man_made !== "pier") continue;
    const line = simplify(way.geometry.map((g) => project(g.lat, g.lon))).filter(inside);
    if (line.length < 2) continue;
    let length = 0;
    for (let i = 0; i < line.length - 1; i++) {
      length += Math.hypot(line[i + 1].x - line[i].x, line[i + 1].y - line[i].y);
    }
    const centre = centroidOf(line);
    if (length < 150 || Math.hypot(centre.x, centre.y) > FADE_START) continue;
    piers.push({ line, length });
  }
  piers.sort((a, b) => b.length - a.length);
  let segments = 0;
  let decks = 0;
  for (const pier of piers) {
    if (segments >= DECK_MAX_SEG) break;
    for (let i = 0; i < pier.line.length - 1 && segments < DECK_MAX_SEG; i++) {
      const a = pier.line[i];
      const b = pier.line[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      /* the slab runs from the waterline up to the deck rather than hovering at
       * deck height: round 2 measured that a face with no contact with the sea
       * reads as a plate laid on top of it (D3). Round 5 puts Belmont Pier back
       * on piles as a hero; every other pier here is a solid wharf anyway. */
      member(
        v3(a.x, DECK_H / 2, a.y),
        v3(b.x, DECK_H / 2, b.y),
        v3(dy / len, 0, -dx / len),
        DECK_W,
        DECK_H,
      );
      segments += 1;
    }
    decks += 1;
  }
  console.log(`decks: ${decks} piers, ${segments} segments of ${piers.length} candidates`);

  /* container blocks: the one invented geometry in the plan, so it is fenced.
   *
   * The doc fences them inside `landuse=industrial` polygons. Measured here,
   * that fence does not exist: of the 158 industrial polygons in the box, one
   * holds a crane and it is the Port of Los Angeles polygon 11 km out; the
   * nearest industrial boundary to the nearest Pier J crane is 1,932 m away.
   * The apron the cranes stand on is simply untagged. So the fence is the real
   * geometry that does exist: a block stands on the landward side of a placed
   * crane, within 450 m of it, clear of the gantry itself, with all four
   * corners on land, on a fixed world grid rather than on a random number. */
  const blocks = [];
  const STEP = 130;
  const APRON = 450;
  for (const crane of placed) {
    if (Math.hypot(crane.x, crane.y) > FADE_START) continue;
    const frame = quayFrame(rings, crane);
    for (let gx = Math.ceil((crane.x - APRON) / STEP) * STEP; gx <= crane.x + APRON; gx += STEP) {
      for (let gy = Math.ceil((crane.y - APRON) / STEP) * STEP; gy <= crane.y + APRON; gy += STEP) {
        const inland = (gx - crane.x) * frame.sea.x + (gy - crane.y) * frame.sea.y;
        const along = Math.hypot(gx - crane.x, gy - crane.y);
        if (inland > -60 || along > APRON) continue;
        if (blocks.some((b) => Math.hypot(b.x - gx, b.y - gy) < STEP * 0.9)) continue;
        const { quay } = quayFrame(rings, { x: gx, y: gy });
        const nx = -quay.y;
        const ny = quay.x;
        let ok = true;
        for (const su of [-1, 1]) {
          for (const sv of [-1, 1]) {
            const cx = gx + quay.x * su * 35 + nx * sv * 16;
            const cy = gy + quay.y * su * 35 + ny * sv * 16;
            if (!insideLand(boxes, cx, cy)) ok = false;
          }
        }
        if (!ok) continue;
        blocks.push({ x: gx, y: gy, quay, d: Math.hypot(gx, gy) });
      }
    }
  }
  blocks.sort((a, b) => a.d - b.d);
  const drawnBlocks = blocks.slice(0, BLOCK_MAX);
  for (const block of drawnBlocks) {
    const base = footBelow(
      block.x,
      block.y,
      clampGround(block.x, block.y, MIN_SHORE_H, DECK_MAX_H) - 1,
      36,
    );
    member(
      v3(block.x - block.quay.x * 35, base + BLOCK_H / 2, block.y - block.quay.y * 35),
      v3(block.x + block.quay.x * 35, base + BLOCK_H / 2, block.y + block.quay.y * 35),
      v3(-block.quay.y, 0, block.quay.x),
      32,
      BLOCK_H,
    );
  }
  console.log(`container blocks: ${drawnBlocks.length} of ${blocks.length} apron sites`);
  console.log(
    `feet: ${footSnaps} assemblies snapped down onto the L1 lattice, ` +
      `${perFootDrops} crane legs grown down onto the L1 surface under their own footprint`,
  );
}

/* --------------------------------------------------- L4, hero landmarks */

/**
 * The ground a hero stands on: the drawn L1 surface under it, `fallback` where
 * L1 draws nothing there (open water, where the Queen Mary floats and the
 * bridge towers stand in the channel), and never above `cap`.
 *
 * The cap is what keeps a landmark's rendered height honest. L1's relief is a
 * 64 m DEM and the harbour is full of spikes it cannot resolve (design doc 4.1:
 * -361 m at the Queen Mary berth, +85 m on the Pier G wharf, +153 m over Island
 * Grissom). Taking the surface as the datum lets one bad sample add twenty
 * metres to a sourced dimension. Taking the lower of the two instead can only
 * ever bury a hero, which is invisible; the other direction is a tower that
 * exceeds its own published height, which the dimension policy forbids.
 */
function heroGround(x, y, fallback, cap) {
  const h = terrainHeightAt(x, y);
  return Math.min(h === null ? fallback : h, cap);
}

/** Nearest point on a closed ring's boundary to `p`, with the inward unit
 * normal of the segment it landed on. `inside` is the even-odd crossing test, so
 * the pair together is a signed distance to the boundary. */
function nearestOnRing(ring, p) {
  let best = Infinity;
  let point = ring[0];
  let normal = { x: 0, y: 0 };
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) continue;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const qx = a.x + dx * t;
    const qy = a.y + dy * t;
    const dist = Math.hypot(p.x - qx, p.y - qy);
    if (dist < best) {
      best = dist;
      point = { x: qx, y: qy };
      /* CCW ring: the inward normal of an edge is its left normal */
      const len = Math.sqrt(len2);
      normal = { x: -dy / len, y: dx / len };
    }
  }
  return { point, normal, dist: best, inside };
}

/**
 * Polygon offset along the vertex bisector, positive inward, negative outward.
 *
 * Radial shrink toward a centroid was the other candidate and it collapses the
 * narrow end of an elongated island; the bisector keeps a constant standoff from
 * every edge, which is what a rock rim actually is. The step is capped at 3d so
 * a sharp corner cannot throw a spike, and the whole offset backs off by half if
 * it eats the ring.
 *
 * ROUND-1 FIX (round-0 residual 8, catalogue 6.2 and 6.1). The bisector is a
 * LOCAL construction: it only knows the two edges meeting at its own vertex. On
 * an irregular outline that is not enough. Where the ring turns through nearly
 * 180 degrees the bisector is nearly degenerate, `2d / |b|^2` blows up and the
 * 3d cap lets the vertex travel up to three times the offset in a direction that
 * has almost nothing to do with "inward"; where the outline is locally concave
 * the offset can cross the far side of a neck. Both put a vertex OUTSIDE the
 * source ring. Measured at old HEAD, the planting ring's maximum radius EQUALLED
 * the rock rim's on all four islands (187.0 / 227.1 / 206.1 / 215.2 m), i.e. the
 * 18 m rim had zero width where it was worst, and after round 0 that still held
 * on Freeman.
 *
 * The fix is not a per-island tune and it is not a bigger cap. The bisector now
 * only supplies a DIRECTION; how far to travel along it is decided by measuring
 * against the WHOLE source ring. The ray from the source vertex is sampled at
 * ISLE_OFFSET_PROBES points and the one kept is the sample that maximises
 * `min(distance to the ring, |d|)` on the side the sign of `d` asks for, with
 * ties going to the shortest travel (the loop replaces only on a strictly
 * better score, so the first, nearest sample wins a tie and the ring is never
 * over-inset). Where the island is locally wider than 2|d|
 * that lands on exactly the asked offset, which is what the bisector gave
 * before. Where it is not, it lands on the deepest point the ray can reach
 * instead of crossing to the far side, and it can never leave the ring, because
 * every candidate is tested for containment rather than assumed to be contained.
 *
 * The guarantee is therefore a property of the ring, not of the corner: no
 * returned vertex is on the wrong side of the source, and the standoff is the
 * largest the local geometry allows up to the one that was asked for. A vertex
 * whose ray cannot get anywhere stays where it started, on the boundary, which
 * pinches the offset ring rather than everting it.
 */
function insetPoly(ring, distance) {
  const target = signedArea(ring);
  const sign = distance < 0 ? -1 : 1;
  for (let attempt = 0, d = distance; attempt < 4; attempt++, d /= 2) {
    const n = ring.length;
    const out = [];
    let ok = true;
    for (let i = 0; i < n; i++) {
      const p = ring[i];
      const a = ring[(i - 1 + n) % n];
      const b = ring[(i + 1) % n];
      /* CCW ring: the inward normal of an edge is its left normal */
      const inward = (from, to) => {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        return { x: -dy / len, y: dx / len };
      };
      const n1 = inward(a, p);
      const n2 = inward(p, b);
      const bx = n1.x + n2.x;
      const by = n1.y + n2.y;
      const len2 = bx * bx + by * by;
      let q;
      if (len2 < 1e-9) {
        q = { x: p.x, y: p.y };
      } else {
        /* offset along the bisector by d / cos(half angle) */
        let step = (2 * d) / len2;
        const reach = Math.abs(step) * Math.hypot(bx, by);
        if (reach > 3 * Math.abs(d)) step *= (3 * Math.abs(d)) / reach;
        q = { x: p.x + bx * step, y: p.y + by * step };
      }
      /* how far along that ray to actually go, measured against the whole ring */
      const want = Math.abs(d);
      const rayX = q.x - p.x;
      const rayY = q.y - p.y;
      let bestU = 0;
      let bestScore = -1;
      for (let s = 1; s <= ISLE_OFFSET_PROBES; s++) {
        const u = s / ISLE_OFFSET_PROBES;
        const c = { x: p.x + rayX * u, y: p.y + rayY * u };
        const near = nearestOnRing(ring, c);
        if ((sign > 0) !== near.inside) continue;
        const score = Math.min(near.dist, want);
        if (score > bestScore + 1e-9) {
          bestScore = score;
          bestU = u;
        }
      }
      out.push({ x: p.x + rayX * bestU, y: p.y + rayY * bestU });
    }
    const area = signedArea(out);
    const grew = sign < 0;
    if (!(grew ? area > target : area > 0.25 * target)) ok = false;
    for (const p of out) if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) ok = false;
    if (ok) return out;
  }
  return null;
}

/** One quad with its geometric normal, flipped to agree with `hint` so a face
 * always looks the way it is meant to be lit. */
function quadTo(p0, p1, p2, p3, hint) {
  let normal = norm3(cross3(sub3(p1, p0), sub3(p3, p0)));
  if (dot3(normal, hint) < 0) normal = mul3(normal, -1);
  face(p0, p1, p2, p3, normal);
}

/** The longest chord of a ring, as a unit direction. A ship, a bridge and an
 * island all have one axis that matters and no tag carries it. */
function longAxis(ring) {
  let best = { x: 1, y: 0 };
  let longest = 0;
  for (let i = 0; i < ring.length; i++) {
    for (let j = i + 1; j < ring.length; j++) {
      const dx = ring[j].x - ring[i].x;
      const dy = ring[j].y - ring[i].y;
      const len = Math.hypot(dx, dy);
      if (len > longest) {
        longest = len;
        best = { x: dx / len, y: dy / len };
      }
    }
  }
  return { axis: best, length: longest };
}

/** Area centroid, not the vertex mean: an OSM ring puts most of its vertices
 * where the surveyor found detail, and the mean drifts toward that end. */
function areaCentre(ring) {
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const cross = p.x * q.y - q.x * p.y;
    a2 += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a2) < 1e-6) return centroidOf(ring);
  return { x: cx / (3 * a2), y: cy / (3 * a2) };
}

/**
 * One THUMS island, rebuilt in round 1 (catalogue 6.1 to 6.6) from the committed
 * lidar and NAIP products rather than from constants.
 *
 * What the round-5 version drew, and why every part of it is gone:
 *
 *   - The planting was ONE extruded ring prism with a flat earcut lid plus three
 *     boxes: four vegetation objects for an island the lidar counts 212 to 314
 *     measured crowns on. The owner's word for the result was that nothing in
 *     real life looks close to it. Now every crown in trees.json is drawn at its
 *     own measured position, with its own measured height and crown radius.
 *   - Four towers per island, sixteen across the venue, on an invented height
 *     ladder [52.6, 41, 34, 30]. The lidar finds exactly three structures over
 *     40 m in the whole group, one each on White, Grissom and Chaffee, and none
 *     on Freeman, which is also what OSM carries. Now: three, at their measured
 *     footprints and heights.
 *   - Four flat 30 x 13 m slabs per island for the sculpted screen walls. Now
 *     every masses.json structure with a footprint is drawn where the lidar
 *     found it, at its measured extent and height.
 *   - A two-quad rim ribbon 18 m wide with a 1.07 m lip and a vertical outer
 *     wall, i.e. a plateau. Now the rim is swept from the island's OWN binned
 *     shoreline profile: toe, waterline, mid batter, crown and the return to the
 *     deck, each at its measured distance and its measured height, with the
 *     crown broken by the spread the same bins measure.
 *
 * The deck under the planting is new geometry, and it is a consequence rather
 * than a choice: with the planting drawn as individual crowns there is nothing
 * left to cap the island with. It takes its own substance because NAIP measures
 * it at rgb(129,127,113), which is neither the rim's rock nor the port apron.
 *
 * Datum, stated because it is the one place the render does not follow the
 * measurement. The island deck stands at the DEM's MIN_SHORE_H floor, 6 m, while
 * the lidar measures 4.13 to 4.25 m of freeboard from its own water plane
 * (sea-level.json, 0.67 m) to the deck. The batter's measured SHAPE is drawn in
 * true metres, so the profile's toe lands about 2 m above this scene's sea, and
 * a skirt carries the rock from there down through the waterline. Re-datuming
 * the island deck onto sea-level.json would move L1's cap under it too and is
 * not a round-1 change.
 */
function buildIsland(spec) {
  const raw = spec.ring;
  const centre = areaCentre(raw);
  const deck = heroGround(centre.x, centre.y, MIN_SHORE_H, ISLE_DECK_MAX);
  /* the hero deck stands clear of L1's own cap on the same island */
  const deckY = deck + ISLE_DECK_LIFT;
  const before = current.indices.length;
  const log = { rim: 0, crowns: 0, outside: 0, towers: 0, screens: 0, clumps: 0 };

  /* ------------------------------------------------------------- the rim */

  const rows = rimProfile(spec.shoreline, deckY);
  const base = resampleRing(raw, ISLE_RIM_STEP);
  const n = base.length;
  const rings = rows.map((r) => (r.d === 0 ? base.map((p) => ({ x: p.x, y: p.y })) : insetPoly(base, r.d)));
  if (rings.some((r) => !r)) return 0;

  /* Break the rim. The armour is placed 5-ton block, not a poured ribbon, and
   * the lidar measures the scatter directly: the crown bin's own z10-to-z90
   * spread is 1.45 to 1.96 m across the four islands, so half of it is the
   * amplitude a stone stands proud of its neighbour. The hash is the same
   * position hash the cranes jitter on, so a rebake reproduces every stone. */
  const jag = rings.map((ring, j) =>
    ring.map((p, i) => {
      if (rows[j].jag === 0) return { x: p.x, y: p.y, h: rows[j].y };
      const s = base[i];
      /* the row index enters the hash. Sharing one draw per ring vertex across
       * the profile rows moves a whole column up or down together and scallops
       * the batter into a smooth wave; giving every (vertex, row) its own draw
       * breaks the surface, which is what placed block does. */
      const a = (hash01(s.x * 7 + j * 131, s.y * 7 - j * 57) - 0.5) * 2;
      const b = (hash01(s.x + j * 311, s.y - j * 173) - 0.5) * 2;
      /* radial nudge along the vertex's own inward direction, so a stone
       * pushes out of the face rather than sliding along it */
      const inX = p.x - s.x;
      const inY = p.y - s.y;
      const len = Math.hypot(inX, inY) || 1;
      const push = b * rows[j].jag * 0.8;
      return {
        x: p.x - (inX / len) * push,
        y: p.y - (inY / len) * push,
        h: rows[j].y + a * rows[j].jag,
      };
    }),
  );

  withMat(MAT_ROCK, () => {
    for (let j = 0; j < jag.length - 1; j++) {
      const lo = jag[j];
      const hi = jag[j + 1];
      for (let i = 0; i < n; i++) {
        const k = (i + 1) % n;
        /* outward hint: away from the island centre, which is what every face
         * of a rim is, batter and crown alike */
        const hint = norm3(v3(lo[i].x - centre.x, 0.35, lo[i].y - centre.y));
        quadTo(
          v3(lo[i].x, lo[i].h, lo[i].y),
          v3(lo[k].x, lo[k].h, lo[k].y),
          v3(hi[k].x, hi[k].h, hi[k].y),
          v3(hi[i].x, hi[i].h, hi[i].y),
          hint,
        );
        log.rim++;
      }
    }
  });

  /* ------------------------------------------------------------ the deck */

  const deckRing = jag[jag.length - 1];
  withMat(MAT_DECK, () => {
    const flat = deckRing.map((p) => ({ x: p.x, y: p.y }));
    const cap = earcut(flat);
    const top = flat.map((p) => vertex(p.x, deckY, p.y, SHADE_FLAT));
    for (let i = 0; i < cap.length; i += 3) {
      triangle(top[cap[i]], top[cap[i + 1]], top[cap[i + 2]]);
    }
  });

  /* Where anything standing on this island has its feet. Inboard of the rim's
   * inner edge that is the deck; on the rim it is the profile's own height at
   * that distance, so a crown on the armour sits on the armour. */
  const seat = (x, y) => {
    const near = nearestOnRing(raw, { x, y });
    const d = near.inside ? near.dist : -near.dist;
    const last = rows[rows.length - 1];
    if (d >= last.d) return deckY;
    for (let j = rows.length - 1; j > 0; j--) {
      const hi = rows[j];
      const lo = rows[j - 1];
      if (d >= lo.d && hi.d > lo.d) {
        const t = (d - lo.d) / (hi.d - lo.d);
        return lo.y + (hi.y - lo.y) * t;
      }
    }
    return rows[0].y;
  };

  /* --------------------------------------------------------- the planting */

  const crowns = spec.crowns ?? [];
  withMat(MAT_VEG, () => {
    for (const [cx, cy, height, radius] of crowns) {
      if (!nearestOnRing(raw, { x: cx, y: cy }).inside) {
        log.outside++;
        continue;
      }
      buildCrown(cx, cy, seat(cx, cy), height, radius);
      log.crowns++;
    }
  });

  /* ----------------------------------------------- towers, screens, masts */

  const { axis } = longAxis(raw);
  for (const m of spec.masses ?? []) {
    const foot = seat(m.x, m.y);
    if (m.top >= ISLE_TOWER_MIN_TOP) {
      buildScreenTower(m, foot, axis);
      log.towers++;
    } else if (m.footprintM2 >= ISLE_SCREEN_MIN_FOOT) {
      buildScreenWall(m, foot);
      log.screens++;
    } else {
      /* Under 20 m2 the lidar has stopped resolving a structure. masses.json is
       * eight-connected CHM cells over 20 m and nothing more, and at a 3 x 3 to
       * 5 x 4 m plan that is equally a vent stack and a clump of tall palms:
       * neither the product nor any source in the catalogue separates them.
       * What IS known is that trees.json deliberately REMOVED every crown
       * standing inside one of these components (283 -> 250 crowns on White,
       * 357 -> 314 on Grissom, 229 -> 212 on Chaffee, 328 -> 303 on Freeman),
       * so drawing nothing here leaves a hole the planting was cut out of, and
       * the reference puts "more than 300 palms, roughly one palm per well" on
       * each island [P1b]. They go back as planting at their own measured
       * height, with a radius from their own measured footprint. Round 1 drew
       * them as dark steel first and it read as a forest of black towers over
       * the canopy, which is a claim about an industrial structure that no
       * source makes; this is the smaller claim. Two of the 59 stand at 34.65
       * and 33.82 m, well over the 20.18 m tallest measured crown, and they are
       * the two most likely to really be masts. */
      withMat(MAT_VEG, () => {
        buildCrown(m.x, m.y, foot, m.top, Math.sqrt(m.footprintM2 / Math.PI));
      });
      log.clumps++;
    }
  }

  console.log(
    `  island ${spec.name}: ${n} rim facets x ${rows.length - 1} bands, ` +
      `${log.crowns} crowns (${log.outside} outside the ring dropped), ` +
      `${log.towers} tower, ${log.screens} screen walls, ${log.clumps} mass clumps`,
  );
  return (current.indices.length - before) / 3;
}

/**
 * The rim's cross-section, outboard to inboard, as [{ d, y, jag }] where `d` is
 * the signed distance from the island's own OSM ring (negative outboard) and `y`
 * is a world height.
 *
 * With shoreline.json this is measurement: the product bins class 2 and 20
 * ground z by that same signed distance, so the toe, the waterline, the mid
 * batter, the crown and the return to the deck are read straight out of it and
 * the batter angle is whatever the bins say it is (17.0 to 23.2 degrees across
 * the four islands). Heights are taken RELATIVE to the product's own deck median
 * so the lidar's vertical datum never has to agree with the DEM's.
 *
 * Without it, the round-0 constants draw the two-quad ribbon they were measured
 * for, and nothing is invented to fill the gap.
 */
function rimProfile(sh, deckY) {
  if (!sh) {
    return [
      { d: ISLE_RIM_INSET, y: deckY - 2.9, jag: 0 },
      { d: ISLE_RIM_INSET, y: deckY + ISLE_RIM_LIP, jag: 0 },
      { d: ISLE_RIM_INSET + ISLE_RIM_W, y: deckY, jag: 0 },
    ];
  }
  const bins = sh.profile;
  const zAt = (d) => {
    let best = bins[0];
    for (const b of bins) {
      if (Math.abs(b.distanceM - d) < Math.abs(best.distanceM - d)) best = b;
    }
    return best.z50 - sh.deckZ;
  };
  /* the most outboard bin still against the island, not a stray 40 m out */
  const toe = bins.filter((b) => b.distanceM >= -6 && b.distanceM <= 0)[0] ?? bins[0];
  const toeD = toe.distanceM;
  const crown = sh.crownAtM;
  /* where the profile is back on the deck, inboard of the crown. The strict
   * `>` means the return is the first bin PAST the crown at deck height; on
   * this venue's data every island resolves one (Grissom's at 10, one bin past
   * its crown at 9), so the ISLE_RIM_W fallback below never fires here. */
  const back = bins.find((b) => b.distanceM > crown && b.z50 <= sh.deckZ + 0.15);
  const deckAt = back ? back.distanceM : crown + ISLE_RIM_W;
  const mid = Math.round((toeD + crown) / 2);
  const crownBin = bins.find((b) => b.distanceM === crown);
  const spread = crownBin ? (crownBin.z90 - crownBin.z10) / 2 : 0.5;
  const jag = Math.min(1.2, Math.max(0.3, spread));
  /* Below the product's last usable bin the batter is CONTINUED at this island's
   * own measured slope until it reaches this scene's sea, and only then dropped
   * vertically out of sight. The bins stop where they do because deeper water
   * returns no ground, not because the rock stops; a vertical wall there is the
   * "plate laid on the sea" the catalogue names, and the slope is measured.
   *
   * It costs footprint, and the number is stated rather than buried. The lidar
   * puts 4.13 to 4.25 m between its own water plane and the island deck, this
   * scene puts the deck on the DEM's 6 m floor, so the toe has about 2.2 m
   * further to fall here than it does in Long Beach, and at ratios of 2.34 to
   * 3.27 that is 5.5 to 7.4 m of extra run. Each island therefore reaches 9 to
   * 12 m further out than its OSM ring, against radii of 153 to 190 m. */
  const toeY = deckY + zAt(toeD);
  const seaAt = toeD - Math.max(0, toeY) * sh.batter.ratio;
  const rows = [
    { d: seaAt, y: -2, jag: 0 },
    { d: seaAt, y: 0, jag: jag * 0.5 },
    { d: toeD, y: toeY, jag: jag * 0.7 },
    { d: 0, y: deckY + zAt(0), jag },
    { d: mid, y: deckY + zAt(mid), jag },
    { d: crown, y: deckY + sh.lipM, jag },
    { d: deckAt, y: deckY, jag: 0 },
  ];
  /* the sweep needs the distances non-decreasing; a 1 m bin grid can put mid on
   * the waterline when the crown is close in. NOTE: this compares against the
   * ORIGINAL predecessor, not the last kept row, so two consecutive inversions
   * could slip a decreasing pair through; all four islands in this venue's data
   * yield strictly non-decreasing rows, so the case is unreachable here. */
  return rows.filter((r, i) => i === 0 || r.d >= rows[i - 1].d);
}

/**
 * One measured tree crown: a spindle from the ground through a serrated ring at
 * the crown's own radius to a point at its own height.
 *
 * trees.json carries a position, a height above local ground and a crown radius
 * per crown and nothing else, so the form has to come from somewhere and this is
 * where the round is honest about it: the SHAPE is a reading of the reference
 * ("tall palms over massed bushes", palm/oleander/sandalwood/fig/acacia [P1b]),
 * driven entirely by the one measured quantity that separates the two, the
 * height-to-radius ratio. A ratio of 1.5 puts the widest part at 42 per cent of
 * the height, which is a shrub; 6.5 puts it at 80 per cent, which is a palm.
 * There is no threshold and no category: the ratio moves the ring continuously.
 *
 * The serration is worth its four bytes. The asset quantises x and z to 1 m and
 * y to 0.1 m, so a 2.2 m median crown radius is two cells across the lattice and
 * anything carved in plan collapses; alternating the ring's HEIGHT keeps the
 * silhouette broken at ten times the resolution.
 */
function buildCrown(cx, cy, ground, height, radius) {
  const r = Math.max(1, radius);
  const ratio = height / Math.max(radius, 0.1);
  const f =
    0.42 +
    0.38 *
      Math.min(1, Math.max(0, (ratio - ISLE_CROWN_NECK_LOW) / ISLE_CROWN_NECK_SPAN));
  const neck = ground + height * f;
  const top = ground + height;
  const serrate = Math.min(0.35 * r, 0.12 * height);
  const ring = [];
  for (let i = 0; i < ISLE_CROWN_RING; i++) {
    const a = (i / ISLE_CROWN_RING) * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const h = neck + (i % 2 === 0 ? serrate : -serrate);
    const nrm = norm3(v3(Math.cos(a), 0.45, Math.sin(a)));
    ring.push(vertex(x, h, y, shadeOf(nrm.x, nrm.h, nrm.y)));
  }
  const apex = vertex(cx, top, cy, shadeOf(0, 1, 0));
  const foot = vertex(cx, ground, cy, shadeOf(0, -1, 0));
  for (let i = 0; i < ISLE_CROWN_RING; i++) {
    const k = (i + 1) % ISLE_CROWN_RING;
    triangle(ring[i], ring[k], apex);
    triangle(ring[k], ring[i], foot);
  }
}

/**
 * A camouflage tower: one of the three masses.json structures over 40 m.
 *
 * Footprint, height and position are measured. Two things are not, and both are
 * flagged: the taper, from the Five Star cover photograph's "one tapered cream
 * tower", and the blue panels, which the sources put "up the sides" [P1d] and
 * describe as "large royal-blue rectangular panels" without ever giving a count.
 * Two crossed slabs put one panel on each face, which is the smallest claim that
 * can be made and still leave the facade something to read at 60 m. The
 * catalogue's instruction not to invent a panel COUNT is why there is exactly
 * one per face rather than a rhythm of them.
 */
function buildScreenTower(m, foot, axis) {
  const w = Math.max(4, m.widthM);
  const d = Math.max(4, m.depthM);
  const top = foot + m.top;
  const across = v3(axis.x, 0, axis.y);
  withMat(MAT_SCREEN, () => {
    member(
      v3(m.x, foot - 1, m.y),
      v3(m.x, top, m.y),
      across,
      w,
      d,
      w * ISLE_TOWER_TAPER,
      d * ISLE_TOWER_TAPER,
    );
  });
  withMat(MAT_PANEL, () => {
    const lo = foot + m.top * 0.12;
    const hi = foot + m.top * 0.9;
    /* 1 m proud of each face: the asset's positions are 1 m in x and z, so a
     * panel that stands off by less than that does not exist in the file */
    member(v3(m.x, lo, m.y), v3(m.x, hi, m.y), across, w * 0.55, d + 2);
    member(v3(m.x, lo, m.y), v3(m.x, hi, m.y), across, w + 2, d * 0.55);
  });
}

/**
 * One sculpted screen wall: a masses.json structure under 40 m with a footprint
 * of at least 20 m2.
 *
 * Position, LENGTH and height are measured. Thickness is not, and cannot be: a
 * canopy height model is a top-down surface, so the plan bbox of a connected
 * component is what the thing SHADOWS, not its section, and filling that bbox
 * with a solid turns a 15 x 16 m component into a building. Round 1 drew it
 * that way first and the islands came back as a cream skyline. A wall gets the
 * thinnest section the asset's 1 m position lattice can carry instead, and its
 * length off the component's long axis.
 *
 * The bow is not measured either: the sources describe walls of "smooth,
 * futuristic concrete, some curving inward, some curving outward" [P1d] with no
 * radius anywhere, so the sagitta is a fraction of the wall's own measured
 * length and the SIGN comes off the position hash, so some curve in and some
 * curve out, and a rebake gets the same ones.
 */
function buildScreenWall(m, foot) {
  const long = m.widthM >= m.depthM;
  const len = Math.max(4, Math.max(m.widthM, m.depthM));
  const thick = ISLE_SCREEN_THICK;
  const top = foot + m.top;
  const dir = long ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const nrm = { x: -dir.y, y: dir.x };
  const bow = ISLE_SCREEN_BOW * len * (hash01(m.x, m.y) < 0.5 ? -1 : 1);
  const segs = 4;
  const at = (t) => {
    const s = (t - 0.5) * len;
    /* a parabola through the two ends with `bow` of sagitta at the middle */
    const off = bow * (1 - 4 * (t - 0.5) * (t - 0.5));
    return { x: m.x + dir.x * s + nrm.x * off, y: m.y + dir.y * s + nrm.y * off };
  };
  withMat(MAT_SCREEN, () => {
    for (let k = 0; k < segs; k++) {
      const a = at(k / segs);
      const b = at((k + 1) / segs);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      member(
        v3(mx, foot - 1, my),
        v3(mx, top, my),
        v3(dx / l, 0, dy / l),
        l * 1.08,
        thick,
      );
    }
  });
}

/** The Queen Mary: a hull from her own OSM outline, two tiers of upperworks and
 * three funnels. 310.7 m LOA and 55.2 m to the funnel tops (Wikipedia); the
 * OSM way carries `height=10`, the hull to the promenade deck, and round 0
 * measures that band from the ground under her berth rather than from world
 * zero so the black is above the terrain instead of inside it. */
function buildQueenMary(way) {
  if (!way) return 0;
  const before = current.indices.length;
  const full = ringOf(way);
  if (signedArea(full) < 0) full.reverse();
  const hull = reduceRing(full, 16);
  const centre = areaCentre(hull);
  const { axis, length } = longAxis(hull);
  const u = v3(axis.x, 0, axis.y);
  let beam = 0;
  for (const p of hull) {
    beam = Math.max(beam, Math.abs((p.x - centre.x) * -axis.y + (p.y - centre.y) * axis.x) * 2);
  }
  /* The datum the hull band is measured from: the HIGHEST ground L1 puts under
   * her own outline, not the centroid's. The berth runs 6.0 to 12.0 m across
   * her sixteen hull vertices, so anything lower leaves the black buried on the
   * side the terrain is tallest, which is the defect catalogue 7.1 names. */
  const berth = Math.max(...hull.map((p) => heroGround(p.x, p.y, MIN_SHORE_H, DECK_MAX_H)));
  const hullTop = berth + QM_HULL_TOP;
  const hullBottom = berth + QM_HULL_BOTTOM;
  console.log(
    `queen mary datum: berth ground ${berth.toFixed(1)} m, black hull ${hullBottom.toFixed(1)} to ${hullTop.toFixed(1)} m`,
  );
  withMat(MAT_DARK, () => {
    const n = hull.length;
    for (let i = 0; i < n; i++) {
      const a = hull[i];
      const b = hull[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      face(
        v3(a.x, hullBottom, a.y),
        v3(b.x, hullBottom, b.y),
        v3(b.x, hullTop, b.y),
        v3(a.x, hullTop, a.y),
        v3(dy / len, 0, -dx / len),
      );
    }
  });
  withMat(MAT_PALE, () => {
    const cap = earcut(hull);
    const deck = hull.map((p) => vertex(p.x, hullTop, p.y, SHADE_FLAT));
    for (let i = 0; i < cap.length; i += 3) {
      triangle(deck[cap[i]], deck[cap[i + 1]], deck[cap[i + 2]]);
    }
    const along = (t, h) => v3(centre.x + axis.x * t, h, centre.y + axis.y * t);
    /* member() centres its prism on the a-b line, so the line runs at the
     * middle of each tier and `wide` is the tier's height */
    const tier = (from, to, half, width) =>
      member(
        along(-half, (from + to) / 2),
        along(half, (from + to) / 2),
        v3(0, 1, 0),
        to - from,
        width,
      );
    tier(hullTop, QM_DECK1, length * 0.31, beam * 0.72);
    tier(QM_DECK1, QM_DECK2, length * 0.22, beam * 0.5);
  });
  withMat(MAT_ACCENT, () => {
    /* +/- 0.12 of 310.7 m is 37 m of spacing, which is what the three funnels
     * actually stand at. At 0.08 they were 25 m apart and 14 m wide, so at
     * 3.4 km they merged into one 4 px red mark instead of three. */
    for (const t of [-0.12, 0, 0.12]) {
      const p = { x: centre.x + axis.x * t * length, y: centre.y + axis.y * t * length };
      member(
        v3(p.x, QM_DECK2 - 1, p.y),
        v3(p.x, QM_FUNNEL_TOP, p.y),
        u,
        14,
        10,
        12,
        9,
      );
    }
  });
  return (current.indices.length - before) / 3;
}

/** The Long Beach International Gateway: two 157 m towers over a 305 m main
 * span with the deck 62 m over the channel (Wikipedia). The approach ramps run
 * out to where L1 has ground under them, so no part of the deck ends in the
 * air; the stay cables are one tapered wedge per fan, never strands, because a
 * single stay at 6.6 km is 0.005 px of width. */
function buildGateway(way) {
  if (!way) return 0;
  const before = current.indices.length;
  const outline = ringOf(way);
  const centre = areaCentre(outline);
  const { axis } = longAxis(outline);
  const u = v3(axis.x, 0, axis.y);
  const at = (t) => ({ x: centre.x + axis.x * t, y: centre.y + axis.y * t });
  const RAMP = 900;
  const deckAt = (t) => {
    const p = at(t);
    const ground = heroGround(p.x, p.y, 0, DECK_MAX_H);
    const arch = GATEWAY_DECK_H * (1 - Math.pow(Math.min(Math.abs(t) / RAMP, 1), 1.7));
    return Math.max(arch, ground + 4);
  };
  withMat(MAT_PALE, () => {
    const SEGMENTS = 10;
    for (let i = 0; i < SEGMENTS; i++) {
      const t0 = -RAMP + (2 * RAMP * i) / SEGMENTS;
      const t1 = -RAMP + (2 * RAMP * (i + 1)) / SEGMENTS;
      const a = at(t0);
      const b = at(t1);
      member(
        v3(a.x, deckAt(t0), a.y),
        v3(b.x, deckAt(t1), b.y),
        v3(0, 1, 0),
        6,
        GATEWAY_DECK_W,
      );
    }
    for (const side of [-1, 1]) {
      const t = (side * GATEWAY_SPAN) / 2;
      const p = at(t);
      const foot = heroGround(p.x, p.y, 0, DECK_MAX_H) - 1;
      const deck = deckAt(t);
      member(v3(p.x, foot, p.y), v3(p.x, deck, p.y), u, 13, 13, 11, 11);
      member(v3(p.x, deck, p.y), v3(p.x, GATEWAY_TOWER_H, p.y), u, 11, 11, 6, 6);
      /* one wedge per stay fan: 1.2 m at the tower head, opening to 110 m at
       * the deck IN THE SPAN'S VERTICAL PLANE (wideB rides l1, which lies in
       * that plane; the cross-deck l2 thickness stays 1.2 m), so the fan reads
       * from every heading without growing sideways sails off a 30 m deck */
      for (const dir of [-1, 1]) {
        const anchor = at(t + dir * 120);
        member(
          v3(p.x, GATEWAY_TOWER_H - 6, p.y),
          v3(anchor.x, deckAt(t + dir * 120) + 2, anchor.y),
          v3(0, 1, 0),
          1.2,
          1.2,
          110,
          1.2,
        );
      }
    }
  });
  return (current.indices.length - before) / 3;
}

/** The Spruce Goose dome: 122 m clear span, 35 m high (Structurae), as a
 * 12-segment cap on the real footprint of OSM way 721199801.
 *
 * OSM's own LiDAR tags on the parent relation read `height=39.4`, `ele=44.0`.
 * The lower Structurae figure is the one drawn, so nothing here exceeds a
 * source; both are recorded in provenance. */
function buildDome(way) {
  if (!way) return 0;
  const before = current.indices.length;
  const c = areaCentre(ringOf(way));
  const ground = heroGround(c.x, c.y, MIN_SHORE_H, DECK_MAX_H);
  const RINGS = 3;
  withMat(MAT_WHITE, () => {
    for (let r = 0; r < RINGS; r++) {
      const t0 = r / RINGS;
      const t1 = (r + 1) / RINGS;
      /* a spherical cap: radius falls as cos, height rises as sin */
      const r0 = DOME_R * Math.cos((t0 * Math.PI) / 2);
      const r1 = DOME_R * Math.cos((t1 * Math.PI) / 2);
      const h0 = ground + DOME_H * Math.sin((t0 * Math.PI) / 2);
      const h1 = ground + DOME_H * Math.sin((t1 * Math.PI) / 2);
      for (let i = 0; i < DOME_SEGMENTS; i++) {
        const a0 = (i / DOME_SEGMENTS) * Math.PI * 2;
        const a1 = ((i + 1) / DOME_SEGMENTS) * Math.PI * 2;
        const p = (radius, angle, h) =>
          v3(c.x + Math.cos(angle) * radius, h, c.y + Math.sin(angle) * radius);
        if (r1 === 0 || r === RINGS - 1) {
          const shade = shadeOf(Math.cos((a0 + a1) / 2) * 0.4, 1, Math.sin((a0 + a1) / 2) * 0.4);
          triangle(
            vertex(c.x + Math.cos(a0) * r0, h0, c.y + Math.sin(a0) * r0, shade),
            vertex(c.x + Math.cos(a1) * r0, h0, c.y + Math.sin(a1) * r0, shade),
            vertex(c.x, ground + DOME_H, c.y, shade),
          );
          continue;
        }
        const mid = (a0 + a1) / 2;
        quadTo(
          p(r0, a0, h0),
          p(r0, a1, h0),
          p(r1, a1, h1),
          p(r1, a0, h1),
          norm3(v3(Math.cos(mid) * (DOME_H / DOME_R), 1, Math.sin(mid) * (DOME_H / DOME_R))),
        );
      }
    }
  });
  return (current.indices.length - before) / 3;
}

/** The Long Beach Light, the "Robot Light": a block on columns standing in the
 * water at the harbour entrance. OSM node 566859523 carries `height=13`, which
 * is the figure used; design doc 1.2's 15 m was an estimate. It is the only
 * vertical inside 10 km on heading 0. */
function buildRobotLight(node) {
  if (!node) return 0;
  const before = current.indices.length;
  const p = project(node.lat, node.lon);
  const height = Number.parseFloat(node.tags?.height);
  const top = Number.isFinite(height) ? height : ROBOT_H;
  /* the light stands on a caisson at the harbour entrance, not on a hill: L1
   * puts one 24 m relief spike under this exact point (a 64 m DEM sample of
   * the breakwater head), and the cap is what keeps the light off it */
  const ground = heroGround(p.x, p.y, 0, MIN_SHORE_H);
  withMat(MAT_WHITE, () => {
    /* the columns are 0.15 px of width at 3.6 km, so the stand is one block:
     * what survives at this range is a pale vertical over the breakwater line */
    member(v3(p.x, ground - 1, p.y), v3(p.x, ground + top * 0.55, p.y), v3(1, 0, 0), 9, 9);
    member(
      v3(p.x, ground + top * 0.55, p.y),
      v3(p.x, ground + top, p.y),
      v3(1, 0, 0),
      13,
      11,
    );
  });
  return (current.indices.length - before) / 3;
}

/** Lions Lighthouse: OSM way 1054968664, `height=20`, a slim tapered tower
 * inside the downtown cluster. */
function buildLionsLighthouse(way) {
  if (!way) return 0;
  const before = current.indices.length;
  const ring = ringOf(way);
  const c = areaCentre(ring);
  const height = Number.parseFloat(way.tags?.height);
  const top = Number.isFinite(height) ? height : 20;
  const ground = heroGround(c.x, c.y, MIN_SHORE_H, DECK_MAX_H);
  withMat(MAT_PALE, () => {
    member(v3(c.x, ground - 1, c.y), v3(c.x, ground + top, c.y), v3(1, 0, 0), 7, 7, 4, 4);
  });
  return (current.indices.length - before) / 3;
}

/**
 * Signal Hill: a cluster of well masts on the 111 m hill, which is what makes
 * that hill read as Signal Hill rather than as a hill (design doc 1.5,
 * heading 3). Positions are real: OSM carries 214 `man_made=petroleum_well`
 * nodes over the field, and the cluster is the highest of them under a spacing
 * filter, because the field is far denser than 7 km of air can resolve. Mast
 * height is the one estimate in this layer.
 */
function buildDerricks(nodes) {
  const before = current.indices.length;
  const candidates = nodes
    .map((node) => {
      const p = project(node.lat, node.lon);
      /* on the hill the DEM is the surface and there is nothing to cap: the
       * cluster filter below already rejects anything under 40 m */
      return { ...p, h: heroGround(p.x, p.y, 0, Infinity) };
    })
    .filter((p) => inside(p) && p.h > 40)
    .sort((a, b) => b.h - a.h || a.x - b.x || a.y - b.y);
  const placed = [];
  for (const p of candidates) {
    if (placed.length >= DERRICK_COUNT) break;
    if (placed.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < DERRICK_SPACING)) continue;
    placed.push(p);
  }
  withMat(MAT_DARK, () => {
    for (const p of placed) {
      member(
        v3(p.x, p.h - 1, p.y),
        v3(p.x, p.h + DERRICK_H, p.y),
        v3(1, 0, 0),
        6,
        6,
        1.6,
        1.6,
      );
    }
  });
  console.log(`derricks: ${placed.length} of ${candidates.length} wells over 40 m`);
  return (current.indices.length - before) / 3;
}

/** Everything design doc 9 curates, in one layer and one draw. */
function buildHeroes(coastWays, anchors) {
  const h = venue.heroes;
  if (!h) return;
  const byId = new Map(anchors.map((el) => [el.id, el]));
  const counts = [];
  for (const island of h.islands) {
    const way = coastWays.find((w) => w.id === island.way);
    if (!way) continue;
    const ring = ringOf(way);
    if (signedArea(ring) < 0) ring.reverse();
    /* Products key on the island's own OSM way id (masses on the island label,
     * its own key, so a missing tree product cannot sever the mass join), so a
     * renamed island or a reordered VENUES block cannot mis-join a crown cloud
     * to a shoreline. Round 1 removed the constant-based island builders, so an
     * island with a missing product would silently bake bare; fail the bake
     * loudly instead (codex round-1 P2). */
    const treeSet = PRODUCTS.trees?.islands.find((i) => i.osmWay === island.way);
    const shoreSet = PRODUCTS.shoreline?.islands.find((i) => i.osmWay === island.way);
    const massSet = PRODUCTS.masses?.patches.find((p) => p.kind === "island" && p.island === island.name);
    if (!treeSet || !shoreSet || !massSet) {
      const missing = [
        !treeSet && "trees",
        !shoreSet && "shoreline",
        !massSet && "masses",
      ].filter(Boolean);
      console.error(
        `island ${island.name}: no ${missing.join(", ")} data; the constant-based island ` +
          `builders are gone, so this would bake a bare island. Restore the product or ` +
          `remove the island from VENUES.`,
      );
      process.exit(1);
    }
    counts.push([
      `island ${island.name}`,
      buildIsland({
        name: island.name,
        ring,
        crowns: treeSet.crowns,
        shoreline: shoreSet,
        masses: massSet.masses,
      }),
    ]);
  }
  counts.push(["queen mary", buildQueenMary(byId.get(h.queenMary))]);
  counts.push(["gateway", buildGateway(byId.get(h.gateway))]);
  counts.push(["spruce goose dome", buildDome(byId.get(h.dome))]);
  counts.push(["robot light", buildRobotLight(byId.get(h.longBeachLight))]);
  counts.push(["lions lighthouse", buildLionsLighthouse(byId.get(h.lionsLighthouse))]);
  counts.push([
    "signal hill derricks",
    buildDerricks(anchors.filter((el) => el.type === "node" && el.tags?.man_made === "petroleum_well")),
  ]);
  for (const [name, tris] of counts) console.log(`  hero ${name}: ${tris} tris`);
}

/* --------------------------------------------------- baked sun and ambient */

/**
 * What stands between a surface and the light, measured once, offline.
 *
 * `aShade` carries the Lambert term, which is what a face's own orientation
 * does to the sun. What it cannot carry is what stands BETWEEN a face and the
 * sun, so every tower here has a lit side and a shaded side and throws nothing
 * across the ground it stands on, every crown floats over a rim it does not
 * darken, and a rim meets the water with no contact shadow at all. That absence
 * is most of what reads as a slab.
 *
 * Two more bytes a vertex close it. `aSun` is the fraction of the solar disc a
 * vertex can see past the venue's own triangles; `aAo` is how much of the
 * hemisphere its normal opens is closed off by geometry within arm's reach. The
 * shader multiplies the direct term by the first and the sky fill by the
 * second, so a frame pays for one more attribute fetch and nothing else: no
 * light, no pass, no shadow map, no per-frame work.
 */

/* Every value below is the mean over the surface the VERTEX IS RESPONSIBLE
 * FOR, not the value at the vertex point, and on this mesh that distinction
 * decides whether the islands read at all. A THUMS island deck is one earcut
 * cap whose only vertices sit on its ring, so a point sample at a rim corner
 * (which the rim rocks genuinely do shadow) interpolated across a 26,000 m2
 * triangle painted the entire deck black: measured, and the first thing the
 * round-2 captures showed. Sampling the vertex's own support instead makes the
 * estimate exactly as sharp as the mesh is and no sharper. A 6.0 m island
 * facet keeps its contact shadow; a 26,000 m2 cap gets the mean light that
 * really falls on it.
 *
 * The samples are spread over the incident triangles in proportion to area and
 * weighted by the vertex's own linear basis function, which is the same hat the
 * rasteriser interpolates the attribute back out with. */
const SUPPORT_SAMPLES = 16;

/* The sun is a disc, not a point. Its mean angular semi-diameter seen from
 * Earth is 16.0 arcmin (MEASURED, the astronomical constant: 15.99' at mean
 * distance), so a shadow edge is a penumbra 2 d tan(16') wide at distance d
 * from whatever casts it, 3.7 m at the 399 m these rays reach. Each support
 * sample takes one ray at its own jittered point on the disc, so a vertex
 * spends SUPPORT_SAMPLES rays covering the disc and its own surface at once.
 * The disc is not a softening knob: widening it past 16 arcmin would be
 * inventing a light this scene does not have, and the measured consequence is
 * small either way (round-2 report: point-sampled, eight disc samples differed
 * from a single centre ray on 170 of 47,462 sunward vertices). */
const SUN_ANG_RADIUS = (16.0 / 60) * DEG;
/* Ambient occlusion at contact scale, cosine-weighted over the hemisphere the
 * vertex normal opens, with each blocker weighted by 1 - t / AO_RANGE so it
 * fades out with distance instead of stopping at a hard radius.
 *
 * The range is what keeps this a contact term rather than a sky view factor,
 * and that distinction is load-bearing. VenueShore's ambient is ONE isotropic
 * sky fill whose gain (AMB_GAIN 0.44) was fixed in round 4d against measured
 * sunlit-to-shaded pairs, and its own comment says the constant stands in for
 * the interreflection between a stack and the apron under it. An unbounded
 * occlusion term would count the open ground itself as an occluder of every
 * vertical face, halve the ambient on all of them, and push the rendered
 * sunlit-to-shaded ratio from 3.2 to about 6 against a measurement of 2.6 to
 * 3.4. Bounded at contact scale it leaves an isolated wall alone and darkens
 * what is actually tucked under something.
 *
 * 18 m is DERIVED from the venue's own measured planting: trees.json's 1,079
 * crowns have a p90 height of 17.46 m over their deck, so a crown darkens the
 * deck under it out to the height it stands at and no further. The sweep behind
 * that pick is in the round-2 report; with the distance falloff the channel is
 * close to insensitive to it (mean over the terrain layer 0.937 at 6 m, 0.894
 * at 18, 0.861 at 60).
 *
 * The ray count is MEASURED rather than picked. Each support sample fires a
 * jittered 4 x 3 grid of strata, 192 rays over the 16 samples, and rebaking the
 * whole venue at a different seed then moves the ambient byte by the p95 in the
 * round-2 report. Stratifying in two dimensions is worth more than multiplying
 * rays: point-sampled, 64 rays on an 8 x 8 grid measured a p95 of 0.035 where
 * 96 rays on a stratified radius and a golden-ratio azimuth measured 0.067. */
const AO_AZIMUTHS = 4;
const AO_RADII = 3;
const AO_RAYS = AO_AZIMUTHS * AO_RADII;
const AO_RANGE = 18;
/* Arbitrary, fixed, and written into the manifest. The jitter inside both
 * sample sets is a hash of the vertex index and this seed rather than a step of
 * a running generator, so it does not depend on the order vertices are visited
 * in, two bakes agree byte for byte, and a bake run at another seed shows up in
 * the manifest rather than only in the pixels. */
const OCCLUSION_SEED = 0x6c61794c; // "layL"
/* Off the surface the ray starts on, along the face normal of the triangle the
 * sample landed in. */
const RAY_EPS = 0.05;
/* Derived off the mesh inside the pass and reported in the manifest beside the
 * seed, because it is a property of this venue's extent rather than a setting. */
let occlusionRange = 0;

/** The occluder set, the two channels, and the log lines that say what they
 * came out at. Runs after every builder and before `writeAsset`, so what it
 * casts against is the whole shipped venue rather than one layer's share. */
function bakeOcclusion() {
  /* The curtain is not geometry: its position slots are directions its own
   * vertex shader relocates around the camera every frame, so it can neither
   * cast nor receive. Everything else casts on everything else, which is the
   * point: a downtown tower in L2 shades the wharf under it in L1, an island
   * screen in L4 shades its own deck. */
  const shore = LAYERS.filter((layer) => layer.material === 0 && layer.indices.length > 0);
  let vertTotal = 0;
  let triTotal = 0;
  for (const layer of shore) {
    vertTotal += layer.positions.length / 3;
    triTotal += layer.indices.length / 3;
  }
  if (vertTotal === 0) return;

  /* one flat vertex table across the layers, in world metres */
  const px = new Float64Array(vertTotal);
  const py = new Float64Array(vertTotal);
  const pz = new Float64Array(vertTotal);
  const shadeByte = new Uint8Array(vertTotal);
  const firstVertex = new Map();
  let at = 0;
  for (const layer of shore) {
    firstVertex.set(layer, at);
    const n = layer.positions.length / 3;
    for (let i = 0; i < n; i++) {
      px[at + i] = layer.positions[i * 3];
      py[at + i] = layer.positions[i * 3 + 1] / Y_UNIT;
      pz[at + i] = layer.positions[i * 3 + 2];
      shadeByte[at + i] = layer.shades[i];
    }
    at += n;
  }
  const tri = new Int32Array(triTotal * 3);
  let writeAt = 0;
  for (const layer of shore) {
    const off = firstVertex.get(layer);
    for (let k = 0; k < layer.indices.length; k++) tri[writeAt++] = off + layer.indices[k];
  }

  /* The sun in world axes. `SUN` above is bake space (x, up, courseY) and the
   * scene maps course y onto -z, the same mapping `vertex` applies to a
   * position, so this is the one place the two frames meet and sky.ts's own
   * sunDirection() is what it has to agree with. */
  const sunX = SUN.x;
  const sunY = SUN.h;
  const sunZ = -SUN.y;

  /* Vertex normals, area-weighted over the incident triangles. The mesh has no
   * normal channel and never needed one: `shadeOf` was handed a normal by the
   * builder and only the Lambert byte survived. */
  const nx = new Float64Array(vertTotal);
  const ny = new Float64Array(vertTotal);
  const nz = new Float64Array(vertTotal);
  for (let f = 0; f < triTotal; f++) {
    const a = tri[f * 3];
    const b = tri[f * 3 + 1];
    const c = tri[f * 3 + 2];
    const ux = px[b] - px[a];
    const uy = py[b] - py[a];
    const uz = pz[b] - pz[a];
    const vx = px[c] - px[a];
    const vy = py[c] - py[a];
    const vz = pz[c] - pz[a];
    /* twice the area times the unit normal, so the sum is area-weighted */
    const gx = uy * vz - uz * vy;
    const gy = uz * vx - ux * vz;
    const gz = ux * vy - uy * vx;
    nx[a] += gx;
    ny[a] += gy;
    nz[a] += gz;
    nx[b] += gx;
    ny[b] += gy;
    nz[b] += gz;
    nx[c] += gx;
    ny[c] += gy;
    nz[c] += gz;
  }

  /* Which way round that normal points is not settled by the winding: the
   * material is DoubleSide, so no builder was ever forced to agree with any
   * other, and just over half of these come back inside out. The shade byte
   * settles it without a guess. `shadeOf` writes max(N.L, 0) through a fixed
   * ramp, so a vertex above the floor byte was given a sun-facing normal and
   * one at the floor was given a normal facing away; flipping the
   * reconstruction to agree recovers the sign the builder used, and with it the
   * back-facing test below. */
  const SHADE_FLOOR = shadeOf(0, -1, 0);
  let flipped = 0;
  let degenerate = 0;
  let agrees = 0;
  let flatTotal = 0;
  let flatAgrees = 0;
  /* how far the incident faces of a vertex disagree with each other: a vertex
   * whose faces are coplanar has an exact normal and has to reproduce its shade
   * byte, one on a crease has a faceted average of several and cannot */
  const spread = new Float64Array(vertTotal);
  for (let f = 0; f < triTotal; f++) {
    const a = tri[f * 3];
    const b = tri[f * 3 + 1];
    const c = tri[f * 3 + 2];
    const ux = px[b] - px[a];
    const uy = py[b] - py[a];
    const uz = pz[b] - pz[a];
    const vx = px[c] - px[a];
    const vy = py[c] - py[a];
    const vz = pz[c] - pz[a];
    let gx = uy * vz - uz * vy;
    let gy = uz * vx - ux * vz;
    let gz = ux * vy - uy * vx;
    const glen = Math.hypot(gx, gy, gz) || 1;
    gx /= glen;
    gy /= glen;
    gz /= glen;
    for (const v of [a, b, c]) {
      const len = Math.hypot(nx[v], ny[v], nz[v]) || 1;
      const cosine = Math.abs((nx[v] * gx + ny[v] * gy + nz[v] * gz) / len);
      const off = 1 - Math.min(1, cosine);
      if (off > spread[v]) spread[v] = off;
    }
  }
  for (const layer of shore) {
    const off = firstVertex.get(layer);
    const n = layer.positions.length / 3;
    for (let i = 0; i < n; i++) {
      const v = off + i;
      let len = Math.hypot(nx[v], ny[v], nz[v]);
      if (len === 0) {
        /* no incident triangle, or a fold whose faces cancel exactly: stand the
         * hemisphere up and let the shade byte turn it over below */
        nx[v] = 0;
        ny[v] = 1;
        nz[v] = 0;
        len = 1;
        degenerate++;
      }
      nx[v] /= len;
      ny[v] /= len;
      nz[v] /= len;
      const shade = layer.shades[i];
      const lambert = nx[v] * sunX + ny[v] * sunY + nz[v] * sunZ;
      if ((shade > SHADE_FLOOR && lambert < 0) || (shade <= SHADE_FLOOR && lambert > 0)) {
        nx[v] = -nx[v];
        ny[v] = -ny[v];
        nz[v] = -nz[v];
        flipped++;
      }
      const back = nx[v] * sunX + ny[v] * sunY + nz[v] * sunZ;
      const predicted = Math.max(
        0,
        Math.min(255, Math.round((0.62 + 0.55 * Math.max(back, 0)) * 128)),
      );
      const exact = Math.abs(predicted - shade) <= 1;
      if (exact) agrees++;
      /* 1 - cos(1 degree) = 1.52e-4 */
      if (spread[v] <= 1.52e-4) {
        flatTotal++;
        if (exact) flatAgrees++;
      }
    }
  }

  /* Triangles a ray must not hit: the ones incident to the vertex it leaves
   * from, AND the ones incident to any vertex standing at the same place. The
   * second half is not optional. The dedup key carries the shade byte and the
   * substance, so a crease is a PAIR of vertices at one position with disjoint
   * triangle sets, and without this a grazing sun ray leaves one of them and
   * hits the other's face 3 cm away. Round 2 measured that at 1,988 vertices
   * before the group was added. */
  const groupKey = new Map();
  const group = new Int32Array(vertTotal);
  let groupCount = 0;
  for (let v = 0; v < vertTotal; v++) {
    const key = `${px[v]},${Math.round(py[v] * Y_UNIT)},${pz[v]}`;
    let id = groupKey.get(key);
    if (id === undefined) {
      id = groupCount++;
      groupKey.set(key, id);
    }
    group[v] = id;
  }
  const memberAt = new Int32Array(groupCount + 1);
  for (let v = 0; v < vertTotal; v++) memberAt[group[v] + 1]++;
  for (let g = 0; g < groupCount; g++) memberAt[g + 1] += memberAt[g];
  const member = new Int32Array(vertTotal);
  {
    const cursor = Int32Array.from(memberAt.subarray(0, groupCount));
    for (let v = 0; v < vertTotal; v++) member[cursor[group[v]]++] = v;
  }
  const incidentAt = new Int32Array(vertTotal + 1);
  for (let k = 0; k < tri.length; k++) incidentAt[tri[k] + 1]++;
  for (let v = 0; v < vertTotal; v++) incidentAt[v + 1] += incidentAt[v];
  const incident = new Int32Array(tri.length);
  {
    const cursor = Int32Array.from(incidentAt.subarray(0, vertTotal));
    for (let f = 0; f < triTotal; f++) {
      incident[cursor[tri[f * 3]]++] = f;
      incident[cursor[tri[f * 3 + 1]]++] = f;
      incident[cursor[tri[f * 3 + 2]]++] = f;
    }
  }

  /* How far a shadow ray has to travel before it can be given up on. DERIVED,
   * and exactly rather than approximately: the sun stands at SUN_EL, so a
   * caster whose top is at height t can shade a receiver at height r no further
   * than (t - r) / tan(SUN_EL) away. Taking t as the tallest vertex in the mesh
   * and r as the lowest makes the cast EXHAUSTIVE rather than truncated: past
   * this range nothing in this venue can stand between a vertex and the sun.
   * Measured off the mesh rather than typed in, so a taller venue lengthens its
   * own rays. */
  let topY = -Infinity;
  let lowY = Infinity;
  for (let v = 0; v < vertTotal; v++) {
    if (py[v] > topY) topY = py[v];
    if (py[v] < lowY) lowY = py[v];
  }
  const RAY_RANGE = Math.ceil((topY - lowY) / Math.tan(SUN_EL));
  occlusionRange = RAY_RANGE;

  /* A bounding-volume hierarchy over the triangles, median split on the widest
   * axis of the centroid spread. The venue is 21 km across and holds triangles
   * from 6 m island facets to a 6.8 km2 harbour cap, so a uniform grid needs
   * either cells the cap spans by the thousand or cells far too coarse for an
   * island; a hierarchy carries both without a special case. Ties in the split
   * are broken by triangle index, so the tree is a function of the mesh and not
   * of the sort implementation. */
  const LEAF = 8;
  const order = new Int32Array(triTotal);
  const cx = new Float64Array(triTotal);
  const cy = new Float64Array(triTotal);
  const cz = new Float64Array(triTotal);
  for (let f = 0; f < triTotal; f++) {
    order[f] = f;
    const a = tri[f * 3];
    const b = tri[f * 3 + 1];
    const c = tri[f * 3 + 2];
    cx[f] = (px[a] + px[b] + px[c]) / 3;
    cy[f] = (py[a] + py[b] + py[c]) / 3;
    cz[f] = (pz[a] + pz[b] + pz[c]) / 3;
  }
  const nodeBox = [];
  const nodeA = [];
  const nodeB = [];
  const nodeStart = [];
  const nodeCount = [];
  function buildNode(start, count) {
    const node = nodeA.length;
    nodeA.push(-1);
    nodeB.push(-1);
    nodeStart.push(start);
    nodeCount.push(count);
    let mnx = Infinity;
    let mny = Infinity;
    let mnz = Infinity;
    let mxx = -Infinity;
    let mxy = -Infinity;
    let mxz = -Infinity;
    let ax0 = Infinity;
    let ay0 = Infinity;
    let az0 = Infinity;
    let ax1 = -Infinity;
    let ay1 = -Infinity;
    let az1 = -Infinity;
    for (let i = start; i < start + count; i++) {
      const f = order[i];
      for (let k = 0; k < 3; k++) {
        const v = tri[f * 3 + k];
        if (px[v] < mnx) mnx = px[v];
        if (py[v] < mny) mny = py[v];
        if (pz[v] < mnz) mnz = pz[v];
        if (px[v] > mxx) mxx = px[v];
        if (py[v] > mxy) mxy = py[v];
        if (pz[v] > mxz) mxz = pz[v];
      }
      if (cx[f] < ax0) ax0 = cx[f];
      if (cy[f] < ay0) ay0 = cy[f];
      if (cz[f] < az0) az0 = cz[f];
      if (cx[f] > ax1) ax1 = cx[f];
      if (cy[f] > ay1) ay1 = cy[f];
      if (cz[f] > az1) az1 = cz[f];
    }
    nodeBox.push(mnx, mny, mnz, mxx, mxy, mxz);
    if (count <= LEAF) return node;
    const spanX = ax1 - ax0;
    const spanY = ay1 - ay0;
    const spanZ = az1 - az0;
    const key = spanX >= spanY && spanX >= spanZ ? cx : spanY >= spanZ ? cy : cz;
    const slice = Array.from(order.subarray(start, start + count)).sort(
      (a, b) => key[a] - key[b] || a - b,
    );
    order.set(slice, start);
    const half = count >> 1;
    nodeA[node] = buildNode(start, half);
    nodeB[node] = buildNode(start + half, count - half);
    return node;
  }
  buildNode(0, triTotal);
  /* the traversal below runs a few million times, so the tree moves out of the
   * growable arrays it was built in */
  const box = Float64Array.from(nodeBox);
  const childA = Int32Array.from(nodeA);
  const childB = Int32Array.from(nodeB);
  const leafAt = Int32Array.from(nodeStart);
  const leafCount = Int32Array.from(nodeCount);

  /* One mark per vertex rather than a search: `stamp[f] === mark` says triangle
   * f touches the place this ray leaves from. */
  const stamp = new Int32Array(triTotal);
  const stack = new Int32Array(96);

  /** Distance to the nearest triangle along the ray, or Infinity. `any` stops
   * at the first hit, which is all a shadow ray needs and most of what it
   * costs; the ambient rays want the distance and pay for it inside a much
   * shorter tmax. */
  function cast(ox, oy, oz, dx, dy, dz, tmax, mark, any) {
    const ix = 1 / (dx || 1e-12);
    const iy = 1 / (dy || 1e-12);
    const iz = 1 / (dz || 1e-12);
    let best = Infinity;
    let top = 0;
    stack[top++] = 0;
    while (top > 0) {
      const node = stack[--top];
      const slab = node * 6;
      let t0 = 0;
      let t1 = best < tmax ? best : tmax;
      let a = (box[slab] - ox) * ix;
      let b = (box[slab + 3] - ox) * ix;
      if (a > b) {
        const swap = a;
        a = b;
        b = swap;
      }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      a = (box[slab + 1] - oy) * iy;
      b = (box[slab + 4] - oy) * iy;
      if (a > b) {
        const swap = a;
        a = b;
        b = swap;
      }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      a = (box[slab + 2] - oz) * iz;
      b = (box[slab + 5] - oz) * iz;
      if (a > b) {
        const swap = a;
        a = b;
        b = swap;
      }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) continue;
      if (childA[node] >= 0) {
        stack[top++] = childA[node];
        stack[top++] = childB[node];
        continue;
      }
      const start = leafAt[node];
      const end = start + leafCount[node];
      for (let i = start; i < end; i++) {
        const f = order[i];
        if (stamp[f] === mark) continue;
        const va = tri[f * 3];
        const vb = tri[f * 3 + 1];
        const vc = tri[f * 3 + 2];
        const e1x = px[vb] - px[va];
        const e1y = py[vb] - py[va];
        const e1z = pz[vb] - pz[va];
        const e2x = px[vc] - px[va];
        const e2y = py[vc] - py[va];
        const e2z = pz[vc] - pz[va];
        /* Moller-Trumbore, two-sided: nothing in this mesh promises a
         * consistent winding, and a wall lit from behind still stops light. */
        const pvx = dy * e2z - dz * e2y;
        const pvy = dz * e2x - dx * e2z;
        const pvz = dx * e2y - dy * e2x;
        const det = e1x * pvx + e1y * pvy + e1z * pvz;
        if (det > -1e-9 && det < 1e-9) continue;
        const inv = 1 / det;
        const tvx = ox - px[va];
        const tvy = oy - py[va];
        const tvz = oz - pz[va];
        const u = (tvx * pvx + tvy * pvy + tvz * pvz) * inv;
        if (u < 0 || u > 1) continue;
        const qvx = tvy * e1z - tvz * e1y;
        const qvy = tvz * e1x - tvx * e1z;
        const qvz = tvx * e1y - tvy * e1x;
        const vv = (dx * qvx + dy * qvy + dz * qvz) * inv;
        if (vv < 0 || u + vv > 1) continue;
        const hit = (e2x * qvx + e2y * qvy + e2z * qvz) * inv;
        if (hit > 1e-4 && hit < best && hit < tmax) {
          if (any) return hit;
          best = hit;
        }
      }
    }
    return best;
  }

  /* Stateless jitter: a hash of the vertex, the sample slot and the seed. */
  function hash32(value) {
    let a = value | 0;
    a = (a ^ 61) ^ (a >>> 16);
    a = (a + (a << 3)) | 0;
    a = a ^ (a >>> 4);
    a = Math.imul(a, 0x27d4eb2d);
    a = a ^ (a >>> 15);
    return a >>> 0;
  }
  const jitter = (v, salt) =>
    hash32((v ^ Math.imul(salt + 1, 0x9e3779b1)) ^ OCCLUSION_SEED) / 4294967296;

  /* Per-triangle area and face normal: the support sampler picks a triangle in
   * proportion to the first and leaves the surface along the second. */
  const faceArea = new Float64Array(triTotal);
  const faceNx = new Float64Array(triTotal);
  const faceNy = new Float64Array(triTotal);
  const faceNz = new Float64Array(triTotal);
  for (let f = 0; f < triTotal; f++) {
    const a = tri[f * 3];
    const b = tri[f * 3 + 1];
    const c = tri[f * 3 + 2];
    const ux = px[b] - px[a];
    const uy = py[b] - py[a];
    const uz = pz[b] - pz[a];
    const vx = px[c] - px[a];
    const vy = py[c] - py[a];
    const vz = pz[c] - pz[a];
    const gx = uy * vz - uz * vy;
    const gy = uz * vx - ux * vz;
    const gz = ux * vy - uy * vx;
    const len = Math.hypot(gx, gy, gz);
    faceArea[f] = len / 2;
    faceNx[f] = len === 0 ? 0 : gx / len;
    faceNy[f] = len === 0 ? 1 : gy / len;
    faceNz[f] = len === 0 ? 0 : gz / len;
  }

  /* The solar disc's own frame, once. */
  const helperY = Math.abs(sunY) < 0.99 ? 1 : 0;
  const helperX = 1 - helperY;
  let sTx = helperY * sunZ;
  let sTy = -helperX * sunZ;
  let sTz = helperX * sunY - helperY * sunX;
  {
    const len = Math.hypot(sTx, sTy, sTz);
    sTx /= len;
    sTy /= len;
    sTz /= len;
  }
  const sBx = sunY * sTz - sunZ * sTy;
  const sBy = sunZ * sTx - sunX * sTz;
  const sBz = sunX * sTy - sunY * sTx;

  const GOLDEN = 0.6180339887498949;
  const sun = new Uint8Array(vertTotal);
  const ao = new Uint8Array(vertTotal);
  let backFacing = 0;
  let fullSun = 0;
  let noSun = 0;
  let partial = 0;
  let unsupported = 0;
  for (let v = 0; v < vertTotal; v++) {
    /* Triangles a ray must not hit: the ones incident to this vertex AND the
     * ones incident to any vertex standing at the same place. */
    const mark = v + 1;
    const grp = group[v];
    for (let m = memberAt[grp]; m < memberAt[grp + 1]; m++) {
      const twin = member[m];
      for (let i = incidentAt[twin]; i < incidentAt[twin + 1]; i++) stamp[incident[i]] = mark;
    }
    const from = incidentAt[v];
    const to = incidentAt[v + 1];
    let support = 0;
    for (let i = from; i < to; i++) support += faceArea[incident[i]];
    if (support === 0) {
      /* nothing to average over: an unused vertex, or one whose faces are all
       * degenerate. Full light rather than none, so it can only ever be
       * invisible rather than a black speck. */
      sun[v] = 0;
      ao[v] = 255;
      unsupported++;
      continue;
    }

    let sunNum = 0;
    let sunDen = 0;
    let aoNum = 0;
    let aoDen = 0;
    /* aShade has the last word on whether this vertex takes direct light at
     * all. It has to: a builder is free to hand shadeOf a smooth normal that is
     * not any of its triangles' geometric normals (a crown ring does exactly
     * that), so a face whose geometry leans a thousandth of a degree sunward
     * can sit under a vertex the shading calls fully turned away. Measured on
     * the shipped mesh the gate suppresses 2,519 vertices of 61,997, 2,428 of
     * them on the hero layer (audit-corrected; support sampling puts sample
     * faces tens of degrees off the vertex normal, so this is no edge case).
     * Letting the ray cast light one of them would put a sun byte on a surface
     * aShade multiplies to near zero, and the grain term riding inside the
     * same clamp could then add up to 9.5% of the direct term on heroes: two
     * channels disagreeing about the same face, visibly. */
    const takesSun = shadeByte[v] > SHADE_FLOOR;
    let sunward = false;
    for (let k = 0; k < SUPPORT_SAMPLES; k++) {
      /* stratified along the support's own area, so a vertex that carries one
       * huge cap and five small facets spends its samples where the surface is */
      const target = ((k + jitter(v, k)) / SUPPORT_SAMPLES) * support;
      let f = incident[to - 1];
      let acc = 0;
      for (let i = from; i < to; i++) {
        acc += faceArea[incident[i]];
        if (acc >= target) {
          f = incident[i];
          break;
        }
      }
      const a = tri[f * 3];
      const b = tri[f * 3 + 1];
      const c = tri[f * 3 + 2];
      const r1 = jitter(v, SUPPORT_SAMPLES + k);
      const r2 = jitter(v, 2 * SUPPORT_SAMPLES + k);
      const root = Math.sqrt(r1);
      const l0 = 1 - root;
      const l1 = root * (1 - r2);
      const l2 = root * r2;
      /* the hat weight: this vertex's own barycentric coordinate at the sample,
       * which is exactly the weight the rasteriser will give it back */
      const weight = a === v ? l0 : b === v ? l1 : l2;
      if (weight <= 0) continue;
      const sx = l0 * px[a] + l1 * px[b] + l2 * px[c];
      const sy = l0 * py[a] + l1 * py[b] + l2 * py[c];
      const sz = l0 * pz[a] + l1 * pz[b] + l2 * pz[c];
      /* the face's own normal, turned to the side the vertex normal opens */
      let fx = faceNx[f];
      let fy = faceNy[f];
      let fz = faceNz[f];
      if (fx * nx[v] + fy * ny[v] + fz * nz[v] < 0) {
        fx = -fx;
        fy = -fy;
        fz = -fz;
      }
      const ox = sx + fx * RAY_EPS;
      const oy = sy + fy * RAY_EPS;
      const oz = sz + fz * RAY_EPS;

      sunDen += weight;
      const lambert = fx * sunX + fy * sunY + fz * sunZ;
      if (takesSun && lambert > 0) {
        /* A face turned away from the sun takes no direct light whatever stands
         * in front of it, and aShade already says so; skipping the cast there is
         * the same answer for nothing. */
        sunward = true;
        const radial = (k + jitter(v, 3 * SUPPORT_SAMPLES + k)) / SUPPORT_SAMPLES;
        const phi =
          2 * Math.PI * ((k * GOLDEN + jitter(v, 4 * SUPPORT_SAMPLES + k)) % 1);
        const r = SUN_ANG_RADIUS * Math.sqrt(radial);
        const discX = r * Math.cos(phi);
        const discY = r * Math.sin(phi);
        let dx = sunX + sTx * discX + sBx * discY;
        let dy = sunY + sTy * discX + sBy * discY;
        let dz = sunZ + sTz * discX + sBz * discY;
        const len = Math.hypot(dx, dy, dz);
        dx /= len;
        dy /= len;
        dz /= len;
        if (cast(ox, oy, oz, dx, dy, dz, RAY_RANGE, mark, true) === Infinity) {
          sunNum += weight;
        }
      }

      /* the hemisphere this face opens */
      const upY = Math.abs(fy) < 0.99 ? 1 : 0;
      const upX = 1 - upY;
      let tx = upY * fz;
      let ty = -upX * fz;
      let tz = upX * fy - upY * fx;
      const tlen = Math.hypot(tx, ty, tz) || 1;
      tx /= tlen;
      ty /= tlen;
      tz /= tlen;
      const bx = fy * tz - fz * ty;
      const by = fz * tx - fx * tz;
      const bz = fx * ty - fy * tx;
      let closed = 0;
      for (let j = 0; j < AO_RAYS; j++) {
        /* cosine-weighted on a jittered grid, so the estimator is the sample
         * mean itself with nothing to carry but the distance falloff */
        const salt = 5 * SUPPORT_SAMPLES + (k * AO_RAYS + j) * 2;
        const ia = j % AO_AZIMUTHS;
        const ir = (j / AO_AZIMUTHS) | 0;
        const u1 = (ir + jitter(v, salt)) / AO_RADII;
        const phi = (2 * Math.PI * (ia + jitter(v, salt + 1))) / AO_AZIMUTHS;
        const rr = Math.sqrt(u1);
        const up = Math.sqrt(Math.max(0, 1 - u1));
        const lx = rr * Math.cos(phi);
        const ly = rr * Math.sin(phi);
        const dx = tx * lx + bx * ly + fx * up;
        const dy = ty * lx + by * ly + fy * up;
        const dz = tz * lx + bz * ly + fz * up;
        const hit = cast(ox, oy, oz, dx, dy, dz, AO_RANGE, mark, false);
        if (hit < AO_RANGE) closed += 1 - hit / AO_RANGE;
      }
      aoNum += weight * Math.max(0, 1 - closed / AO_RAYS);
      aoDen += weight;
    }

    const sunV = sunDen > 0 ? sunNum / sunDen : 0;
    sun[v] = Math.round(sunV * 255);
    ao[v] = aoDen > 0 ? Math.round((aoNum / aoDen) * 255) : 255;
    if (!sunward) backFacing++;
    else if (sun[v] === 255) fullSun++;
    else if (sun[v] === 0) noSun++;
    else partial++;
  }

  for (const layer of shore) {
    const off = firstVertex.get(layer);
    const n = layer.positions.length / 3;
    layer.suns = Array.from(sun.subarray(off, off + n));
    layer.aos = Array.from(ao.subarray(off, off + n));
  }

  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length / 255;
  console.log(
    `occlusion: ${vertTotal} verts against ${triTotal} tris, shadow rays <= ${RAY_RANGE} m ` +
      `(mesh spans ${lowY.toFixed(1)} to ${topY.toFixed(1)} m at sun elevation 22), ambient ` +
      `<= ${AO_RANGE} m, seed 0x${OCCLUSION_SEED.toString(16)}, ${SUPPORT_SAMPLES} support ` +
      `samples a vertex x ${AO_RAYS} ambient rays`,
  );
  console.log(
    `  normals: ${flipped} flipped to agree with the shade byte, ${degenerate} degenerate, ` +
      `${agrees} of ${vertTotal} reproduce their shade byte within 1 level ` +
      `(${flatAgrees} of ${flatTotal} where the incident faces are coplanar)`,
  );
  console.log(
    `  sun: ${backFacing} back-facing (0 by orientation), ${fullSun} fully lit, ` +
      `${noSun} fully shadowed, ${partial} part lit, ${unsupported} without support`,
  );
  for (const layer of shore) {
    console.log(
      `  layer ${layer.classId} ${layer.name}: mean sun ${mean(layer.suns).toFixed(3)}, ` +
        `mean ambient ${mean(layer.aos).toFixed(3)}`,
    );
  }
}

/* ------------------------------------------------------------------ output */

/** Interleave the low 16 bits of a value into every third bit, so three of
 * these OR together into a 48-bit Morton code. 2^45 is exact in a double, so
 * the sort needs no BigInt. */
function mortonSpread(v) {
  let out = 0;
  for (let bit = 0; bit < 16; bit++) if (v & (1 << bit)) out += 2 ** (3 * bit);
  return out;
}

/**
 * Reorder a layer's vertices along a Morton curve of their quantised position
 * and remap its indices to match (design doc 2.2, required for round 4).
 *
 * The mesh is untouched: same vertices, same triangles, same winding, only the
 * order they are written in. Emission order follows the builders, so a tank
 * farm and a crane bank a kilometre apart end up interleaved in the position
 * stream and every Int16 delta is a full coordinate; sorting by locality turns
 * most of them into small ones, which is what gzip's match finder wants.
 */
function mortonSort(layer) {
  const n = layer.positions.length / 3;
  const code = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    code[i] =
      mortonSpread((layer.positions[i * 3] + 32768) & 0xffff) * 4 +
      mortonSpread((layer.positions[i * 3 + 1] + 32768) & 0xffff) * 2 +
      mortonSpread((layer.positions[i * 3 + 2] + 32768) & 0xffff);
  }
  /* ties broken by the original index, so the sort is a total order and two
   * bakes cannot disagree about it */
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => code[a] - code[b] || a - b);
  const to = new Int32Array(n);
  for (let k = 0; k < n; k++) to[order[k]] = k;
  const positions = new Array(n * 3);
  const fades = layer.fades.length ? new Array(n) : [];
  const shades = layer.shades.length ? new Array(n) : [];
  const dists = layer.dists.length ? new Array(n) : [];
  const bases = layer.bases.length ? new Array(n) : [];
  const mats = layer.mats.length ? new Array(n) : [];
  const suns = layer.suns.length ? new Array(n) : [];
  const aos = layer.aos.length ? new Array(n) : [];
  for (let k = 0; k < n; k++) {
    const from = order[k];
    positions[k * 3] = layer.positions[from * 3];
    positions[k * 3 + 1] = layer.positions[from * 3 + 1];
    positions[k * 3 + 2] = layer.positions[from * 3 + 2];
    if (fades.length) fades[k] = layer.fades[from];
    if (shades.length) shades[k] = layer.shades[from];
    if (dists.length) dists[k] = layer.dists[from];
    if (bases.length) bases[k] = layer.bases[from];
    if (mats.length) mats[k] = layer.mats[from];
    if (suns.length) suns[k] = layer.suns[from];
    if (aos.length) aos[k] = layer.aos[from];
  }
  layer.positions = positions;
  layer.fades = fades;
  layer.shades = shades;
  layer.dists = dists;
  layer.bases = bases;
  layer.mats = mats;
  layer.suns = suns;
  layer.aos = aos;
  for (let i = 0; i < layer.indices.length; i++) layer.indices[i] = to[layer.indices[i]];
}

/** LVN3: the LVN2 body, once per layer, behind a layer table. Nothing about
 * how a layer's bytes are laid out changed, so the decoder is one loop around
 * the parser that already shipped. */
/** The Morton reorder over every layer that asked for one.
 *
 * It runs before the occlusion pass rather than inside `writeAsset`, and that
 * order is load-bearing rather than tidy. The pass jitters its sample sets on
 * the vertex index, so keying it to the order the asset actually SHIPS in is
 * what lets both channels be recomputed from the .bin alone by anyone who
 * wants to check them. Sorted afterwards, they could only ever be checked
 * against the baker's own memory. */
function sortLayers() {
  for (const layer of LAYERS) if (layer.morton && layer.indices.length > 0) mortonSort(layer);
}

function writeAsset() {
  const layers = LAYERS.filter((layer) => layer.indices.length > 0);
  const blocks = layers.map((layer) => {
    const vertCount = layer.positions.length / 3;
    const use32 = vertCount > 65535;
    let perVertex = 6; // the three Int16 position slots every layer carries
    for (const bit of [ATTR_FADE, ATTR_SHADE, ATTR_DIST, ATTR_BASE, ATTR_MAT, ATTR_SUN, ATTR_AO]) {
      if (layer.attrMask & bit) perVertex += ATTR_BYTES[bit];
    }
    const head = vertCount * perVertex;
    const pad = (4 - (head % 4)) % 4;
    const body = head + pad + layer.indices.length * (use32 ? 4 : 2);
    /* every layer block starts 4-byte aligned, so a typed-array view over any
     * layer's indices is legal however the layer before it ended */
    return { layer, vertCount, use32, head, pad, bytes: body + ((4 - (body % 4)) % 4) };
  });
  const bodyOffset = 16 + layers.length * 24;
  const buffer = Buffer.alloc(bodyOffset + blocks.reduce((sum, b) => sum + b.bytes, 0));
  buffer.writeUInt32LE(0x334e564c, 0); // "LVN3"
  buffer.writeUInt32LE(layers.length, 4);
  buffer.writeUInt32LE(0, 8); // flags, reserved
  buffer.writeUInt32LE(bodyOffset, 12);

  let bodyAt = 0;
  blocks.forEach((block, i) => {
    const { layer, vertCount, use32, head, pad } = block;
    const record = 16 + i * 24;
    buffer.writeUInt16LE(layer.classId, record);
    buffer.writeUInt8(layer.material, record + 2);
    buffer.writeUInt8(layer.drawOrder, record + 3);
    buffer.writeUInt8(layer.attrMask, record + 4);
    buffer.writeUInt8(Y_UNIT, record + 5);
    buffer.writeUInt8(use32 ? 1 : 0, record + 6);
    buffer.writeUInt8(0, record + 7); // pad
    buffer.writeUInt32LE(vertCount, record + 8);
    buffer.writeUInt32LE(layer.indices.length, record + 12);
    buffer.writeUInt32LE(bodyAt, record + 16);
    buffer.writeUInt32LE(bodyAt + head + pad, record + 20);

    let at = bodyOffset + bodyAt;
    for (let k = 0; k < layer.positions.length; k++) {
      buffer.writeInt16LE(Math.max(-32768, Math.min(32767, layer.positions[k])), at);
      at += 2;
    }
    /* channels in the container's fixed order, only the ones attrMask claims */
    if (layer.attrMask & ATTR_FADE) {
      for (let k = 0; k < layer.fades.length; k++) buffer.writeUInt8(layer.fades[k], at++);
    }
    if (layer.attrMask & ATTR_SHADE) {
      for (let k = 0; k < layer.shades.length; k++) buffer.writeUInt8(layer.shades[k], at++);
    }
    if (layer.attrMask & ATTR_DIST) {
      for (let k = 0; k < layer.dists.length; k++) {
        buffer.writeInt16LE(layer.dists[k], at);
        at += 2;
      }
    }
    if (layer.attrMask & ATTR_BASE) {
      for (let k = 0; k < layer.bases.length; k++) buffer.writeUInt8(layer.bases[k], at++);
    }
    if (layer.attrMask & ATTR_MAT) {
      for (let k = 0; k < layer.mats.length; k++) buffer.writeUInt8(layer.mats[k], at++);
    }
    if (layer.attrMask & ATTR_SUN) {
      for (let k = 0; k < layer.suns.length; k++) buffer.writeUInt8(layer.suns[k], at++);
    }
    if (layer.attrMask & ATTR_AO) {
      for (let k = 0; k < layer.aos.length; k++) buffer.writeUInt8(layer.aos[k], at++);
    }
    at += pad;
    for (let k = 0; k < layer.indices.length; k++) {
      if (use32) buffer.writeUInt32LE(layer.indices[k], at);
      else buffer.writeUInt16LE(layer.indices[k], at);
      at += use32 ? 4 : 2;
    }
    bodyAt += block.bytes;
  });

  const gz = gzipSync(buffer, { level: 9 });
  const outDir = "public/prototype/layline/venues";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${venueId}.bin`), gz);
  const vertCount = blocks.reduce((sum, b) => sum + b.vertCount, 0);
  const triCount = layers.reduce((sum, layer) => sum + layer.indices.length / 3, 0);
  const manifest = {
    id: venueId,
    origin: venue.origin,
    bearing: venue.bearing,
    clipRadius: CLIP_R,
    dataVersion: new Date().toISOString().slice(0, 10),
    sources: {
      coastline: "OpenStreetMap via Overpass API",
      buildings: "OpenStreetMap via Overpass API (LA County LiDAR heights)",
      elevation: `Mapzen Terrarium z${DEM_ZOOM} (AWS Open Data)`,
      horizon: `Mapzen Terrarium z${CURTAIN_MID_ZOOM}/z${CURTAIN_FAR_ZOOM} ray march to ${
        CURTAIN_FAR_TO / 1000
      } km (AWS Open Data)`,
    },
    attribution: venue.attribution,
    /* What bakeOcclusion() was run with. The seed is the only input to the
     * two channels that is not the mesh itself, so it is recorded here: a
     * rebake at a different seed changes bytes for no visible reason, and
     * this is where that shows up. */
    occlusion: {
      seed: OCCLUSION_SEED,
      supportSamples: SUPPORT_SAMPLES,
      ambientRaysPerSample: AO_RAYS,
      ambientRange: AO_RANGE,
      sunAngularRadiusDeg: Number((SUN_ANG_RADIUS / DEG).toFixed(4)),
      sunRange: occlusionRange,
    },
    /* The committed data products this bake consumed, each pinned by its own
     * valuesSha256, so a product refresh cannot ship stale baked geometry:
     * tests/layline-venue-asset.test.ts holds this block and the committed
     * files to agree (codex round-1 P2). */
    products: Object.fromEntries(
      Object.entries(PRODUCTS)
        .filter(([, json]) => json)
        .map(([name, json]) => [name, json.valuesSha256]),
    ),
    stats: {
      vertices: vertCount,
      triangles: triCount,
      bytes: gz.length,
      layers: layers.map((layer, i) => ({
        classId: layer.classId,
        name: layer.name,
        vertices: blocks[i].vertCount,
        triangles: layer.indices.length / 3,
      })),
    },
  };
  writeFileSync(join(outDir, `${venueId}.json`), JSON.stringify(manifest, null, 2) + "\n");
  for (const block of blocks) {
    console.log(
      `  layer ${block.layer.classId} ${block.layer.name}: ${block.vertCount} verts, ` +
        `${block.layer.indices.length / 3} tris, ${block.bytes} raw bytes`,
    );
  }
  console.log(
    `asset: ${layers.length} layers, ${vertCount} verts, ${triCount} tris, ${buffer.length} raw, ${gz.length} gzipped`,
  );
}

function writeDebugSvg(rings) {
  const S = 0.05;
  const path = rings
    .map(
      (ring) =>
        "M" +
        ring.map((p) => `${(p.x * S).toFixed(1)},${(-p.y * S).toFixed(1)}`).join("L") +
        "Z",
    )
    .join(" ");
  const r = CLIP_R * S;
  writeFileSync(
    `.tmp/venue-${venueId}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-r} ${-r} ${2 * r} ${2 * r}">
<rect x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}" fill="#123"/>
<circle cx="0" cy="0" r="${r}" fill="#124a6b"/>
<path d="${path}" fill="#3a4a3a" stroke="#fff" stroke-width="0.5" fill-rule="evenodd"/>
<rect x="${-35 * S}" y="${-100 * S}" width="${70 * S}" height="${100 * S}" fill="none" stroke="#ff0" stroke-width="1"/>
</svg>
`,
  );
}

/* -------------------------------------------------------------------- main */

const overpass = await fetchOverpass();
const massingWays = (await fetchMassing()).elements.filter(
  (e) => e.type === "way" && e.geometry && e.tags?.height,
);
const infraWays = (await fetchInfrastructure()).elements.filter(
  (e) => e.type === "way" && e.geometry,
);
const heroAnchors = venue.heroes ? (await fetchHeroAnchors()).elements : [];
console.log(
  `overpass Q2/Q3/Q5: ${massingWays.length} tall buildings, ${infraWays.length} infra ways, ` +
    `${heroAnchors.length} hero anchors`,
);
await prefetchDem();

const coastWays = overpass.elements.filter(
  (e) => e.type === "way" && e.tags?.natural === "coastline",
);
const breakwaterWays = overpass.elements.filter(
  (e) => e.type === "way" && e.tags?.man_made === "breakwater" && e.geometry,
);
const craneNodes = overpass.elements
  .filter((e) => e.type === "node" && e.tags?.man_made === "crane")
  .map((e) => project(e.lat, e.lon));
const craneWays = overpass.elements
  .filter((e) => e.type === "way" && e.tags?.man_made === "crane" && e.geometry)
  .map((e) => {
    const pts = e.geometry.map((g) => project(g.lat, g.lon));
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return { x: cx, y: cy };
  });
const coastlineIds = new Set(coastWays.map((w) => w.id));
/* Before any height is sampled: the THUMS islands' own published ground, so
 * the z11 spikes over them cannot reach L1 or the heroes standing on it. */
for (const island of venue.heroes?.islands ?? []) {
  const way = coastWays.find((w) => w.id === island.way);
  if (!way) continue;
  const ele = Number.parseFloat(way.tags?.ele);
  const max = Math.max(Number.isFinite(ele) ? ele : 0, MIN_SHORE_H);
  heightClamps.push({ name: island.name, max, box: clampedGroundRing(ringOf(way)) });
  console.log(`height clamp: ${island.name} island capped at ${max} m (OSM ele ${way.tags?.ele})`);
}
console.log(
  `overpass: ${coastWays.length} coastline ways, ${breakwaterWays.length} breakwaters, ${
    craneNodes.length + craneWays.length
  } cranes`,
);

const chains = assembleChains(coastWays);
console.log(`chains: ${chains.length} after endpoint joining`);

const closed = [];
const open = [];
for (const chain of chains) {
  const clipped = clipChain(chain);
  closed.push(...clipped.closed);
  open.push(...clipped.open);
}
console.log(`clip: ${closed.length} closed rings, ${open.length} open chains`);
for (const chain of open) {
  const r0 = Math.hypot(chain[0].x, chain[0].y);
  const r1 = Math.hypot(chain[chain.length - 1].x, chain[chain.length - 1].y);
  console.log(
    `  chain ${chain.length} pts, start r=${Math.round(r0)} (${Math.round(chain[0].x)},${Math.round(
      chain[0].y,
    )}), end r=${Math.round(r1)} (${Math.round(chain[chain.length - 1].x)},${Math.round(
      chain[chain.length - 1].y,
    )})`,
  );
}

let rings = closed.concat(closeAgainstCircle(open));
rings = rings
  .map((ring) => {
    const area = signedArea(ring);
    if (area < 0) return null; // water ring (a lake); the sea handles itself
    return ring;
  })
  .filter(Boolean)
  .map(simplify)
  .filter((ring) => ring.length >= 3 && Math.abs(signedArea(ring)) > 400);
const beforeSlivers = rings.length;
/* Douglas-Peucker on a spit pulls its two sides together, so the sliver filter
 * has to run after simplification, not before it. */
rings = rings.flatMap((ring) => splitPinches(ring));
if (process.env.BAKE_DEBUG) {
  for (const ring of rings) {
    if (substantial(ring)) continue;
    const area = signedArea(ring);
    let cx = 0;
    let cy = 0;
    for (const p of ring) {
      cx += p.x / ring.length;
      cy += p.y / ring.length;
    }
    console.log(
      `  dropped n=${ring.length} area=${Math.round(area)} width=${(
        (2 * area) / perimeter(ring)
      ).toFixed(1)} at r=${Math.round(Math.hypot(cx, cy))} (${Math.round(cx)},${Math.round(cy)})`,
    );
  }
}
rings = rings.filter(substantial);
const rejoined = mergeSplitChords(rings);
rings = rejoined.rings;
const totalVerts = rings.reduce((s, r) => s + r.length, 0);
/* The other half of the round-2b latent: buildLand unfolds a self-crossing
 * CREST and has never checked the ring the crest is offset from. earcut wants a
 * simple ring and returns overlapping triangles for one that is not, which is a
 * cap folded over itself: invisible in plan, a value break at a grazing camera.
 * Simplification and the pinch split both run before this, so a crossing here
 * is theirs and belongs at the top of the log rather than in the geometry. */
const crossing = rings.filter((ring) => selfCrossingVerts(ring).size > 0);
if (crossing.length > 0) {
  throw new Error(
    `${crossing.length} of ${rings.length} land rings cross themselves after simplify and the pinch split; earcut would fold their caps`,
  );
}
console.log(
  `rings: ${rings.length} land rings, ${totalVerts} verts after simplify and sliver filter (${beforeSlivers} before), ${rejoined.merges} pinch splits rejoined, all simple`,
);

/* coast distance by bearing, to sanity-check the course window */
const report = [];
for (let deg = 0; deg < 360; deg += 30) {
  const dx = Math.sin(deg * DEG);
  const dy = Math.cos(deg * DEG);
  let d = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      /* ray from origin against segment */
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const denom = dx * ey - dy * ex;
      if (Math.abs(denom) < 1e-9) continue;
      const t = (a.x * ey - a.y * ex) / denom;
      const s = (a.x * dy - a.y * dx) / -denom;
      if (t > 0 && s >= 0 && s <= 1) d = Math.min(d, t);
    }
  }
  report.push(`${deg}:${d === Infinity ? "open" : Math.round(d)}`);
}
console.log(`coast distance by course bearing (m): ${report.join(" ")}`);

writeDebugSvg(rings);
const boxes = ringBoxes(rings);
/* The height field first, then the geometry: the crest ring reads the same
 * filtered lattice the relief is drawn from, so the two cannot disagree. */
buildReliefField(boxes);
into(L_TERRAIN, () => {
  buildLand(rings);
  buildRelief();
  buildBreakwaters(breakwaterWays, coastlineIds);
});
/* L1 is complete here and nothing after this adds to it, so the surface every
 * later layer stands on is now a fixed set of triangles. */
buildTerrainIndex();
into(L_MASSING, () => buildMassing(massingWays));
into(L_PORT, () => buildPort(craneNodes.concat(craneWays), infraWays, rings, boxes));
into(L_HEROES, () => buildHeroes(coastWays, heroAnchors));
await prefetchCurtainDem();
into(L_CURTAIN, () => buildCurtain());
/* Every builder has run, so the venue is a fixed set of triangles now and can
 * be asked what it shades. The sort comes first so the occlusion pass keys its
 * jitter to the shipped vertex order. */
sortLayers();
bakeOcclusion();
writeAsset();
