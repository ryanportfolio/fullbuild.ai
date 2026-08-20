import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/*
  One navigation bar sits on all seven campaign pages: the house mark links
  home, six links reach the index and the five campaigns, and the page you are
  on is marked. The mark is the fullbuild.ai logo, so these tests read the path
  data straight out of the component and fail if the static copy drifts from it.
*/

const PAGES = [
  ["foredge/index.html", "/prototype/foredge"],
  ["foxglove/index.html", "/prototype/foxglove"],
  ["foxglove/brand.html", "/prototype/foxglove"],
  ["foxtail/index.html", "/prototype/foxtail"],
  ["foundry/index.html", "/prototype/foundry"],
  ["forecourt/index.html", "/prototype/forecourt"],
  ["marketing/index.html", "/prototype/marketing"],
];

const DESTINATIONS = [
  "/prototype/marketing",
  "/prototype/foredge",
  "/prototype/foxglove",
  "/prototype/foxtail",
  "/prototype/foundry",
  "/prototype/forecourt",
];

const STYLED = ["foredge", "foxglove", "foxtail", "foundry", "forecourt", "marketing"];

const pages = {};
for (const [file] of PAGES) {
  pages[file] = await readFile(new URL(`../public/prototype/${file}`, import.meta.url), "utf8");
}

const sheets = {};
for (const name of STYLED) {
  sheets[name] = await readFile(
    new URL(`../public/prototype/${name}/css/site.css`, import.meta.url),
    "utf8"
  );
}

const railLogo = await readFile(
  new URL("../src/components/chrome/RailLogo.tsx", import.meta.url),
  "utf8"
);

test("every campaign page carries the bar, and it reaches the whole set", () => {
  for (const [file] of PAGES) {
    const html = pages[file];
    assert.ok(html.includes('<nav class="setnav"'), `${file} has no set navigation`);
    for (const href of DESTINATIONS) {
      assert.ok(
        html.includes(`<a href="${href}"`),
        `${file} navigation cannot reach ${href}`
      );
    }
    assert.ok(
      html.includes('class="setnav-home" href="/"'),
      `${file} house mark does not link back to the site root`
    );
  }
});

test("the page you are on is the page that is marked, once", () => {
  for (const [file, self] of PAGES) {
    const html = pages[file];
    const marked = [...html.matchAll(/<a href="([^"]+)" aria-current="page">/g)].map((m) => m[1]);
    assert.deepEqual(
      marked,
      [self],
      `${file} marks ${marked.join(", ") || "nothing"} as the current page instead of ${self}`
    );
  }
});

test("the mark is the house logo, not a redrawing of it", () => {
  const strokes = [...railLogo.matchAll(/\['(M[^']+)',\s*[\d.]+\]/g)].map((m) => m[1]);
  const pour = railLogo.match(/const POUR = '([^']+)'/)[1];
  assert.equal(strokes.length, 6, "RailLogo no longer draws six strokes; the static copy needs revisiting");

  for (const [file] of PAGES) {
    const svg = pages[file].match(/<svg class="setnav-mark"[\s\S]*?<\/svg>/)[0];
    for (const d of [...strokes, pour]) {
      assert.ok(
        svg.includes(`d="${d}"`),
        `${file} mark is missing a path the house logo draws: ${d.slice(0, 24)}`
      );
    }
    assert.ok(
      svg.includes('aria-hidden="true"'),
      `${file} mark is not hidden from the accessibility tree, so the link is announced twice`
    );
    assert.ok(
      /stroke="currentColor"/.test(svg) && /fill="currentColor"/.test(svg),
      `${file} mark hardcodes a colour instead of taking the page's ink`
    );
  }
});

test("the bar has no colour of its own: every value comes from the page it sits on", () => {
  for (const name of STYLED) {
    const css = sheets[name];
    const block = css.slice(css.indexOf(".setnav {"));
    assert.ok(block.length > 0, `${name} has no .setnav rule`);
    const literals = [...block.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0]);
    assert.deepEqual(
      literals,
      [],
      `${name} navigation hardcodes ${literals.join(", ")} instead of using its own tokens`
    );
    assert.ok(
      /position: sticky/.test(block) && /top: 0/.test(block),
      `${name} navigation does not stay put on a long page`
    );
    assert.ok(
      /\.setnav \{\s*position: static;/.test(block.replace(/\r?\n\s*/g, " ").replace(/\/\*[\s\S]*?\*\//g, "")) ||
        /position: static/.test(block),
      `${name} keeps the bar sticky on phones, where a wrapped bar costs a tenth of the screen`
    );
  }
});

test("the bar never sits over the skip link, and jump targets clear it", () => {
  for (const name of STYLED) {
    const css = sheets[name];
    const navZ = Number(css.slice(css.indexOf(".setnav {")).match(/z-index:\s*(\d+)/)[1]);
    const skipBlocks = [...css.matchAll(/\.skip \{([^}]*)\}/g)].map((m) => m[1]);
    const skipZ = Math.max(
      ...skipBlocks.map((b) => {
        const hit = b.match(/z-index:\s*(\d+)/);
        return hit ? Number(hit[1]) : 0;
      })
    );
    assert.ok(
      skipZ > navZ,
      `${name} skip link (z-index ${skipZ}) lands under the navigation (z-index ${navZ})`
    );
    assert.ok(
      /:target \{[^}]*scroll-margin-top/.test(css),
      `${name} does not clear the sticky bar when a link jumps to an anchor`
    );
  }
});

test("the bar type holds the 16px floor every campaign declares", () => {
  for (const name of STYLED) {
    const block = sheets[name].slice(sheets[name].indexOf(".setnav {"));
    const sizes = [...block.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
    assert.ok(sizes.length > 0, `${name} navigation sets no type size`);
    assert.equal(
      sizes.filter((s) => s < 16).length,
      0,
      `${name} navigation sets ${sizes.filter((s) => s < 16).join(",")}px type under the floor`
    );
  }
});
