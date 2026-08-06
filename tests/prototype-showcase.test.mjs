import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const files = {
  page: new URL("../src/app/prototype/showcase/page.tsx", import.meta.url),
  css: new URL("../src/app/prototype/showcase/showcase.module.css", import.meta.url),
  app: new URL("../src/components/showcase/ShowcaseApp.tsx", import.meta.url),
  loader: new URL("../src/components/showcase/ShowcaseLoader.tsx", import.meta.url),
  scene: new URL("../src/components/showcase/ShowcaseScene.tsx", import.meta.url),
  data: new URL("../src/components/showcase/data.ts", import.meta.url),
  icon: new URL("../src/app/icon.svg", import.meta.url),
  gallery: new URL("../public/prototype/index.html", import.meta.url),
};

async function source(name) {
  return readFile(files[name], "utf8");
}

test("showcase route exposes the clean-room experience", async () => {
  const [page, app, data] = await Promise.all([
    source("page"),
    source("app"),
    source("data"),
  ]);

  assert.match(page, /ShowcaseApp/);
  assert.match(app, /Get started/i);
  assert.match(app, /data-ready=\{ready\}/);
  assert.match(app, /data-entry-settled=\{entrySettled\}/);
  assert.match(app, /className=\{styles\.entryGate\}/);
  assert.match(app, /data-entering=\{entered\}/);
  assert.match(app, /ready\s*&&\s*!entrySettled/);
  assert.doesNotMatch(app, /className=\{styles\.entryCluster\}/);
  assert.match(app, /STEP INTO/);
  assert.match(app, /FULLBUILD 2026/);
  assert.match(app, /INTERACTIVE/);
  assert.match(app, /SYSTEMS AT SCALE/);
  assert.doesNotMatch(
    app.match(/<section className=\{styles\.starter\}[\s\S]*?<\/section>/)?.[0] ?? "",
    /enterButton/,
  );
  assert.match(app, /WITH US IT HAPPENS/);
  assert.match(app, /aria-expanded/);
  assert.match(app, /<noscript>/);
  assert.match(data, /TRACK_SCREENS\s*=\s*17/);
  assert.equal((data.match(/\bid:\s*"/g) ?? []).length, 9);
});

test("showcase scene is deterministic, disposable, and captureable", async () => {
  const scene = await source("scene");

  assert.match(scene, /function EntrySculpture/);
  assert.match(scene, /entrySettled/);
  assert.match(scene, /onPointerEnter/);
  assert.match(scene, /hoverMix/);
  assert.doesNotMatch(scene, /Math\.random/);
  assert.match(scene, /seededRandom/);
  assert.match(scene, /dispose\(\)/);
  assert.match(scene, /__showcaseCapture/);
  assert.match(scene, /setFrameloop/);
  assert.match(scene, /prefers-reduced-motion/);
});

test("field carries four debris populations and a crystal-anchored radiation wash", async () => {
  const scene = await source("scene");

  // one uniform tetra field was the whole defect; motes, occluders, shards and the big
  // grey-white slabs are the fix
  assert.match(scene, /OCCLUDER_COUNT/);
  assert.match(scene, /SHARD_COUNT/);
  assert.match(scene, /SLAB_COUNT/);
  assert.match(scene, /octahedronGeometry/);
  assert.match(scene, /function RadiationGlow/);
  assert.match(scene, /getWorldDirection/);

  // stars must carry a round sprite, never bare square GL points
  assert.match(scene, /usePointSprite/);
  assert.match(scene, /STAR_BOKEH_COUNT/);
  assert.doesNotMatch(scene, /pointsMaterial(?![^>]*map=)/);

  // the wash follows whichever crystal owns the screen; a camera-parked centre read as a
  // lamp behind the lens
  assert.match(scene, /heroAnchorRef/);
  assert.match(scene, /anchor\.weight = 0;/);
  assert.match(scene, /heroPoint\.copy\(group\.position\)\.project\(camera\)/);

  // fringing belongs to geometry edges, not to a pass over the whole frame
  assert.match(scene, /DEBRIS_FRAGMENT_SHADER/);
  assert.match(scene, /vec3 fringe = mix\(/);

  // The corridor stands down behind the entry plate. The reference frames the whole freeze
  // against a clean cobalt opening with nothing drifting through it, so the field ducks out
  // as the flood blooms and is fully back before the 3s handover. It fades to black rather
  // than to transparent, so no population changes which pass it renders in.
  assert.match(scene, /uniform float uFade;/);
  assert.match(scene, /debrisMaterials\.current\.forEach/);
  assert.match(scene, /MathUtils\.smoothstep\(since, 2\.15, 2\.8\)/);
  // and it is written through the live materials, since R3F keeps its own copy of the
  // uniforms prop and a scalar written to the authored object never reaches the shader
  assert.match(scene, /debrisMaterials\.current\[0\] = node;/);
  assert.match(scene, /debrisMaterials\.current\[1\] = node;/);
});

test("ambience runs a chapter arc instead of one long dimmer", async () => {
  const scene = await source("scene");

  const arc = scene.match(/CHAPTER_AMBIENCE = \[([^\]]*)\]/);
  assert.ok(arc, "CHAPTER_AMBIENCE should be declared");
  const levels = arc[1].split(",").map((value) => Number(value.trim()));
  assert.equal(levels.length, 9, "one room level per chapter");
  assert.ok(levels.every((value) => Number.isFinite(value) && value > 0));
  // The defect was a flat journey. Neighbouring chapters have to differ by a lot, and the
  // brightest room has to run at least ten times the darkest.
  assert.ok(
    Math.max(...levels) / Math.min(...levels) >= 10,
    "the arc must swing at least ten to one across the journey",
  );
  assert.match(scene, /function ambienceAt/);
});

test("the landing frame stands alone and no approach ever collapses to a speck", async () => {
  const [scene, data] = await Promise.all([source("scene"), source("data")]);

  // The opening shot is a portrait. Every chapter but the first waits further out until
  // the reader has left the landing stop, so the second crystal is not parked in the corner.
  const hold = scene.match(
    /const landingHold = index === 0 \? 0 : 1 - MathUtils\.smoothstep\(progress, ([\d.]+), ([\d.]+)\)/,
  );
  assert.ok(hold, "the landing hold should exempt the opening chapter");
  const releaseAt = Number(hold[2]);
  const secondCentre = Number(
    data.match(/PROJECT_CENTERS = \[\s*0,\s*([\d.]+)/)?.[1] ?? Number.NaN,
  );
  assert.ok(
    releaseAt > 0 && releaseAt < secondCentre,
    "the hold must be fully released before chapter two reaches its own stop",
  );

  // The hold has to reach the visibility window too, or the crystal it pushes back stays
  // on screen at the landing stop anyway.
  assert.match(scene, /const approaching = offset > 0 \? offset \+ landingHold \* [\d.]+ : 0;/);
  assert.match(scene, /group\.visible = entered && offset > -0\.56 && approaching < 1\.4/);

  // The quartic setback saturates instead of running away, so the chapter after next
  // reads as a small object at a handoff stop rather than a thirty pixel dot.
  assert.match(scene, /const approachSetback = setbackCeiling \* \(1 - Math\.exp\(/);
  const ceilings = scene
    .match(/const setbackCeiling = mobile \? ([\d.]+) : ([\d.]+);/)
    ?.slice(1)
    .map(Number);
  assert.ok(ceilings, "the setback needs a declared ceiling per layout");
  assert.ok(
    ceilings.every((value) => Number.isFinite(value) && value > 0),
    "every ceiling has to be a finite depth",
  );

  // One setback curve serves nine shells, so at a handoff stop the apparent size of the
  // incoming chapter was decided by how wide its own silhouette happens to be. Past the
  // far edge of an approach the scale eases toward one common apparent width.
  const band = scene.match(
    /const farBand = MathUtils\.smoothstep\(approaching, ([\d.]+), ([\d.]+)\);/,
  );
  assert.ok(band, "the far band needs a declared easing window");
  const [, bandFrom, bandTo] = band.map(Number);
  assert.ok(
    bandFrom > 0.5 && bandTo > bandFrom,
    "the far band has to be an easing window that leaves the near approach alone",
  );
  assert.match(
    scene,
    /const farNormal = MathUtils\.lerp\(\s*1,\s*FAR_BAND_EXTENT \/ Math\.max\([\d.]+, shellExtent\.x\),\s*farBand,\s*\);/,
  );
  // and it has to reach the scale, not sit in a variable nothing reads
  assert.match(scene, /approachPhase,\s*\) \* farNormal;/);
  const reference = Number(scene.match(/const FAR_BAND_EXTENT = ([\d.]+);/)?.[1] ?? Number.NaN);
  assert.ok(
    reference > 0.6 && reference < 2,
    "the far band reference has to sit inside the range of shell half widths",
  );
});

test("grain lifts blacks without premultiplying, and spikes only on entry", async () => {
  const [scene, css] = await Promise.all([source("scene"), source("css")]);

  assert.match(scene, /premultiply=\{false\}/);
  assert.match(scene, /BlendFunction\.SCREEN/);
  assert.match(scene, /function entrySpike/);
  assert.match(scene, /GRAIN_SPIKE_GAIN/);

  // The analog floor is a blue speckle screened over a true black. Soft-light is a no-op
  // on zero, which is exactly where the reference is grainiest.
  // the shared positioning block carries no paint, so pick the rule that does
  const speckle = css.match(/\.scene::after \{[^{}]*background-image:[^{}]*\}/)?.[0] ?? "";
  assert.match(speckle, /mix-blend-mode: screen/);
  assert.match(speckle, /rgb\(0 0 255/);
  assert.doesNotMatch(speckle, /mix-blend-mode: soft-light/);
  // and it is vignetted, the way the reference keeps its frame edges at zero
  assert.match(speckle, /mask-image: radial-gradient/);

  // Screen blending means any non-black outer stop is a lift on the entire frame.
  const tint = css.match(/\.scene::before \{[^{}]*background:[^{}]*\}/)?.[0] ?? "";
  assert.match(tint, /rgb\(0 0 0 \/ 91%\)/);
  assert.doesNotMatch(tint, /rgb\(0 0 11/);

  // the grain rides the linear buffer, so the settled opacity has to stay in thousandths
  const grain = scene.match(/GRAIN_BASE_OPACITY\s*=\s*([\d.]+)/);
  assert.ok(grain, "GRAIN_BASE_OPACITY should be declared");
  assert.ok(Number(grain[1]) < 0.01, "settled grain opacity must stay below 0.01");

  // chromatic aberration small enough that an isolated dark pixel stays one dot
  const chroma = scene.match(/CHROMATIC_BASE\s*=\s*\{\s*x:\s*([\d.]+)/);
  assert.ok(chroma, "CHROMATIC_BASE should be declared");
  assert.ok(Number(chroma[1]) < 0.002, "base chromatic offset must stay under 0.002");
  /*
   * And it is held off everything but the outer frame. This pass reads red one way along the
   * offset and blue the other, so every hard edge it crosses gets a red rim on one side, and
   * on a field with no warmth anywhere else that rim is the only thing in frame that is not
   * cobalt: on the burst frames it put nearly a per cent of the lit pixels past ten counts of
   * red over blue, worst at 132 red against 38 blue, on the artifact's own panels coming
   * apart. The radial ramp starts at this radius in half-diagonals, and nothing inside it
   * splits at all, so a third of the way out from centre is the middle of the frame and
   * exactly where the debris lives.
   */
  const modulation = Number(scene.match(/const CHROMATIC_MODULATION = ([\d.]+);/)?.[1]);
  assert.ok(Number.isFinite(modulation), "the radial ramp needs a declared start");
  assert.ok(modulation >= 0.8, "a ramp that opens this early splits the middle of the frame");
});

test("the analog floor is a seeded dot lattice, not a repeating weave", async () => {
  const [app, css] = await Promise.all([source("app"), source("css")]);

  /*
   * Measured on the reference: single pixels of rgb(0 0 96) over a true black, sitting on
   * the even/even sublattice. Repeating gradients cannot place isolated pixels, so the
   * tiled version of this laid some blue on every pixel in the frame, which is why the
   * corners measured lifted where the reference is at zero and why the grain decorrelated
   * inside one pixel where the reference survives a two pixel step.
   */
  assert.match(app, /function makeGrainTile/);
  assert.match(app, /createImageData\(GRAIN_TILE, GRAIN_TILE\)/);
  // seeded from the same generator the scene uses, so every load draws the same field
  assert.match(app, /seededRandom\(hashSeed\("showcase-analog-floor"\)\)/);
  const tile = app.match(/function makeGrainTile[\s\S]*?[\r\n]\}/)?.[0];
  assert.ok(tile, "makeGrainTile should be a top level function");
  assert.doesNotMatch(tile, /Math\.random/);
  // the lattice itself: both loops step two, and the minority sublattice is the odd one
  assert.match(app, /for \(let y = 0; y < GRAIN_TILE; y \+= 2\)/);
  assert.match(app, /for \(let x = 0; x < GRAIN_TILE; x \+= 2\)/);
  assert.match(app, /GRAIN_ODD_SHARE/);
  assert.match(app, /"--showcase-grain": `url\("\$\{grainTile\}"\)`/);

  // and the stylesheet takes the tile at its natural size: resampling a dot lattice smears
  // it back into the weave this replaced
  const speckle = css.match(/\.scene::after \{[^{}]*background-image:[^{}]*\}/)?.[0] ?? "";
  assert.match(speckle, /background-image: var\(\s*--showcase-grain,/);
  assert.match(speckle, /background-size: auto/);
  assert.doesNotMatch(speckle, /background-size: \d/);
});

test("the room grades its objects, and the wash reaches a real zero", async () => {
  const scene = await source("scene");

  // The ambience arc used to grade the fog, the ground and the radiation but not the
  // debris, so the darkest chapters still carried a field of near-white plates.
  assert.match(scene, /function roomLight/);
  assert.match(scene, /roomLight\(progress\)/);
  const floor = scene.match(/return ([\d.]+) \+ [\d.]+ \* MathUtils\.smoothstep\(ambienceAt/);
  assert.ok(floor, "roomLight should declare its floor");
  assert.ok(Number(floor[1]) > 0, "a dark chapter is still a lit corridor, never black");

  // A gaussian never reaches zero and the sRGB encode turns whatever is left of one into
  // twenty counts of navy in every corner, so the wash carries a finite window.
  assert.match(scene, /float reach = 1\.0 - smoothstep\(/);
  assert.match(scene, /\* reach \* uOpacity/);

  // The ground never rides the arc past unity: a flooded chapter is flooded around its
  // object, not across its backdrop.
  assert.match(scene, /multiplyScalar\(Math\.min\(1, ambience\)/);

  // The wash arrives with the transition rather than on the click, and it reads wall time
  // so the capture hook's frameloop switch cannot send the ramp back to zero.
  assert.match(scene, /const arrival = enteredAt\.current === null/);
  assert.match(scene, /\(performance\.now\(\) - enteredAt\.current\) \/ 1000, 0\.55/);
});

test("the field carries chromatic slivers and the finale declares every uniform", async () => {
  const scene = await source("scene");

  // The reference field is peppered with tiny violet and cyan splinters, and they are most
  // of what gives the back half of the journey its colour.
  assert.match(scene, /SLIVER_COUNT/);
  assert.match(scene, /FINALE_SLIVER_COUNT/);
  assert.match(scene, /hashSeed\("showcase-slivers"\)/);
  assert.match(scene, /hashSeed\("showcase-finale-slivers"\)/);
  assert.match(scene, /debrisMaterials\.current\[2\] = node;/);

  // The finale plates share the corridor's shader, so they have to declare its uFade.
  // Leaving it out only worked because three.js reuses one program for both materials.
  const plate = scene.match(/const plateUniforms = useMemo\(\(\) => \(\{[\s\S]*?\}\), \[\]\);/)?.[0] ?? "";
  assert.match(plate, /uFade: \{ value: 1 \}/);
});

test("showcase ships nine repository-owned project captures", async () => {
  const media = [
    "fault-line",
    "assembly-line",
    "burn-in",
    "quench",
    "fahrzeugmarkt",
    "loop-zero",
    "threadline",
    "morrow",
    "dead-low",
  ];

  for (const name of media) {
    const asset = new URL(`../public/prototype/showcase/media/${name}.webp`, import.meta.url);
    const details = await stat(asset);
    assert.ok(details.size > 7_000, `${name} media should be a substantive local capture`);
  }
});

test("showcase CSS contains the binding contract and responsive floor", async () => {
  const css = await source("css");

  assert.match(css, /DESIGN CONTRACT/);
  assert.match(css, /--showcase-blue:\s*#0004eb/i);
  assert.match(css, /1700svh/);
  assert.match(css, /@media\s*\(max-width:\s*767px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);

  // The manifesto's tracking is inherited as a computed length, so a -0.062em display
  // value lands as -4.6px on the small stack and folds every glyph into its neighbour.
  // Both the tracking and the pixel-wide chromatic shadow have to be reset there.
  const heroMeta = css.match(/\.heroMeta \{[^{}]*\}/)?.[0] ?? "";
  assert.match(heroMeta, /letter-spacing: 0\.05em/);
  assert.match(heroMeta, /line-height: 2\.3/);
  assert.match(heroMeta, /text-shadow: -0\.5px 0/);

  // ENTRY BLACK POINT. The world layer is crushed through the opening so its field is a
  // pure blue channel over a zero, the way the reference reads anywhere off the artifact.
  // It carries the bleach term with it, or a pointer resting on a control during the
  // opening would stop draining the world.
  const crush = css.match(
    /\.shell:not\(\[data-entry-settled="true"\]\) \.scene \{[^{}]*\}/,
  )?.[0] ?? "";
  assert.match(crush, /filter: grayscale\(var\(--showcase-bleach, 0\)\) contrast\(([\d.]+)\)/);
  assert.ok(
    Number(crush.match(/contrast\(([\d.]+)\)/)?.[1]) > 1,
    "the crush has to lower the black point, never raise it",
  );

  // And it has to be released on its own clock, before the entrySettled handover rather
  // than at it, or the flip that is meant to be invisible would brighten the whole field.
  const release = css.match(/\.shell\[data-entered="true"\]:not\(\[data-entry-settled="true"\]\) \.scene \{[^{}]*\}/)?.[0] ?? "";
  const duration = Number(release.match(/animation: entryBlackPoint (\d+)ms/)?.[1] ?? Number.NaN);
  assert.ok(
    duration > 0 && duration <= 2700,
    "the black point has to be back to neutral well before the 3s handover",
  );
  assert.match(css, /@keyframes entryBlackPoint \{[\s\S]*?contrast\(1\);[\s\S]*?\n\}/);
});

test("bleach answers to the pointer alone, never to scroll position", async () => {
  const [app, css, scene] = await Promise.all([
    source("app"),
    source("css"),
    source("scene"),
  ]);

  // One trigger: dwell on a control. A scroll threshold would drain the second act
  // under a neutral pointer, which the source never does.
  assert.doesNotMatch(app, /BLEACH_SCROLL/);
  assert.match(app, /const bleach = controlDwell \? 1 : 0;/);
  assert.match(app, /BLEACH_CONTROL = "a\[href\], button"/);
  assert.match(app, /control\.closest\(`\.\$\{styles\.entryGate\}`\)/);
  assert.doesNotMatch(scene, /bleached(Ground|Fog)/);

  // The control under the cursor keeps its colour, so it can never sit inside a
  // filtered wrapper.
  assert.match(css, /\.shell\[data-bleaching="true"\] \.projectRow button:hover/);
  assert.match(css, /\.ledger\[data-visible="true"\] \.projectRow button \{\s*pointer-events: auto;/);
  assert.doesNotMatch(css, /\.shell\[data-bleaching="true"\] \.ledger,/);

  // The ledger CTA is spoken as unavailable, never natively disabled. Browsers are free to
  // swallow pointer events on a disabled form control, and this button is one of the
  // anchors the drain listens to.
  const ledgerCta = app.split("View case study")[0]?.split("<button").pop() ?? "";
  assert.match(ledgerCta, /aria-disabled="true"/);
  assert.match(ledgerCta, /tabIndex=\{-1\}/);
  assert.match(ledgerCta, /onClick=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.doesNotMatch(ledgerCta, /\sdisabled[\s>]/);

  // A control can be unmounted out from under a resting cursor, so the drain re-checks what
  // the pointer is really on once a scroll settles instead of waiting for a pointerout that
  // will never arrive.
  assert.match(app, /BLEACH_VERIFY_MS/);
  assert.match(app, /document\.elementFromPoint\(clientX, clientY\)/);
  assert.match(app, /window\.addEventListener\("scroll", scheduleVerify/);

  // Same rule on the last screen: hovering a social drains the world and leaves that one
  // link holding radiation blue, which a filter on the whole block would make impossible.
  assert.doesNotMatch(css, /\.shell\[data-bleaching="true"\] \.finale,/);
  assert.match(css, /\.shell\[data-bleaching="true"\] \.socials a,/);
  assert.match(css, /\.shell\[data-bleaching="true"\] \.finale a:hover \{\s*color: var\(--showcase-blue\);/);
});

test("entry artifact is the FullBuild mark built in three dimensions", async () => {
  const [scene, icon] = await Promise.all([source("scene"), source("icon")]);

  // The construction is written in the icon's own viewBox units, so the two can be held
  // against each other directly. These are the paths the mark is made of.
  assert.match(icon, /viewBox="0 0 100 100"/);
  assert.match(icon, /d="M8 82 H92"/);
  assert.match(icon, /d="M18 82 V48 L35 32 L52 48 V82"/);
  assert.match(icon, /d="M52 48 H82 V82"/);
  assert.match(icon, /d="M52 48 L68 32 L82 46"/);
  assert.match(icon, /d="M25 76 l12 -12 M25 66 l9 -9"/);

  // One mapping from viewBox units into world space, flipped once because the viewBox
  // counts downward, and nothing anywhere else does that arithmetic by hand.
  assert.match(scene, /function entryLogoX\(x: number\)/);
  assert.match(scene, /function entryLogoY\(y: number\)/);
  assert.match(scene, /const ENTRY_LOGO_WIDTH = entryLogoX\(92\) - entryLogoX\(8\);/);
  assert.match(scene, /const ENTRY_LOGO_HEIGHT = entryLogoY\(32\) - entryLogoY\(82\);/);
  // The mosaic slab and its plus void are gone, not merely unused.
  assert.doesNotMatch(scene, /ENTRY_SLAB_(WIDTH|HEIGHT)/);
  assert.doesNotMatch(scene, /ENTRY_MOSAIC_MAP/);
  assert.doesNotMatch(scene, /ENTRY_VOID_/);

  // TWO HOUSES, one shed. Both panel grids start and stop on the party wall at x52, and
  // both gables land on the peaks the mark draws: x35 for the drawn half, x68 for the
  // poured one, whose eave comes down two units above the wall head rather than onto it.
  const drawn = scene.match(/const ENTRY_DRAWN_PANELS[\s\S]*?\n\];/)?.[0] ?? "";
  const poured = scene.match(/const ENTRY_POURED_PANELS[\s\S]*?\n\];/)?.[0] ?? "";
  assert.match(drawn, /entryGridPanels\(\[18, 29, 40, 52\], \[48, [\d.]+, [\d.]+, 82\]\)/);
  assert.match(poured, /entryGridPanels\(\[52, [\d.]+, [\d.]+, 82\], \[48, [\d.]+, [\d.]+, 82\]\)/);
  assert.match(drawn, /\[35, 32\]/, "the drawn gable has to peak where the mark peaks");
  assert.match(poured, /\[68, 32\]/, "and so does the poured one");
  assert.match(poured, /\[82, 46\]/, "the poured eave lands above the wall head, not on it");

  // Every panel is extruded off its own outline, so the gables are prisms rather than
  // boxes pretending to be gables. The media skin is cut to the same shape grown by the
  // skin reach: the seam that makes the drawn half read as built tiles is also a hole, and
  // the field came through every join as a lit slot while the skin stopped short of the
  // strokes that bound it.
  assert.match(scene, /new ExtrudeGeometry\(shape, \{ depth, bevelEnabled: false/);
  assert.match(scene, /new ShapeGeometry\(skinShape\)/);
  assert.match(scene, /new EdgesGeometry\(prism\)/);
  const skinReach = Number(scene.match(/const ENTRY_SKIN_REACH = ([\d.]+);/)?.[1]);
  const lineLane = Number(scene.match(/const ENTRY_LINE_LANE = ([\d.]+);/)?.[1]);
  assert.ok(Number.isFinite(skinReach) && Number.isFinite(lineLane));
  /*
   * The skin is a uniform scale about the panel's own centre, so an edge grows by half the
   * reach and two neighbours overlap by the whole of it. Half is what has to stay under the
   * stroke; the whole of it is what closes the join, and holding the reach itself under one
   * lane left the two skins overlapping by four tenths of a pixel, which the panels' own
   * roll walked straight out of.
   */
  assert.ok(
    skinReach / 2 < lineLane,
    "the skin closes onto the strokes and never past them, so it stays under the stroke",
  );
  const panel = scene.match(/function entryPanel\([\s\S]*?\n\}/)?.[0] ?? "";
  const drawnDepth = [...panel.matchAll(/randomBetween\(random, (0\.\d+), (0\.\d+)\)/g)]
    .map(([, from, to]) => [Number(from), Number(to)]);
  assert.equal(drawnDepth.length, 1, "only the drawn half varies its own extrusion");
  /*
   * The pour is one thickness, not a range. Given a range, neighbouring cells stood a
   * hundredth of a unit proud of each other and every step caught the yaw as a dark sliver,
   * which is the tiled wall read a pour is not allowed to have.
   */
  const pouredDepth = Number(scene.match(/const ENTRY_POURED_DEPTH = ([\d.]+);/)?.[1]);
  assert.ok(Number.isFinite(pouredDepth), "the pour needs one declared thickness");
  assert.match(panel, /poured \? ENTRY_POURED_DEPTH : randomBetween/);
  const depths = [...drawnDepth, [pouredDepth, pouredDepth]];
  /*
   * And the band is a rim, not a slab, measured on what it paints rather than on what it
   * is. A surface spanning half a depth either side of a stroke plane laid at L projects
   * (L + depth / 2) * sin(yaw) outside that stroke, so at a twentieth of the house width
   * the extrusion painted a ten pixel band down the outside of the down-tilted contour at
   * every off-centre pointer position: dark it read as a hole cut in the field, bright it
   * read as a second outline misregistered against the drawing, and the level was never
   * what was wrong. A fiftieth is a two pixel edge on a drawn line, which is all the rim is
   * allowed to be. Both halves stay inside one band, or the party wall steps where the two
   * meet.
   */
  const houseWidth = (52 - 18) / 20;
  assert.ok(
    depths.every(([from, to]) => from >= 0.02 && to <= houseWidth * 0.025),
    "the extrusion is a rim on a drawing, never the silhouette itself",
  );

  /*
   * THE POURED HALF IS ONE POUR, AND AT REST IT IS ONE BODY. Held as twelve coplanar cells
   * it read as a lit grid with black seams through it however square they were kept: the
   * boundaries traded the depth buffer and the knit that closed them put every cell's side
   * face inside its neighbour. So the pour is extruded once off the mark's own poured path,
   * the cells are what it shatters into, and the swap happens as the release opens.
   */
  assert.match(
    scene,
    /const ENTRY_POURED_SILHOUETTE[\s\S]*?\[52, 82\], \[52, 48\], \[68, 32\], \[82, 46\], \[82, 82\]/,
  );
  assert.match(scene, /const pouredBody = useMemo/);
  assert.match(scene, /const bodyHeld = burst < [\d.]+;/);
  assert.match(scene, /if \(prism && poured\) prism\.visible = !bodyHeld;/);
  // And nothing animates the pour while it is held: the idle drift moved every cell in z
  // and, through the same term, in pitch, which is a per tile wobble by another name.
  assert.match(scene, /const drift = entered \|\| poured \? 0 :/);
  assert.match(panel, /poured \? 0 : randomBetween\(random, -[\d.]+, [\d.]+\)/);
  assert.match(panel, /rotation: poured\s*\?\s*\[0, 0, 0\]/);

  /*
   * The two media faces are the same face moved apart, never a mirrored pair. A half turn
   * about the centre of an asymmetric gable panel fills exactly the corner the trapezoid
   * leaves empty, so the union of the two faces was the panel's bounding rectangle and torn
   * flags of footage hung past both roof slopes at every pointer angle.
   */
  assert.doesNotMatch(scene, /rotation=\{\[0, Math\.PI, 0\]\}/);

  // THE MATERIAL SPLIT is the whole mark: the drawn half glassy and carrying the media
  // skin, the poured half a near-black solid with a clearcoat and no facet grid on it.
  assert.match(scene, /poured: boolean;/);
  assert.match(scene, /uPoured: \{ value: shard\.poured \? 1 : 0 \}/);
  assert.match(scene, /uniform float uPoured;/);
  assert.match(scene, /color \*= 1\.0 - uPoured;/);
  assert.match(scene, /metalness=\{poured \? [\d.]+ : 0\.94\}/);
  assert.match(scene, /clearcoat=\{poured \? [\d.]+ : 1\}/);
  const restEdge = scene.match(/: poured \? ([\d.]+) : ([\d.]+)\}/);
  assert.ok(restEdge, "the facet line opacity has to split on the material");
  assert.ok(
    Number(restEdge[1]) < Number(restEdge[2]),
    "the poured half never carries the drawn half's facet grid",
  );

  // LINE WORK. The strokes the icon actually draws are drawn here as strokes, at a stroke
  // weight, rather than left to whatever the panel edges happen to give.
  assert.match(scene, /const ENTRY_BASELINE_STROKES[\s\S]*?\[\[8, 82\], \[92, 82\]\]/);
  assert.match(
    scene,
    /const ENTRY_OUTLINE_STROKES[\s\S]*?\[\[18, 82\], \[18, 48\], \[35, 32\], \[52, 48\], \[52, 82\]\]/,
  );
  const hatch = scene.match(/const ENTRY_HATCH_STROKES[\s\S]*?\n\];/)?.[0] ?? "";
  assert.match(hatch, /\[\[25, 76\], \[37, 64\]\]/, "M25 76 l12 -12");
  assert.match(hatch, /\[\[25, 66\], \[34, 57\]\]/, "M25 66 l9 -9");
  assert.match(scene, /const ENTRY_TICK_STROKES/);
  assert.match(
    scene,
    /const ENTRY_POURED_STROKES[\s\S]*?\[\[52, 48\], \[68, 32\], \[82, 46\], \[82, 82\]\]/,
  );
  assert.match(scene, /function pushEntryLane/);
  assert.match(scene, /weight: 3,/);
  assert.match(scene, /rails: true,/);

  /*
   * The strokes have to lie on the volume they trace. Laid out past the extrusion they
   * sheared off the walls under the chase tilt, and the back copy walked out past the
   * silhouette as a second hollow house with its own roof and its own ground line.
   */
  const lineFront = Number(scene.match(/const ENTRY_LINE_FRONT = ([\d.]+);/)?.[1]);
  const faceLift = Number(scene.match(/const ENTRY_FACE_LIFT = ([\d.]+);/)?.[1]);
  const deepest = Math.max(...depths.map(([, to]) => to));
  assert.ok(faceLift > 0.5, "the media face has to clear the prism it rides on");
  assert.ok(
    lineFront >= deepest * faceLift && lineFront <= deepest * 1.2,
    "the stroke plane clears the media face by a hair and never leaves the prism",
  );
  /*
   * And the drawing is drawn once. Full weight strokes go on the front plane alone; the far
   * edge of the extrusion is a separate single lane band, or every roofline reads as two
   * parallel rails and the ground line as three.
   */
  const fullWeight = [...scene.matchAll(/planes: \[([^\]]*)\][^}]*weight: 3/g)];
  assert.ok(fullWeight.length > 0, "the mark still carries full weight strokes");
  assert.ok(
    fullWeight.every(([, planes]) => !planes.includes("-ENTRY_LINE_FRONT")),
    "no stroke is traced at stroke weight on both planes at once",
  );
  assert.match(scene, /const depthLineWork = useMemo/);

  /*
   * AND THE POUR'S OWN SILHOUETTE IS PRESENT ON EVERY ROW OF IT. Three lanes half a pixel
   * apart at half opacity is a stroke whose single lane composites to luminance 106 over
   * this field, which is under what reads as a line at all, so the mark's right hand edge
   * only actually appeared where two lanes happened to round onto the same column: measured
   * row by row it was absent from a quarter of them at the worst pointer position, in runs
   * of up to seven. It stays dimmer than the drawing and it has to carry on one lane.
   */
  const pouredBand = scene.match(/const pouredLineWork = useMemo[\s\S]*?\]\), \[\]\);/)?.[0] ?? "";
  const pouredWeight = Number(pouredBand.match(/weight: (\d+)/)?.[1]);
  assert.ok(pouredWeight >= 4, "the pour's silhouette needs more than a hairline of lanes");
  const restLevels = scene.match(/const lineRest = \[([\d.]+), ([\d.]+), ([\d.]+)\];/);
  assert.ok(restLevels, "the strokes need declared rest levels");
  assert.ok(
    Number(restLevels[2]) >= 0.6,
    "a lane under this composites below the level a stroke has to reach to read",
  );
  assert.ok(
    Number(restLevels[2]) < Number(restLevels[1]),
    "and the pour's outline stays dimmer than the drawn half's",
  );

  /*
   * THE POUR IS A VOLUME THE LIGHT FINDS, NOT A LAMP. Carried outright on the emissive it
   * answered no light at all: three to five distinct colours over nineteen thousand pixels,
   * one of them covering up to 99 per cent of them, at a luminance spread under two counts
   * at every pointer position, beside a drawn half with real depth in it. The albedo has to
   * carry a share the keys can move, and the lobe has to be tight enough that four lights
   * do not average into one flat number.
   */
  const pourAlbedo = scene.match(/const ENTRY_POURED_COLOR = "#([0-9a-fA-F]{6})";/)?.[1];
  assert.ok(pourAlbedo, "the pour needs one declared albedo");
  const albedoRed = parseInt(pourAlbedo.slice(0, 2), 16);
  const albedoBlue = parseInt(pourAlbedo.slice(4, 6), 16);
  assert.ok(albedoBlue >= 48, "an albedo this dark hands the whole value back to the emissive");
  assert.ok(albedoBlue > albedoRed * 2, "and it stays cobalt rather than turning into a grey");
  const pourEmissive = Number(scene.match(/const ENTRY_POURED_EMISSIVE_LEVEL = ([\d.]+);/)?.[1]);
  assert.ok(pourEmissive < 0.7, "an emissive this strong owns every count of the pour");
  const pourRoughness = Number(scene.match(/const ENTRY_POURED_ROUGHNESS = ([\d.]+);/)?.[1]);
  assert.ok(pourRoughness < 0.75, "a lobe this wide averages every key into one flat number");

  /*
   * AND THE STEP BETWEEN THE TWO GABLES MAY NOT SWING. Both apexes are level in the source,
   * so the only thing the tilt is allowed to do is show the mark is a solid. Given a
   * corner's worth of yaw and roll the drawn apex measured 25 pixels above the poured one at
   * one top corner and 24 below it at the other, a fifty pixel swing on a mark 220 tall,
   * with the two houses trading which of them is the larger as it went. Both gains are held
   * where that swing stays inside a stroke's worth either side of level.
   */
  const yawGain = Number(scene.match(/0\.06 \+ cursorX \* ([\d.]+)\)/)?.[1]);
  assert.ok(Number.isFinite(yawGain) && yawGain <= 0.1, "the chase yaw restates the mark's proportions past this");
  const roll = scene.match(/cursorX \* -([\d.]+) \+ cursorY \* ([\d.]+)\)/);
  assert.ok(roll, "the in-plane roll needs declared gains");
  assert.ok(
    Number(roll[1]) <= 0.05 && Number(roll[2]) <= 0.05,
    "roll is what puts one gable above the other, and at a corner both terms add",
  );
});

test("the entry artifact stays cobalt and keeps the atlas props off the mark", async () => {
  const scene = await source("scene");

  /*
   * NOTHING WARM LIGHTS THE MARK. A pair of orange keys used to sit under the artifact and
   * they lit the poured half as a copper lamp with a blown hotspot on it, off the palette
   * every other surface in the piece holds. Every light in the entry canvas is checked
   * rather than the two that were wrong, so the next one cannot be warm either.
   */
  const entryScene = scene.match(/export function ShowcaseEntryScene\([\s\S]*?<\/Canvas>/)?.[0] ?? "";
  assert.ok(entryScene.includes("<EntrySculpture"), "the entry canvas has to hold the mark");
  const lights = [...entryScene.matchAll(/<(\w*[lL]ight)[^>]*color="#([0-9a-fA-F]{6})"/g)];
  assert.ok(lights.length >= 3, "the mark is lit by a key, a fill and an ambient at least");
  for (const [, tag, hex] of lights) {
    const red = parseInt(hex.slice(0, 2), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    assert.ok(blue >= red, `${tag} #${hex} has to sit on the cobalt side of neutral`);
  }

  /*
   * THE ATLAS IS A STILL LIFE, and three of the things standing in it are big glossy
   * spheres with a shading terminator down each one, next to an orange sunset and a gold
   * disc. Cropped at random a panel kept landing on a whole sphere, which reads as a bead
   * stuck to the mark: the same decoration the pearl seats were deleted for. The crop
   * windows are declared, and none of them may touch a prop.
   */
  const bands = [...(scene.match(/const ENTRY_CROP_BANDS[\s\S]*?\n\];/)?.[0] ?? "")
    .matchAll(/\[([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\]/g)]
    .map(([, u0, v0, u1, v1]) => [Number(u0), Number(v0), Number(u1), Number(v1)]);
  assert.ok(bands.length >= 3, "the media needs more than a couple of places to come from");
  // Measured off public/prototype/showcase/media/entry-cinematic-v3.png, in UV.
  const props = [
    [0.07, 0.52, 0.51, 0.97], // the big pearl, top left
    [0.66, 0.28, 1, 0.6], // the second pearl, right
    [0.22, 0.01, 0.49, 0.28], // the glass sphere, bottom centre
    [0.52, 0.62, 0.86, 1], // the orange sunset
    [0, 0.39, 0.3, 0.57], // the gold disc
  ];
  for (const [u0, v0, u1, v1] of bands) {
    assert.ok(u1 > u0 && v1 > v0, "a crop band has to have an area");
    for (const [pu0, pv0, pu1, pv1] of props) {
      assert.ok(
        u0 >= pu1 || u1 <= pu0 || v0 >= pv1 || v1 <= pv0,
        `crop band ${[u0, v0, u1, v1].join(" ")} overlaps a prop the mark must not carry`,
      );
    }
  }
  // And a glitch row cannot slide a sample back out of its window onto one.
  assert.match(scene, /vec2 lo = uCrop\.xy - [\d.]+;/);
  assert.match(scene, /vec2 hi = uCrop\.xy \+ uCrop\.zw \+ [\d.]+;/);
  assert.match(scene, /uv = clamp\(uv, lo, hi\);/);

  /*
   * ONE SKIN, NOT TWELVE EXPOSURES. Windows cut at random out of one uneven still life are
   * twelve different exposures, and the drawn wall read as a checkerboard with panels
   * missing: three or four cells cropped near-black regions and sat dead beside blown
   * neighbours. Metering in the shader off a handful of point taps could not see it, so the
   * plate is read down once on the way in and each cell is fitted to the same level: a crop
   * chosen for how little of it is dead black and how far it sits from its neighbours in the
   * band, then a gain solved over the exact lift the shader raises.
   */
  assert.match(scene, /const shardMedia = useMemo/);
  assert.match(scene, /getImageData\(0, 0, grid, grid\)/);
  assert.match(scene, /const ENTRY_SKIN_LEVEL = [\d.]+;/);
  assert.match(scene, /const ENTRY_SKIN_GAMMA = [\d.]+;/);
  assert.match(scene, /const ENTRY_SKIN_PEDESTAL = [\d.]+;/);
  assert.match(scene, /const score = floor \+ ENTRY_CROP_SPACING \* apart;/);
  assert.match(scene, /uExposure: \{ value: gain \}/);
  assert.match(scene, /uniform float uExposure;/);
  assert.match(scene, /pow\(media \+ [\d.]+, vec3\([\d.]+\)\) \* uExposure/);
  // The candidates are drawn whether or not the plate can be read, so a browser that
  // refuses the canvas still walks the same seeded sequence as one that does not.
  assert.match(scene, /const candidates = Array\.from\(\{ length: ENTRY_CROP_TRIES \}/);

  /*
   * AND THE ONE SKIN IS SEATED ON WHAT THE PLATE STILL CARRIES. A cell keeps the crop with
   * the highest floor over its own mean, and that score is backwards for a window this
   * size: a window that is uniformly dead has a floor equal to its mean and scores a
   * perfect one, so it took the crushed corner of the foil every time and the lower right
   * of the drawn wall came out a flat textureless plate at every pointer position, 99 per
   * cent of it inside one sixteen count bucket. The skin walks its band on a grid instead
   * and keeps the window with the most live texels in it.
   */
  assert.match(scene, /const ENTRY_SKIN_DEAD = [\d.]+;/);
  assert.match(scene, /const ENTRY_SKIN_SEATS = \d+;/);
  assert.match(scene, /if \(value > ENTRY_SKIN_DEAD\) live \+= 1;/);
  assert.match(scene, /const score = live \/ values\.length;/);
  assert.doesNotMatch(scene, /skinSeats/);
  // And the window arrives on the wall unstretched, cut at the drawn sheet's own ratio.
  assert.match(
    scene,
    /ENTRY_SKIN_WINDOW_HEIGHT \* \(ENTRY_SHEET_SIZE\[0\] \/ ENTRY_SHEET_SIZE\[1\]\)/,
  );

  /*
   * NOTHING WARM SURVIVES THE CHANNEL SPLIT EITHER. The split is the plate's own border
   * colour and it stays, but split far enough across a lit edge it lands on salmon, which is
   * a colour the field does not contain anywhere. Red is held to the cool channels rather
   * than removed, so magenta and cyan seams survive and warm ones cannot happen, and the
   * bleach the freeze lays over the top leads on blue rather than on red.
   */
  assert.match(scene, /color\.r = min\(color\.r, max\(color\.g, color\.b\) \* [\d.]+ \+ [\d.]+\);/);
  /*
   * And nothing violet either. Two clamps that only ever push green down leave the magenta
   * axis wide open: with red and blue level and green alone suppressed the lit skin ran
   * five per cent of itself past ten counts of min(r, b) minus g, at a hue near 285 degrees
   * against a field at 241. Green takes a floor against whichever cool channel is lower,
   * which cannot make it lead and cannot let it fall away from both.
   */
  assert.match(scene, /color\.g = max\(color\.g, min\(color\.r, color\.b\) - [\d.]+\);/);
  /*
   * AND THE FLOOR IS A CLAMP, NOT A SEAT. At eighteen thousandths the tear rows below wanted
   * to run further violet than it allowed and every one of their pixels came to rest on it
   * exactly, so a tenth to a seventh of the lit skin measured min(r, b) minus g at four or
   * five counts by construction and no threshold above five could ever fire. A metric that
   * cannot fail is not a metric.
   */
  const greenFloor = Number(
    scene.match(/color\.g = max\(color\.g, min\(color\.r, color\.b\) - ([\d.]+)\);/)?.[1],
  );
  assert.ok(greenFloor <= 0.008, "a floor this loose seats the skin's violet rather than closing it");
  /*
   * AND A TEAR IS A JUMP IN LEVEL, NOT A CHANGE OF COLOUR. The gated rows used to take red
   * and blue up together and leave green exactly where it was, which is a violet band by
   * construction: measured over the lit skin they sat at hue 248 against a wall at 232, and
   * they were the only chromatic event anywhere on the drawn half. The lift a tear takes has
   * to be a colour the wall already is, so red may never reach past green in it.
   */
  assert.doesNotMatch(scene, /color\.r \+= gate/, "a tear that lifts red is a lavender tear");
  const tear = scene.match(/color \+= gate \* vec3\(([\d.]+), ([\d.]+), ([\d.]+)\);/);
  assert.ok(tear, "the tear row needs one declared lift");
  assert.ok(
    Number(tear[1]) < Number(tear[2]) && Number(tear[2]) < Number(tear[3]),
    "the tear lifts on the field's own hue: blue leads, green second, red last",
  );
  // The world field's own chromatic rim sits on the cool side at both ends of its mix. The
  // far end used to be a salmon, and a slab that caught it landed as a rose shard in
  // contact with the mark's baseline: the one warm thing in the frame, on the one thing
  // that may not carry warmth.
  const fringe = scene.match(/vec3 fringe = mix\(vec3\(([^)]*)\), vec3\(([^)]*)\)/);
  assert.ok(fringe, "the debris rim needs a declared two ended split");
  for (const end of [fringe[1], fringe[2]]) {
    const [red, , blue] = end.split(",").map((value) => Number(value.trim()));
    assert.ok(blue > red, `debris fringe end ${end} has to lead on blue`);
  }
  const ice = scene.match(/vec3\((0\.\d+), (0\.\d+), (1\.0|0\.\d+)\),\s*\n?\s*ice\s*\n?\s*\);/);
  assert.ok(ice, "the freeze needs a declared bleach colour");
  assert.ok(
    Number(ice[3]) >= Number(ice[1]),
    "a white with red in it is a warm white, and the field has no warm in it",
  );

  /*
   * THE FOREGROUND CURTAIN IS DEPTH, NOT CONFETTI. Seeded anywhere in the frame, roughly
   * twenty fragments landed inside the mark's own outline: on the baseline, on a
   * registration tick, crowding the drawn wall. Each candidate is carried onto the
   * artifact's plane, where the two share a frame, and rejected if it covers the mark.
   */
  const curtain = scene.slice(
    scene.indexOf("function EntryShardCurtain"),
    scene.indexOf("const ENTRY_VERTEX_SHADER"),
  );
  assert.match(curtain, /const keepOutX = ENTRY_LOGO_WIDTH/);
  assert.match(curtain, /const keepOutY = ENTRY_LOGO_HEIGHT/);
  assert.match(curtain, /Math\.abs\(x\) \* cone - reach > keepOutX/);
  assert.match(curtain, /Math\.abs\(y\) \* cone - reach > keepOutY/);
  /*
   * The keep-out is measured from the curtain's own origin, so the curtain has to travel
   * with the mark or the exclusion is only true at dead centre. It used to slide the
   * opposite way while the mark ran to either side of the frame, and a shard sat on the
   * baseline at every off-centre pointer position. Both read the travel from one place.
   */
  assert.match(scene, /function entryChaseTarget\(/);
  assert.match(curtain, /entryChaseTarget\(/);
  assert.match(curtain, /chaseX \* ENTRY_CURTAIN_FOLLOW/);
  assert.match(curtain, /chaseY \* ENTRY_CURTAIN_FOLLOW/);
  assert.doesNotMatch(curtain, /pointer\.[xy] \* -/);
  // And rejection sampling with no fallback is not an exclusion: sixteen misses used to
  // keep the last sample, mark or no mark.
  assert.match(curtain, /if \(!clear\) x = Math\.sign/);
  const curtainScale = curtain.match(/const scale = randomBetween\(random, [\d.]+, ([\d.]+)\)/);
  assert.ok(curtainScale, "the curtain sizes its shards in one place");
  assert.ok(
    Number(curtainScale[1]) < 1,
    "no shard in the curtain reads as a plate at the lens",
  );
});

test("entry artifact freezes over and releases at the lens, with no beads on it", async () => {
  const [scene, app, css] = await Promise.all([
    source("scene"),
    source("app"),
    source("css"),
  ]);

  // R3F copies a uniforms prop into the material's own store and keeps that target
  // stable, so a per frame scalar written to the object we authored never reaches the
  // shader. Every scalar has to go through a material ref.
  assert.match(scene, /faceMaterials\.current\.forEach/);
  assert.match(scene, /material\.uniforms\.uFlare\.value = flare/);
  assert.doesNotMatch(scene, /shardUniforms\.forEach\(\(uniforms\)/);

  // White cracked ice skin during the transition, released past the near plane.
  assert.match(scene, /uniform float uFlare;/);
  assert.match(scene, /float crackRidge\(vec2 point\)/);
  assert.match(scene, /cell\.visible = cellZ < nearLimit/);

  // WELD. The reference holds one continuous plate through the freeze, so the lattice
  // flattens its z jitter, pays back its seam and folds its extrusion to a wafer while the
  // artifact is held shut, and the burst hands every one of those back on the way out.
  // Zero at rest, so the pointer tilt keeps the depth the rest pose is measured against.
  assert.match(scene, /const weld = MathUtils\.smoothstep\(phase, 0\.02, 0\.22\) \* \(1 - burst\);/);
  assert.match(scene, /const spread = 1 \+ expand \* 0\.045 \* \(1 - weld\);/);
  assert.match(scene, /baseZ \* \(1 - weld\)/);
  assert.match(scene, /1 \+ weld \* \(ENTRY_SEAM \/ width\)/);
  assert.match(scene, /swell \* \(1 - weld \* 0\.78\)/);

  // The frozen plate is bimodal: a black cell floor, a wide seam with a blown centre, and
  // nothing at all in between. Two bands, because one ramp cannot carry the 180 share
  // without carrying the 220 share up with it, and no foot, because the reference leaves
  // the 16 to 32 counts empty.
  assert.match(scene, /float core = 1\.0 - smoothstep\([\d.]+, [\d.]+, ridge\);/);
  assert.match(scene, /float shoulder = 1\.0 - smoothstep\([\d.]+, [\d.]+, ridge\);/);
  assert.match(scene, /float ice = max\(core, shoulder \* [\d.]+\);/);
  assert.match(scene, /ice = step\([\d.]+, ice\) \* max\(ice, [\d.]+\);/);

  // The plate holds through the frame the reference still keeps whole and is scattered by
  // the one where the reference is empty, with the release clear of the 3s handover.
  const burst = scene.match(/const burst = MathUtils\.smoothstep\(phase, ([\d.]+), ([\d.]+)\);/);
  assert.ok(burst, "the release needs a declared window");
  const [, burstFrom, burstTo] = burst.map(Number);
  assert.ok(
    burstFrom * 3000 >= 1800,
    "the plate has to be intact at 1800ms, where the reference is still one plate",
  );
  assert.ok(
    burstTo * 3000 <= 2600,
    "and scattered by 2600ms, well before the handover it has to hide behind",
  );

  // No beads anywhere on the mark, in any state. The pearls were the one part of the
  // artifact that read as decoration rather than as the logo, so the seats, their layout,
  // their refs and their release choreography are deleted from the source rather than
  // hidden behind a visible flag or a zero scale that a later edit could switch back on.
  assert.doesNotMatch(scene, /ENTRY_PEARL_SEATS/);
  assert.doesNotMatch(scene, /ENTRY_ORB_LAYOUT/);
  assert.doesNotMatch(scene, /orbRefs/);
  assert.doesNotMatch(scene, /entry-orb-/);
  assert.doesNotMatch(scene, /<icosahedronGeometry/);
  assert.doesNotMatch(scene, /<sphereGeometry/);

  // Desktop chase stays bounded by the frustum; mobile never chases, so it is untouched.
  assert.match(scene, /-reachX, reachX/);
  assert.match(scene, /-reachY, reachY/);

  // Loading tint answers the load counter, not the entry transition.
  assert.match(app, /"--showcase-load"/);
  assert.match(css, /--showcase-load/);
});

test("the finale keeps the live field, a display lockup, and socials on the floor", async () => {
  const [app, css, scene] = await Promise.all([
    source("app"),
    source("css"),
    source("scene"),
  ]);

  // No veil over the canvas: the last screen is type standing inside the field.
  const finale = css.match(/\.finale \{[\s\S]*?\}/)?.[0] ?? "";
  assert.match(finale, /background: transparent/);
  assert.doesNotMatch(finale, /background:\s*#/);

  // Display scale, and both lines nowrap so a narrow viewport crops instead of reflowing.
  const lockup = css.match(/\.finale p,\s*\.finaleHandle \{[\s\S]*?\}/)?.[0] ?? "";
  assert.match(lockup, /font-size: clamp\(3\.4rem, 8\.1vw, 10\.4rem\)/);
  assert.match(lockup, /white-space: nowrap/);

  // The handset finale is three stacked blocks like the reference phone frame: statement
  // wrapped onto centered lines up top, socials in the middle, mailto reduced to one small
  // line on the floor. The lockup wrapper dissolves so flex order can interleave them.
  const mobile = css.match(/@media \(max-width: 767px\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  const mobileStatement = mobile.match(/\.finale p \{[\s\S]*?\}/)?.[0] ?? "";
  assert.match(mobileStatement, /font-size: 11\.8vw/);
  assert.match(mobileStatement, /white-space: normal/);
  assert.match(mobileStatement, /text-align: center/);
  const mobileHandle = mobile.match(/\.finaleHandle \{[\s\S]*?\}/)?.[0] ?? "";
  assert.match(mobileHandle, /order: 2/);
  assert.match(mobileHandle, /font-size: 1\.2rem/);
  assert.match(mobile, /\.finaleLockup \{[^}]*display: contents/);
  assert.doesNotMatch(mobile, /12\.5vw/);

  // Socials stack on the floor of the frame rather than sitting under the heading.
  const socials = css.match(/\.socials \{[\s\S]*?\}/)?.[0] ?? "";
  assert.match(socials, /flex-direction: column/);
  assert.match(socials, /bottom: 43px/);

  // The travelling corridor is spent by the finale, so it carries its own seeded band.
  assert.match(scene, /function FinaleDebris/);
  assert.match(scene, /FINALE_DEBRIS_COUNT/);
  assert.match(scene, /hashSeed\("showcase-finale-debris"\)/);
  assert.match(app, /HI@FULLBUILD\.AI/);
  assert.doesNotMatch(app, /hello@fullbuild\.ai/);
});

test("ledger holds the contract grid and the chrome drops its blanket uppercase", async () => {
  const [app, css] = await Promise.all([source("app"), source("css")]);

  const ledger = css.match(/\.ledger \{[\s\S]*?\}/)?.[0] ?? "";
  assert.match(ledger, /grid-template-columns: 310px minmax\(0, 523px\)/);
  assert.match(ledger, /gap: 77px/);
  assert.match(ledger, /bottom: 52px/);
  // Both columns hang from one top edge, so the two labels share a baseline.
  assert.match(ledger, /align-items: start/);
  assert.doesNotMatch(css, /\.ledgerInfo \.ledgerLabel \{/);

  // Bright filled tag pills, no rules across either column head.
  const tag = css.match(/\.ledgerInfo li \{[^}]*border-radius[^}]*\}/)?.[0] ?? "";
  assert.match(tag, /border-radius: 999px/);
  assert.match(tag, /background: var\(--showcase-white\)/);
  assert.doesNotMatch(css.match(/\.projectRow \{[\s\S]*?\}/)?.[0] ?? "", /border-top/);
  // Tags are part of the tablet ledger too.
  assert.doesNotMatch(css, /\.ledgerInfo ul \{\s*display: none/);

  // Only the identity shouts; nav and mail control stay sentence case.
  assert.doesNotMatch(css.match(/\.header \{[\s\S]*?\}/)?.[0] ?? "", /text-transform: uppercase/);
  assert.match(app, /className=\{styles\.mailChip\}/);
  // The sound tile and header nav are gone by owner request; only the mail control
  // remains in the header actions.
  assert.doesNotMatch(app, /SpeakerGlyph/);
  assert.doesNotMatch(app, /styles\.desktopNav/);
});

test("chase answers a pointing device and the manifesto justifies word by word", async () => {
  const [app, css, scene] = await Promise.all([
    source("app"),
    source("css"),
    source("scene"),
  ]);

  // Capability, not viewport width, decides whether anything follows the cursor.
  assert.match(scene, /FINE_POINTER_QUERY = "\(hover: hover\) and \(pointer: fine\)"/);
  assert.match(scene, /function useFinePointer/);
  assert.doesNotMatch(scene, /mobile \|\| reducedMotion \|\| entered \? 0/);
  assert.doesNotMatch(scene, /reducedMotion \|\| mobile \? 0 : pointer/);

  // Every word is its own flex child, and none of them may shrink into its neighbour.
  assert.match(app, /function HeroWords/);
  assert.match(app, /text\.split\(" "\)\.map/);
  assert.match(css, /\.heroLine > \* \{[\s\S]*?flex: 0 0 auto/);

  // The starter block is wider than the viewport and centred, so it crops on both edges.
  const mobile = css.match(/@media \(max-width: 767px\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(mobile, /margin-left: -58vw/);

  // The hover pill is pinned to the crystal the scene projects, never to the cursor.
  assert.match(scene, /--showcase-anchor-x/);
  assert.match(css, /left: var\(--showcase-anchor-x/);
  assert.doesNotMatch(css, /var\(--showcase-cursor-x, 58vw\)/);
});

test("prototype gallery links to Showcase", async () => {
  const gallery = await source("gallery");

  assert.match(gallery, /href="\/prototype\/showcase"/);
  assert.match(gallery, />Showcase</);
});

test("the loader is a registered drafting sheet cut open by a percent function", async () => {
  const [app, css, loader, scene] = await Promise.all([
    source("app"),
    source("css"),
    source("loader"),
    source("scene"),
  ]);

  // Two composites and a hard edge. One layer with a lerped ink goes dead grey exactly
  // where the ground does, which is the defect the whole build is arranged against.
  assert.match(app, /className=\{styles\.loadSheet\}/);
  assert.match(app, /className=\{styles\.loadWorld\}/);
  assert.match(app, /className=\{styles\.loadBox\}/);
  assert.match(app, /className=\{styles\.loadEdge\}/);
  assert.match(app, /<LoaderPlate variant="sheet" styles=\{styles\} \/>/);
  assert.match(app, /<LoaderPlate variant="world" styles=\{styles\} \/>/);

  // Registration is derived from the entry artifact rather than eyeballed, the comment
  // names every input to the derivation, and the artifact mounts at the pose it is
  // registered against instead of damping into it behind an opaque loader.
  assert.match(css, /--mark-unit: 0\.6372svh/);
  assert.match(css, /--mark-unit: 0\.4829svh/);
  assert.match(css, /viewportScale/);
  assert.match(scene, /position=\{\[0, 0\.12, 0\.1\]\}/);

  // The film is a pure function of percent, freezable, and never rolls its own clock.
  assert.match(app, /displayPercent/);
  assert.match(app, /__showcaseLoader/);
  assert.match(app, /LOAD_SWEEP_MS/);
  assert.doesNotMatch(loader, /Math\.random/);
  assert.doesNotMatch(loader, /PEARL/i);
  assert.doesNotMatch(loader, /@keyframes|animation:|transition:/);
  assert.match(css, /--b-cut/);
  assert.match(css, /--b-blow/);

  // The drawn furniture bands: the readout wipe and one band per lockup letter, each
  // registered and ramped so the entrance stays a pure function of the one load write.
  const furnitureBands = ["--b-num"];
  for (let index = 0; index < 9; index += 1) furnitureBands.push(`--b-let${index}`);
  for (const band of furnitureBands) {
    assert.match(
      css,
      new RegExp(`@property ${band} \\{ syntax: "<number>"; inherits: true; initial-value: 0; \\}`),
      `${band} should be registered`,
    );
    assert.ok(css.includes(`${band}: clamp(`), `${band} should be ramped in the band table`);
  }

  /*
   * The lockup letters are ruled in by a per-letter mask riding --lb, and every letter span
   * exists in the markup rather than as a bare text node, or the nth-child band mapping has
   * nothing to land on and the words pop in whole.
   */
  assert.match(css, /mask-image: linear-gradient\(100deg, #000 calc\(var\(--lb, 1\) \* 130% - 18%\), transparent calc\(var\(--lb, 1\) \* 130%\)\)/);
  assert.match(css, /--lb: var\(--b-let0\)/);
  assert.match(css, /--lb: var\(--b-let8\)/);
  assert.match(app, /<span>F<\/span>/);
  assert.match(app, /<span>D<\/span>/);
  assert.doesNotMatch(app, /<span>FULL<\/span>|<span>BUILD<\/span>/);

  /*
   * Inline-block letters invent a break opportunity between every glyph, and a handset
   * width takes one mid word: BUILD wrapped its D onto a new line. The word spans forbid
   * wrapping so the split can never change where the words sit.
   */
  assert.match(css, /\.starterMark > span \{\r?\n  white-space: nowrap;/);

  /*
   * The draw zone pace is a contract with the band table: the narrowest entrance bands are
   * 2.2 load points wide, so the follower may not sweep a whole band between natural frames
   * sampled 150ms apart, or letters pop in complete.
   */
  assert.match(app, /LOAD_DRAW_POINTS = 11/);
  const openRatio = Number(app.match(/LOAD_OPEN_RATIO = ([\d.]+)/)[1]);
  const sweepMs = Number(app.match(/LOAD_SWEEP_MS = (\d+)/)[1]);
  const perFrame = (150 * 100 * openRatio) / sweepMs;
  assert.ok(perFrame < 2.2, `draw zone sweeps ${perFrame.toFixed(2)} points per 150ms frame`);
  assert.match(app, /displayRef\.current - LOAD_DRAW_POINTS/);

  // The dash technique that survives a scaled viewBox, and the one that does not.
  assert.match(loader, /pathLength="100"/);
  assert.doesNotMatch(css, /non-scaling-stroke/);
  assert.doesNotMatch(loader, /non-scaling-stroke/);

  /*
   * The dash offset must be a <length>. Chromium accepts a bare <number> calc and treats it
   * as px, but Firefox rejects it, falls back to 0, and the whole progressive draw dies:
   * every stroke paints fully drawn from frame one. The * 1px is the fix, not a style.
   */
  assert.match(css, /stroke-dashoffset: calc\(\(100 - 100 \* var\(--s, 1\)\) \* 1px\)/);

  // Path data is the icon's own, so no second coordinate mapping can drift.
  const icon = await source("icon");
  for (const d of ["M8 82 H92", "M18 82 V48 L35 32 L52 48 V82", "M52 48 L68 32 L82 46"]) {
    assert.ok(loader.includes(d), `loader should carry the icon path ${d}`);
    assert.ok(icon.includes(d), `icon should carry the path ${d}`);
  }

  // The cut's rule rides the clip it is cutting, never the point the travel stopped at, or
  // the blow out strands it in the middle of the field as a second unrelated red vertical.
  assert.match(css, /--cut-x: calc\(100% - var\(--clip-r\)\)/);
  assert.match(css, /left: var\(--cut-x\)/);
  assert.doesNotMatch(css, /left: var\(--edge-c\)/);
  // And it holds full revision red for the travel instead of ramping across it.
  assert.match(css, /--b-edge/);
  assert.match(css, /opacity: calc\(var\(--b-edge\) \* \(1 - var\(--b-spend\)\)\)/);

  // Both lockups are solid type before the frame opens, so the blow out changes their ink
  // rather than slicing knockout outline against solid fill into chips.
  assert.match(css, /--b-ink/);
  assert.match(css, /-webkit-text-stroke-width: calc\(2\.4px \* \(1 - var\(--b-ink\)\)\)/);

  // Standing up starts on the frame the cut lands, not after the frame finished opening.
  assert.match(css, /--b-build: clamp\(0, calc\(\(var\(--load\) - 0\.84\) \* 6\.25\), 1\)/);

  // The datum is ruled across the frame rather than mostly off plate.
  assert.doesNotMatch(loader, /M-900 82 H1000/);
  assert.match(loader, /M-120 82 H220/);

  // Holding a percent has to re-enter the loader deterministically from either side of the
  // handover, so the step-end hide never governs the way back in.
  assert.match(app, /data-held=\{held\}/);
  assert.match(css, /\.starter\[data-held="true"\]/);
  assert.match(css, /visibility 0s/);

  // The single announced readout survives, announces in tens, and so does the static
  // reduced-motion frame.
  assert.match(app, /className=\{styles\.loadReadout\} aria-live="polite"/);
  assert.match(app, /Math\.floor\(displayPercent \/ 10\) \* 10/);
  assert.doesNotMatch(app, /aria-label="fullbuild\.ai"><span>FULL<\/span>/);
  const still = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\r?\n\}/)?.[0] ?? "";
  assert.match(still, /--b-draw: 1;/);
  assert.match(still, /--b-blow: 1;/);
  assert.match(still, /--b-red: 0;/);
  assert.match(still, /--b-num: 1;/);
  assert.match(still, /--b-let8: 1;/);
});

test("showcase does not ship source-owned media, audio, or em dashes", async () => {
  const shipped = await Promise.all([
    source("page"),
    source("css"),
    source("app"),
    source("loader"),
    source("scene"),
    source("data"),
  ]);
  const combined = shipped.join("\n");

  assert.doesNotMatch(combined, /noomo|showcase\.noomoagency\.com/i);
  assert.doesNotMatch(combined, /<audio|AudioContext|\.mp3|\.wav/i);
  assert.doesNotMatch(combined, /[—–]/);
});
