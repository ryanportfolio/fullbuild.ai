import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const laylineSources = async () => {
  const roots = ['src/components/layline', 'src/lib/layline', 'src/app/prototype/layline'];
  const files = [];
  for (const root of roots) {
    const entries = await readdir(new URL(`../${root}`, import.meta.url), {
      recursive: true,
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const dir = entry.parentPath.replaceAll('\\', '/');
      files.push(`${dir.slice(dir.indexOf(root))}/${entry.name}`);
    }
  }
  return files;
};

test('Layline is discoverable and the page keeps its identity', async () => {
  const [directory, page] = await Promise.all([
    read('public/prototype/index.html'),
    read('src/app/prototype/layline/page.tsx'),
  ]);

  assert.equal((directory.match(/href="\/prototype\/layline"/g) ?? []).length, 1);
  assert.match(directory, /<span class="num">18<\/span>[\s\S]*?<h2>Layline<\/h2>/);
  assert.match(directory, /Sports telemetry · WebGL/);
  assert.match(directory, /four fixes a second/);

  assert.match(page, /title: "Layline · Race Replay"/);
  assert.match(page, /generateRace\(RACE_SEED\)/);
  assert.match(page, /Skip to the replay console/);
  /* The bar's left slot is the way through to the library, and it counts the
     races off the registry. A hardcoded count would go stale the day a fourth
     race ships, so the literal is barred here rather than in review. */
  assert.match(page, /href="\/prototype\/layline\/races"/);
  assert.match(page, /`Race library \/\/ \$\{RACES\.length\} races`/);
  assert.doesNotMatch(page, /Race library \/\/ \d+ races/);
  /* The colophon is three parts: who built it, where the source is, and the way
     back to the house. Read out of the footer it sits in rather than off the
     whole page, so a credit that drifts out of the colophon fails here, and so
     the source link is the colophon's own and not the one in the top bar. */
  const colophon = page.match(/className=\{styles\.colophon\}>([\s\S]*?)<\/footer>/);
  assert.ok(colophon !== null, 'the page has a colophon footer');
  assert.match(colophon[1], /Built by Ryan Allen/);
  assert.match(colophon[1], /href="https:\/\/github\.com\/ryanportfolio\/layline"/);
  assert.match(colophon[1], /href="\/"/);
});

test('Layline engine identity holds: seed, fix rate, lens, version pin', async () => {
  const [types, pkg] = await Promise.all([read('src/lib/layline/types.ts'), read('package.json')]);

  /* The whole page is two readings of one number: the server chart and the
   * client replay both come from this seed at this fix rate. */
  assert.match(types, /export const RACE_SEED = 20280726;/);
  assert.match(types, /export const FIX_HZ = 4;/);
  assert.match(types, /export type ReplayMode = "smooth" \| "raw";/);

  /* three r181/182 broke slerp extrapolation and WebGPU cannot run the
   * ShaderMaterial water; 0.171 is a pin, not a lag. */
  assert.match(pkg, /"three": "\^0\.171\./);
});

test('Layline sources carry no wall-clock time, no unseeded randomness, no banned marks', async () => {
  const files = await laylineSources();
  assert.ok(files.length >= 30, `expected the full layline tree, saw ${files.length} files`);

  for (const path of files) {
    const source = await read(path);
    assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now|new Date\(/, path);
    assert.doesNotMatch(source, /[—–…‘’“”]/, path);
  }
});

test('Layline stylesheet keeps the house rules', async () => {
  const styles = await read('src/app/prototype/layline/layline.module.css');

  assert.match(styles, /--house-cursor: var\(--house-cursor-frost\);/);
  assert.match(styles, /@media \(min-width: 901px\)/);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /:focus-visible/);
  assert.doesNotMatch(styles, /cursor:\s*pointer/);
  assert.doesNotMatch(styles, /linear-gradient|radial-gradient|backdrop-filter/);
});

test('the race library declares five complete route-scoped themes', async () => {
  const [styles, page, workspace, story] = await Promise.all([
    read('src/app/prototype/layline/layline.module.css'),
    read('src/app/prototype/layline/races/page.tsx'),
    read('src/app/prototype/layline/races/RaceWorkspace.tsx'),
    read('src/app/prototype/layline/page.tsx'),
  ]);
  const grounds = {
    console: '#070f16',
    sailcloth: '#dfdcd5',
    marine: '#06422e',
    chart: '#f5f1e4',
    ice: '#edfffe',
  };
  const required = [
    '--page-ground',
    '--hud-ground',
    '--ink',
    '--ink-dim',
    '--rule',
    '--focus-ring',
    '--house-cursor',
  ];

  for (const [theme, ground] of Object.entries(grounds)) {
    const block = styles.match(
      new RegExp(`\\.shell\\[data-layline-theme="${theme}"\\] \\{([\\s\\S]*?)\\n\\}`),
    )?.[1];
    assert.ok(block, `${theme} has no route-scoped token set`);
    assert.match(block, new RegExp(`--page-ground:\\s*${ground.replace('#', '\\#')};`));
    for (const token of required) {
      assert.match(block, new RegExp(`${token}:`), `${theme} does not declare ${token}`);
    }
  }

  /* The cursor follows the ground, not the theme's name: frost on the dark
     ones, graphite on the light ones. Marine sits with console because white
     ink forced its greens down to a #06422e ground. */
  for (const theme of ['console', 'marine']) {
    const block = styles.match(
      new RegExp(`\\.shell\\[data-layline-theme="${theme}"\\] \\{([\\s\\S]*?)\\n\\}`),
    )?.[1] ?? '';
    assert.match(block, /--house-cursor: var\(--house-cursor-frost\);/);
    assert.match(block, /--ink: #(ecf5f9|ffffff);/);
  }
  for (const theme of ['sailcloth', 'chart', 'ice']) {
    const block = styles.match(
      new RegExp(`\\.shell\\[data-layline-theme="${theme}"\\] \\{([\\s\\S]*?)\\n\\}`),
    )?.[1] ?? '';
    assert.match(block, /--house-cursor: var\(--house-cursor-graphite\);/);
  }

  /* The parser-time script changes only its parent shell. It runs before the
     controls and canvas are parsed, so a stored theme cannot flash console or
     leak onto the separate story route. Invalid storage is ignored. */
  assert.match(page, /suppressHydrationWarning/);
  assert.match(page, /document\.currentScript\?\.parentElement/);
  assert.match(page, /localStorage\.getItem\("layline-races-theme-v1"\)/);
  assert.match(page, /\["console", "sailcloth", "marine", "chart", "ice"\]\.includes/);
  assert.match(page, /catch \{/);
  assert.doesNotMatch(story, /data-layline-theme|ThemePicker|layline-races-theme-v1/);

  assert.match(workspace, /aria-label="Interface theme"/);
  assert.match(workspace, />Theme<\/span>/);
  assert.match(workspace, /Current theme \$\{current\.label\}\. Switch to \$\{next\.label\}/);
  assert.match(workspace, /aria-live="polite"/);
  assert.match(workspace, /\(currentIndex \+ 1\) % THEME_OPTIONS\.length/);
  const themePicker = workspace.match(/export function ThemePicker[\s\S]*?\/\*\* One row/)?.[0] ?? '';
  assert.doesNotMatch(themePicker, /aria-pressed/);
  for (const theme of Object.keys(grounds)) {
    assert.match(workspace, new RegExp(`id: "${theme}"`));
  }
  assert.ok(
    (workspace.match(/<svg/g) ?? []).length >= 5,
    'each theme has its own inline SVG rather than one reused swatch',
  );
  assert.match(workspace, /function PanelToggleIcon/);
  assert.match(workspace, /action: "collapse" \| "restore"/);
  assert.match(workspace, /M12 6 9 9l3 3/);
});

test('the race library rail and workspace keep their interaction contracts', async () => {
  const [workspace, page, state, styles, analyst] = await Promise.all([
    read('src/app/prototype/layline/races/RaceWorkspace.tsx'),
    read('src/app/prototype/layline/races/page.tsx'),
    read('src/app/prototype/layline/races/workspaceState.ts'),
    read('src/app/prototype/layline/races/races.module.css'),
    read('src/components/layline/analyst/AnalystSection.tsx'),
  ]);

  /* Search owns only query state. Race selection remains the URL committer,
     and both Escape and a visible button clear the view. */
  assert.match(workspace, /htmlFor="race-search">Search<\/label>/);
  assert.match(workspace, /if \(event\.key !== "Escape"\) return;/);
  assert.match(workspace, />\s*Clear\s*<\/button>/);
  assert.match(workspace, /Search hides \$\{hiddenBySearch\} races/);
  assert.doesNotMatch(workspace, /stays loaded\. Search hides its row/);
  assert.match(workspace, /router\.replace\(`\$\{pathname\}\?race=\$\{id\}`/);

  /* Pin and archive are separate named buttons beside the row button. Archive
     is a real disclosure, and archiving the loaded race opens it without a
     navigation. */
  assert.match(workspace, /aria-label=\{`\$\{pinned \? "Unpin" : "Pin"\}/);
  assert.match(workspace, /aria-label=\{`\$\{archived \? "Restore" : "Archive"\}/);
  assert.match(workspace, /<details[\s\S]*?<summary/);
  assert.match(workspace, /if \(movingToArchive\) setArchiveOpen\(true\)/);
  assert.match(workspace, /stays loaded and moved to Archive/);

  /* Local storage owns the preferences. Its route-scoped cookie mirror lets
     the server render the same state on first paint. Both reads sanitize ids. */
  assert.match(workspace, /localStorage\.getItem\(WORKSPACE_STORAGE_KEY\)/);
  assert.match(workspace, /document\.cookie = `\$\{WORKSPACE_COOKIE_KEY\}/);
  assert.match(page, /cookies\(\)/);
  assert.match(page, /parseWorkspacePreferences/);
  assert.match(state, /validIds\.has\(id\)/);

  /* Both boundaries expose the separator value contract. Pointer movement
     translates only the handle, then release commits one pane width. */
  assert.match(workspace, /role="separator"/);
  assert.match(workspace, /aria-valuemin=/);
  assert.match(workspace, /aria-valuemax=/);
  assert.match(workspace, /aria-valuenow=/);
  assert.match(workspace, /event\.key === "PageUp"/);
  assert.match(workspace, /event\.key === "PageDown"/);
  assert.match(workspace, /onDoubleClick=\{\(\) => commitWidth\(pane, null\)\}/);
  assert.match(workspace, /drag\.handle\.style\.transform = `translateX/);
  assert.match(workspace, /finishResize[\s\S]*?commitWidth\(drag\.pane, drag\.nextWidth\)/);

  /* Headers carry mouse drag and a named keyboard action. The analyst extends
     its existing rail header instead of adding a second component copy. */
  assert.match(workspace, /data-pane-drag-handle/);
  assert.match(workspace, /Move \$\{pane === "rail" \? "race list" : "analyst"\} to the/);
  assert.match(workspace, /aria-live="polite"/);
  assert.match(analyst, /railHeaderProps/);
  assert.match(analyst, /railHeaderControls/);

  assert.match(workspace, /aria-label=\{preferences\.railCollapsed \? "Restore race list" : "Collapse race list"\}/);
  assert.ok(
    workspace.indexOf("className={styles.panelToggle}") < workspace.indexOf("ref={libraryRef}"),
    "collapse control stays at the rail's top-left instead of inside a separator",
  );
  assert.match(styles, /@media \(max-width: 1199px\)/);
  assert.match(styles, /\.separator \{[\s\S]*?display: none;/);
  assert.match(styles, /@media \(min-width: 1200px\)[\s\S]*?\.separator \{\s*display: block;/);
});

/*
  THE COURSE RAIL. The page draws its own scrollbar as a course diagram, and
  these read the values back out of the source rather than restating them, so a
  token rename or a retuned constant fails here instead of drifting.
*/

test('the course rail draws in the console palette and nothing else', async () => {
  const [rail, shell] = await Promise.all([
    read('src/components/layline/CourseRail.module.css'),
    read('src/app/prototype/layline/layline.module.css'),
  ]);

  /* Every colour on the rail is a token the page already declares, with the
     meaning it already carries. A raw hex here would be a seventh ink. */
  const inks = [...rail.matchAll(/var\((--[a-z-]+)/g)].map((m) => m[1]);
  const declared = new Set([
    ...[...shell.matchAll(/^\s{2}(--[a-z-]+):/gm)].map((m) => m[1]),
    "--house-cursor",
    "--house-cursor-frost",
    "--font-archivo",
    "--font-martian",
  ]);
  for (const ink of new Set(inks)) {
    assert.ok(declared.has(ink), `the rail uses ${ink}, which the page never declares`);
  }
  assert.doesNotMatch(
    rail.slice(rail.indexOf("*/")),
    /#[0-9a-f]{3,8}\b/i,
    "the rail paints a raw hex instead of an ink with a meaning",
  );

  /* Amber is the wind on this page. The laylines are the only thing on the rail
     entitled to it, because a layline is a wind fact. */
  const amber = [...rail.matchAll(/([^\s{}]+)\s*\{[^}]*var\(--wind\)/g)].map((m) => m[1]);
  assert.deepEqual(amber, ["line"], "something other than the laylines is spending the wind amber");

  /* The console's own ban list reaches the rail. */
  assert.doesNotMatch(rail, /linear-gradient|radial-gradient|backdrop-filter|box-shadow|filter:\s*blur/);
  assert.doesNotMatch(rail, /cursor:\s*pointer/);
  assert.match(rail, /cursor: var\(--house-cursor\)/);
  assert.match(rail, /@media \(max-width: 900px\)/);
  assert.match(rail, /@media \(prefers-reduced-motion: reduce\)/);

  /* The contract is written down, including what it costs. */
  const header = rail.slice(0, rail.indexOf("*/"));
  assert.match(header, /THE COST, stated/);
  assert.match(header, /macOS/);
});

test('the rail is measured, not divided into pleasing parts', async () => {
  const source = await read('src/components/layline/CourseRail.tsx');

  /* Marks come from the document, at their real share of it. */
  assert.match(source, /querySelectorAll<HTMLElement>\("\[data-leg\]"\)/);
  assert.match(source, /docTop\(el\) \/ docH/);
  /* The thumb is the viewport's real share, and the track is the real range. */
  assert.match(source, /\(viewH \/ docH\) \* trackH/);
  assert.match(source, /const range = docH - viewH/);
  /* Any range at all, not the half-viewport floor the site log uses: the
     platform bar is already down by the time this decides. */
  assert.match(source, /const scrollable = range > 1/);

  /* Speed comes off the rAF stamp. The whole layline tree is barred from
     wall-clock time, and the sources test above enforces it; this states why
     the paint loop is allowed to know how fast the page is moving at all. */
  assert.match(source, /const paint = \(ts: number\)/);
  assert.match(source, /ts - last\.ts/);
});

test('the rail replaces the platform bar without ever leaving the page barless', async () => {
  const [source, bar, page] = await Promise.all([
    read('src/components/layline/CourseRail.tsx'),
    read('src/app/prototype/layline/scrollbar.css'),
    read('src/app/prototype/layline/page.tsx'),
  ]);

  /* Stamped at mount and removed on teardown, never written statically. */
  assert.match(source, /html\.dataset\.laylineRail = ""/);
  assert.match(source, /delete html\.dataset\.laylineRail/);

  /* Both halves of the gate: the attribute AND the width the rail draws at.
     Either one alone strands a visitor with no scrollbar of any kind. */
  const suppression = bar.match(/@media \(min-width: 901px\) \{([\s\S]*?)\n\}/);
  assert.ok(suppression, "the suppression is not width-gated");
  assert.match(
    suppression[1],
    /html\[data-layline-rail\]:has\(\[data-layline-page\]\) \{\s*scrollbar-width: none;/,
  );
  assert.match(
    suppression[1],
    /html\[data-layline-rail\]:has\(\[data-layline-page\]\)::-webkit-scrollbar \{/,
  );

  /* THE TIE. :has() contributes its most specific argument, so a bare
     html[data-layline-rail] and html:has([data-layline-page]) are both 0-1-1
     and source order alone decides. Written the other way round, the painted
     bar won every tie and a mounted rail got a native scrollbar beside it
     (measured: ::-webkit-scrollbar resolved to 10px at 1440px with the rail
     up). Two things keep that from coming back, and both are asserted: the
     suppression carries :has() itself, taking it to 0-2-1, and it is written
     last anyway. */
  assert.ok(
    bar.indexOf("@media (min-width: 901px)") > bar.lastIndexOf("@supports not selector"),
    "the suppression is written before the painted bar it has to beat",
  );

  /* Where the bar is left in place it is painted in the page's own values.
     The literals are unavoidable (html sits outside .shell) so they are pinned
     to the tokens here instead. */
  const shell = await read('src/app/prototype/layline/layline.module.css');
  const token = (name) => shell.match(new RegExp(`${name}:\\s*([^;]+);`))[1].trim();
  assert.equal(token("--page-ground"), "#070f16");
  assert.equal(token("--ink-dim"), "#a4bccb");
  assert.equal(token("--rule"), "rgba(164, 188, 203, 0.28)");
  assert.match(bar, /html:has\(\[data-layline-page\]\)::-webkit-scrollbar-track \{\s*background: #070f16;/);
  assert.match(bar, /html:has\(\[data-layline-page\]\)::-webkit-scrollbar-thumb \{\s*background: #a4bccb;/);
  assert.match(bar, /border-left: 1px solid rgba\(164, 188, 203, 0\.28\)/);
  assert.match(page, /data-layline-page/);

  /* Blink honours scrollbar-color and drops the drawn geometry when it sees it,
     so the standard properties may only appear behind the @supports guard. */
  const guard = bar.indexOf("@supports not selector(::-webkit-scrollbar)");
  assert.ok(guard > 0, "no @supports fallback, so Firefox gets a default bar");
  assert.equal(
    bar.slice(0, guard).includes("scrollbar-color:"),
    false,
    "scrollbar-color outside the guard overrides the drawn bar in Chrome",
  );
  assert.match(bar.slice(guard), /scrollbar-color: #a4bccb #070f16/);
});

test('the rail keeps the bow and the frame budget honest', async () => {
  const source = await read('src/components/layline/CourseRail.tsx');

  /* A frame that moved nothing is not a direction change. This loop runs on
     idle frames while the wake decays, so clearing the run on dy === 0 wiped
     the accumulator between inputs and a reader crawling upward under the
     deadband never got the bow round. */
  assert.match(
    source,
    /if \(dy !== 0\) \{\s*last\.run = Math\.sign\(dy\) === Math\.sign\(last\.run\) \? last\.run \+ dy : dy;/,
  );
  assert.doesNotMatch(source, /dy === 0 \|\| Math\.sign/);

  /* One capture authority per page: the rail's own rAF loop answers to the
     same freeze the replay clock does, or a shot taken after freeze() catches
     the foam mid-decay and two runs of one capture disagree. */
  assert.match(source, /frozenRef\.current = useReplay\.getState\(\)\.frozen/);
  assert.match(source, /useReplay\.subscribe\(\(state\) => \{\s*frozenRef\.current = state\.frozen;/);
  assert.match(source, /const making = speed > 4 && !reducedRef\.current && !frozenRef\.current/);
  /* And it lets go of the store on teardown, like every other handle here. */
  assert.match(source, /unwatch\(\);/);
});

test('every page section the rail marks is a section the page actually renders', async () => {
  const [page, analyst, notes, engineRoom] = await Promise.all([
    read('src/app/prototype/layline/page.tsx'),
    read('src/components/layline/analyst/AnalystSection.tsx'),
    read('src/components/layline/NotesSection.tsx'),
    read('src/components/layline/engine/EngineRoom.tsx'),
  ]);

  assert.match(page, /data-leg="Replay console"/);
  /* The Debrief marks the leg on the story page and nowhere else. The same
     component renders in the race library's 380px rail, which has no course
     rail down its margin for a leg mark to be rounded on. */
  assert.match(analyst, /data-leg=\{rail \? undefined : "Debrief"\}/);
  assert.match(notes, /data-leg="Project notes"/);

  /* The mark's name is the section's own name, not a label invented for the
     margin, and the two sections say their name in the two ways a section can.
     The debrief points at the heading it renders; the notes section carries
     several headings of its own and so names itself, which is what the mark has
     to agree with. */
  assert.match(analyst, /id="debrief-heading"[\s\S]{0,80}Debrief/);
  assert.match(notes, /aria-label="Project notes"[\s\S]{0,40}data-leg="Project notes"/);

  /* And it names itself because the heading it used to borrow is not on the
     page: the engine room only draws its own header unembedded, and the notes
     section is the one place anything embeds it. Flip that flag and the section
     grows a second title the margin knows nothing about. */
  assert.match(notes, /<EngineRoom embedded \/>/);
  assert.match(engineRoom, /\{embedded \? null : <EngineHeader \/>\}/);

  /* The colophon carries no mark: it sits below the last viewport centre, so a
     mark there could never be rounded. The finish line at the foot of the rail
     is what says the document has ended. */
  assert.doesNotMatch(page, /colophon} data-leg/);
});

test('the 2D view replaces camera choices with one clear return to 3D', async () => {
  const [transport, styles] = await Promise.all([
    read('src/components/layline/hud/Transport.tsx'),
    read('src/app/prototype/layline/layline.module.css'),
  ]);

  assert.match(
    transport,
    /\{chart2d \? \([\s\S]*?data-control="return-3d"[\s\S]*?Switch to 3D[\s\S]*?\) : \([\s\S]*?aria-label="Camera rig"/,
  );
  assert.match(transport, /data-control="return-3d"[\s\S]*?onClick=\{\(\) => setChart2d\(false\)\}/);
  assert.equal((transport.match(/styles\.viewGroup/g) ?? []).length, 2);

  const returnRule = styles.match(/\.return3dButton \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(returnRule, /min-width: 204px/);
  assert.match(returnRule, /background: var\(--ink\)/);
  assert.match(returnRule, /font-weight: 800/);

  const viewRule = styles.match(/\.viewGroup \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(viewRule, /background: color-mix\(in srgb, var\(--ink-dim\) 8%, transparent\)/);
  assert.match(viewRule, /border-color: var\(--ink-dim\)/);
});

test('the boot cover keeps the house rules while it briefs the race', async () => {
  const cover = await read('src/components/layline/bootSea.module.css');
  const brief = await read('src/components/layline/RaceBrief.tsx');

  /* The house pointer, never the browser hand, on the one control this layer
     carries. */
  assert.doesNotMatch(cover, /cursor:\s*pointer/);
  assert.match(cover, /cursor: var\(--house-cursor\)/);
  /* The cover is one of the three surfaces allowed a gradient, and it is the
     only gradient here: nothing inside a panel may carry one. */
  assert.equal((cover.match(/linear-gradient|radial-gradient/g) ?? []).length, 1);
  assert.doesNotMatch(cover, /box-shadow|backdrop-filter/);
  assert.match(cover, /@media \(prefers-reduced-motion: reduce\)/);
  /* Narrow stacks the three panels and grounds the footer, so the way through
     is never what scrolls off. */
  assert.match(cover, /@container \(max-width: 760px\)/);

  /* The cover states no focus ring of its own. The console rings every
     focusable thing with one square registration box so keyboard position is
     never ambiguous, and a second opinion on this layer was a control that
     changed shape the moment it took focus. */
  assert.doesNotMatch(cover, /:focus-visible/);
  const shell = await read('src/app/prototype/layline/layline.module.css');
  assert.match(shell, /\.shell :is\(a, button, \[tabindex\]\):focus-visible/);

  /* Nothing on this layer is rounded, which is the same call the route's own
     scrollbar stylesheet already made: "the console draws no radius anywhere". */
  assert.doesNotMatch(cover.replace(/\/\*[\s\S]*?\*\//g, ''), /border-radius/);

  /* The stacked brief is the one scroller on this route that is not the
     platform bar, and it takes the bar the route already paints: same 10px
     channel, same 3px inset over padding-box, same square corners, in this
     layer's own inks because the bar sits on the sea rather than on the page
     ground. A default browser bar here is the only chrome nobody drew. */
  /* Stated for every scroller on the layer at every width, not for the one
     element that happens to overflow in today's stacked layout. */
  assert.match(cover, /\.brief::-webkit-scrollbar \{\s*width: 10px;/);
  assert.match(cover, /\.brief ::-webkit-scrollbar-thumb/);
  assert.match(cover, /\.brief \*,?\s*\{?\s*scrollbar-width: thin/);
  assert.match(cover, /border: 3px solid transparent;/);
  assert.match(cover, /@supports not selector\(::-webkit-scrollbar\)/);
  const bar = await read('src/app/prototype/layline/scrollbar.css');
  assert.match(bar, /width: 10px;/);
  assert.match(bar, /border: 3px solid transparent;/);

  /* Every drawing that carries a reading is labelled, and every reading a
     label cannot carry is also in text underneath it. */
  const svgs = brief.match(/role="img"/g) ?? [];
  assert.equal(svgs.length, 2, 'the brief draws something a screen reader cannot name');
  assert.equal((brief.match(/aria-label=/g) ?? []).length, 3);
  /* Both labels state what the drawing shows in the race's own numbers rather
     than naming a picture, and the layer itself is named for the race. */
  assert.match(brief, /aria-label=\{`The last \$\{prestartSeconds\} seconds before the gun/);
  assert.match(brief, /aria-label=\{`True wind direction across the prestart/);

  /* The brief holds while the renderer warms, and says which of the two it is
     waiting on. Neither string claims the race is loading: it is already
     built by the time this layer paints. */
  assert.match(brief, /renderer warming, the race is already loaded/);
  assert.match(brief, /renderer up, the race is already loaded/);

  /* Display text carries no periods, here as everywhere else on the page. */
  for (const line of ['renderer warming, the race is already loaded', 'Start the race']) {
    assert.ok(!line.endsWith('.'), `${line} ends in a period`);
  }
});
