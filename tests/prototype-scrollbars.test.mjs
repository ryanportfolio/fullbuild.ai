import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/*
  Six campaign pages draw their own scrollbar. Each one has to quote its own
  campaign: the track is that page's ground, the thumb is a mark that page
  already draws, the channel edge is a rule weight that page already uses, and
  the corner is a radius that page already takes. These tests read the values
  out of each stylesheet rather than trusting the numbers written here, so a
  token rename or a palette change fails loudly instead of drifting.
*/

const BARS = {
  foredge: {
    channel: 12,
    track: "--paper",
    thumb: "--ink",
    edge: "--ash",
    edgeWidth: "1px",
    radius: "6px",
    inset: "4px",
  },
  foxglove: {
    channel: 12,
    track: "--blush",
    thumb: "--coral",
    edge: "--peach",
    edgeWidth: "1px",
    radius: "0",
    inset: "4px",
  },
  foxtail: {
    channel: 12,
    track: "--cream",
    thumb: "--voltage",
    edge: "--ash",
    edgeWidth: "1.5px",
    radius: "0",
    inset: "3px",
  },
  foundry: {
    channel: 14,
    track: "--canvas",
    thumb: "--ink",
    edge: "--ink",
    edgeWidth: "1px",
    radius: "0",
    inset: "3px",
  },
  forecourt: {
    channel: 12,
    track: "--oat",
    thumb: "--hedge",
    edge: "--rye",
    edgeWidth: "1px",
    radius: "999px",
    inset: "3px",
  },
  marketing: {
    channel: 14,
    track: "--paper",
    thumb: "--ink",
    edge: "--ash",
    edgeWidth: "1px",
    radius: "999px",
    inset: "3px",
  },
};

const sheets = {};
for (const name of Object.keys(BARS)) {
  sheets[name] = await readFile(
    new URL(`../public/prototype/${name}/css/site.css`, import.meta.url),
    "utf8"
  );
}

const rule = (css, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return match ? match[1] : null;
};

test("every campaign draws its own scrollbar, in its own tokens", () => {
  for (const [name, bar] of Object.entries(BARS)) {
    const css = sheets[name];

    const channel = rule(css, "::-webkit-scrollbar");
    assert.ok(channel, `${name} declares no scrollbar`);
    assert.ok(
      new RegExp(`width:\\s*${bar.channel}px`).test(channel) &&
        new RegExp(`height:\\s*${bar.channel}px`).test(channel),
      `${name} channel is not ${bar.channel}px in both directions`
    );

    const track = rule(css, "::-webkit-scrollbar-track");
    assert.ok(
      track.includes(`background: var(${bar.track})`),
      `${name} track is not ${bar.track}, the ground its page is painted on`
    );

    const thumb = rule(css, "::-webkit-scrollbar-thumb");
    assert.ok(
      thumb.includes(`background: var(${bar.thumb})`),
      `${name} thumb is not ${bar.thumb}`
    );
    assert.ok(
      thumb.includes("background-clip: padding-box") &&
        thumb.includes(`border: ${bar.inset}px solid transparent`.replace("pxpx", "px")),
      `${name} thumb must be inset by a ${bar.inset} transparent border over padding-box, which is what makes the bar narrower than the channel`
    );
    assert.ok(
      thumb.includes(`border-radius: ${bar.radius}`),
      `${name} thumb corner is not ${bar.radius}`
    );

    const railV = rule(css, "::-webkit-scrollbar-track:vertical");
    const railH = rule(css, "::-webkit-scrollbar-track:horizontal");
    assert.ok(
      railV.includes(`border-left: ${bar.edgeWidth} solid var(${bar.edge})`),
      `${name} vertical channel edge is not a ${bar.edgeWidth} ${bar.edge} rule`
    );
    assert.ok(
      railH.includes(`border-top: ${bar.edgeWidth} solid var(${bar.edge})`),
      `${name} horizontal channel edge is not a ${bar.edgeWidth} ${bar.edge} rule`
    );

    const corner = rule(css, "::-webkit-scrollbar-corner");
    assert.ok(
      corner.includes(`background: var(${bar.track})`),
      `${name} leaves the corner between the two bars unpainted`
    );
  }
});

test("the ground, the mark and the edge are all values the campaign already ships", () => {
  for (const [name, bar] of Object.entries(BARS)) {
    const css = sheets[name];
    const root = css.match(/:root\s*\{([\s\S]*?)\}/)[1];

    for (const token of [bar.track, bar.thumb, bar.edge]) {
      assert.ok(
        new RegExp(`${token}:\\s*#[0-9a-f]{6}`).test(root),
        `${name} scrollbar uses ${token}, which its :root does not define`
      );
    }

    // The channel edge is a rule weight this page already draws with.
    const body = css.slice(css.indexOf(":root"));
    const borders = [...body.matchAll(/border(?:-top|-bottom|-left|-right)?:\s*([\d.]+)px solid/g)].map(
      (m) => `${m[1]}px`
    );
    assert.ok(
      borders.filter((w) => w === bar.edgeWidth).length > 1,
      `${name} draws its scrollbar edge at ${bar.edgeWidth}, a weight it uses nowhere else`
    );

    // The corner is a radius this page already takes. Square counts as a
    // radius only when the page actually declares square-cornered blocks.
    if (bar.radius === "0") {
      const declared = [...body.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim());
      assert.ok(
        declared.includes("0") || /Radius 0|radius 0|square/i.test(css.slice(0, css.indexOf(":root"))),
        `${name} thumb is square but the page never states a square corner`
      );
    } else {
      const declared = [...body.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim());
      assert.ok(
        declared.includes(bar.radius),
        `${name} thumb takes ${bar.radius}, a corner the page never draws`
      );
    }
  }
});

test("the thumb is narrower than its channel and still wide enough to grab", () => {
  for (const [name, bar] of Object.entries(BARS)) {
    const drawn = bar.channel - Number(bar.inset.replace("px", "")) * 2;
    assert.ok(drawn >= 4, `${name} draws a ${drawn}px thumb, too thin to hit`);
    assert.ok(drawn < bar.channel, `${name} thumb fills its channel, so the track never reads`);
  }
});

test("Firefox gets the colours through the standard property, and only Firefox", () => {
  for (const [name, bar] of Object.entries(BARS)) {
    const css = sheets[name];
    const block = css.match(/@supports not selector\(::-webkit-scrollbar\)\s*\{([\s\S]*?)\n\}/);
    assert.ok(block, `${name} has no @supports fallback, so Firefox gets a default scrollbar`);
    assert.ok(
      block[1].includes(`scrollbar-color: var(${bar.thumb}) var(${bar.track})`),
      `${name} fallback does not carry the same two colours as the drawn bar`
    );
    assert.ok(
      block[1].includes("scrollbar-width: thin"),
      `${name} fallback does not thin the bar`
    );
    // The guard matters: without it, Blink honours the standard property and
    // drops the geometry the webkit rules draw.
    const guardIndex = css.indexOf("@supports not selector(::-webkit-scrollbar)");
    const strayColor = css.slice(0, guardIndex).includes("scrollbar-color:");
    assert.equal(strayColor, false, `${name} sets scrollbar-color outside the @supports guard, which overrides the drawn bar in Chrome`);
  }
});

test("each campaign's bar is told apart from the others by more than colour", () => {
  const signature = Object.entries(BARS).map(
    ([name, bar]) => `${name}:${bar.channel}/${bar.inset}/${bar.radius}/${bar.edgeWidth}`
  );
  const shapes = signature.map((s) => s.split(":")[1]);
  const duplicates = shapes.filter((s, i) => shapes.indexOf(s) !== i);
  assert.deepEqual(
    duplicates,
    [],
    `two campaigns draw an identical bar shape (${duplicates.join(", ")}), so only colour separates them`
  );
});

test("the scroll decision is written down in every contract header", () => {
  for (const name of Object.keys(BARS)) {
    const header = sheets[name].slice(0, sheets[name].indexOf("*/"));
    assert.ok(
      /Scroll\s{2,}/.test(header),
      `${name} styles its scrollbar but its contract header never says why`
    );
    assert.ok(
      /macOS/.test(header),
      `${name} does not state the cost: a styled bar replaces the macOS overlay scrollbar with a permanent one`
    );
  }
});
