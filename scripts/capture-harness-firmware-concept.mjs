import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const base = process.env.HARNESS_CAPTURE_URL ?? "http://127.0.0.1:4327/harness-firmware/concept/";
const out = process.env.HARNESS_CAPTURE_OUT ?? ".tmp/harness-concept-shots";
const loopOut = process.env.HARNESS_LOOP_CAPTURE_OUT ?? ".tmp/harness-loop-showpiece";
const captureScope = process.env.HARNESS_CAPTURE_SCOPE ?? "all";
// Use two fresh reports for review-sized runs: `mechanisms` covers the integrated
// sections, while `loop-phaser` covers the preserved story, loop, and phaser matrix.
if (!["all", "mechanisms", "loop-phaser", "story-mechanisms"].includes(captureScope)) throw new RangeError(`Unknown capture scope: ${captureScope}`);
mkdirSync(out, { recursive: true });
mkdirSync(loopOut, { recursive: true });
const beats = ["intent", "context", "bounded-work", "execution", "evidence", "review-fork", "repair", "reconcile", "release", "refine"];
const sceneTextFloorPx = 11;
const loopBeats = ["loop-plan", "loop-advance", "loop-check", "loop-fail", "loop-return", "loop-ship", "loop-static"];
const loopProgress = { "loop-plan": 0.06, "loop-advance": 0.20, "loop-check": 0.355, "loop-fail": 0.505, "loop-return": 0.655, "loop-ship": 0.815, "loop-static": 1 };
const browser = await chromium.launch({
  headless: true,
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-gpu",
    "--disable-lcd-text",
    "--disable-font-subpixel-positioning",
    "--font-render-hinting=none",
    "--run-all-compositor-stages-before-draw",
    "--disable-features=PaintHolding",
  ],
});
const report = { captures: [], errors: [], measurements: {}, gates: { sceneTextFloorPx } };

function watch(page, name) {
  page.on("console", (message) => { if (message.type() === "error") report.errors.push(`${name} console: ${message.text()}`); });
  page.on("pageerror", (error) => report.errors.push(`${name} page: ${error.message}`));
  page.on("requestfailed", (request) => report.errors.push(`${name} request: ${request.url()} ${request.failure()?.errorText ?? "failed"}`));
}

async function contextFor(theme, viewport, javaScriptEnabled = true) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, javaScriptEnabled, colorScheme: theme, reducedMotion: javaScriptEnabled ? "no-preference" : "reduce" });
  return context;
}

async function shot(page, name, options = {}) {
  const path = join(out, `${name}.png`);
  await page.screenshot({ path, ...options });
  report.captures.push(path);
  return path;
}

async function elementShot(page, selector, name) {
  const path = join(out, `${name}.png`);
  await page.locator(".instrument-rail, .skip-link").evaluateAll((elements) => elements.forEach((element) => { element.style.visibility = "hidden"; }));
  await page.locator(selector).screenshot({ path });
  await page.locator(".instrument-rail, .skip-link").evaluateAll((elements) => elements.forEach((element) => { element.style.removeProperty("visibility"); }));
  report.captures.push(path);
  return path;
}

async function loopShot(page, selector, name) {
  const path = join(loopOut, `${name}.png`);
  await page.locator(".instrument-rail, .skip-link").evaluateAll((elements) => elements.forEach((element) => { element.style.visibility = "hidden"; }));
  await page.locator(selector).screenshot({ path });
  await page.locator(".instrument-rail, .skip-link").evaluateAll((elements) => elements.forEach((element) => { element.style.removeProperty("visibility"); }));
  report.captures.push(path);
  return path;
}

async function loopStageShotWithoutScroll(page, name) {
  const path = join(loopOut, `${name}.png`);
  await page.locator(".instrument-rail, .skip-link").evaluateAll((elements) => elements.forEach((element) => { element.style.visibility = "hidden"; }));
  const box = await page.locator(".loop-stage").boundingBox();
  if (!box) throw new Error(`${name}: loop stage has no capture box`);
  await page.screenshot({ path, clip: box });
  await page.locator(".instrument-rail, .skip-link").evaluateAll((elements) => elements.forEach((element) => { element.style.removeProperty("visibility"); }));
  report.captures.push(path);
  return path;
}

async function open(theme, viewport, name, javaScriptEnabled = true, freezeComparison = true) {
  const context = await contextFor(theme, viewport, javaScriptEnabled);
  const page = await context.newPage();
  watch(page, name);
  await page.goto(base, { waitUntil: "networkidle" });
  const sentinel = await page.locator("h1").innerText();
  if (!sentinel.includes("Harness Firmware") || !sentinel.includes("makes AI") || !sentinel.includes("better")) throw new Error(`${name}: stale sentinel ${sentinel}`);
  if (freezeComparison && javaScriptEnabled) await freezeMemoryComparison(page);
  return { context, page };
}

async function freezeMemoryComparison(page) {
  await page.addStyleTag({ content: `
    #hfc-memory-comparison .row,
    #hfc-memory-comparison .hdr { animation: none !important; opacity: 1 !important; transform: none !important; }
    #hfc-memory-comparison .x-mark,
    #hfc-memory-comparison .check { animation: none !important; stroke-dashoffset: 0 !important; }
    #hfc-memory-comparison .pulse { animation: none !important; opacity: .8 !important; }
  ` });
}

async function settleLoopCompositor(page) {
  const noJs = await page.locator("html").evaluate((root) => root.classList.contains("no-js"));
  if (noJs) {
    await page.evaluate(async () => {
      await document.fonts.ready;
      const chamber = document.querySelector("[data-loop-proof]");
      const previousTransform = chamber.style.transform;
      chamber.style.transform = "translateZ(0)";
      chamber.getBoundingClientRect();
      chamber.style.transform = previousTransform;
      chamber.getBoundingClientRect();
    });
    await page.screenshot();
    await page.screenshot();
    return;
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const chamber = document.querySelector("[data-loop-proof]");
        const previousTransform = chamber.style.transform;
        chamber.style.transform = "translateZ(0)";
        chamber.getBoundingClientRect();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        chamber.style.transform = previousTransform;
        chamber.getBoundingClientRect();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      return;
    } catch (error) {
      if (!error.message.includes("Execution context was destroyed") || attempt === 2) throw error;
      await page.waitForLoadState("domcontentloaded");
    }
  }
}

async function holdLoopCompositor(page) {
  const noJs = await page.locator("html").evaluate((root) => root.classList.contains("no-js"));
  const commit = () => {
    const chamber = document.querySelector("[data-loop-proof]");
    const map = [...document.querySelectorAll(".loop-proof-map")].find((candidate) => candidate.getBoundingClientRect().width > 0);
    chamber.style.willChange = "transform";
    chamber.style.transform = "translateZ(0)";
    map.style.willChange = "transform";
    map.style.transform = "translateZ(0)";
    for (const element of map.querySelectorAll("text, path, rect")) {
      if (getComputedStyle(element).display === "none") continue;
      element.getBoundingClientRect();
      if (element instanceof SVGGraphicsElement) element.getBBox();
      if (element instanceof SVGTextContentElement) element.getComputedTextLength();
    }
  };
  if (noJs) {
    await page.evaluate(commit);
    return;
  }
  await page.evaluate(async () => {
    const chamber = document.querySelector("[data-loop-proof]");
    const map = [...document.querySelectorAll(".loop-proof-map")].find((candidate) => candidate.getBoundingClientRect().width > 0);
    chamber.style.willChange = "transform";
    chamber.style.transform = "translateZ(0)";
    map.style.willChange = "transform";
    map.style.transform = "translateZ(0)";
    for (const element of map.querySelectorAll("text, path, rect")) {
      if (getComputedStyle(element).display === "none") continue;
      element.getBoundingClientRect();
      if (element instanceof SVGGraphicsElement) element.getBBox();
      if (element instanceof SVGTextContentElement) element.getComputedTextLength();
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  });
}

async function releaseLoopCompositor(page) {
  await page.evaluate(() => {
    const chamber = document.querySelector("[data-loop-proof]");
    const map = [...document.querySelectorAll(".loop-proof-map")].find((candidate) => candidate.getBoundingClientRect().width > 0);
    chamber.style.removeProperty("will-change");
    chamber.style.removeProperty("transform");
    map.style.removeProperty("will-change");
    map.style.removeProperty("transform");
  });
}

async function validateLoopRaster(page, path, zones, name, captionRequired = true) {
  const source = `data:image/png;base64,${readFileSync(path).toString("base64")}`;
  const pixels = await page.evaluate(async ({ source, zones }) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const signal = (rect) => {
      const left = Math.max(0, Math.floor(rect.x));
      const top = Math.max(0, Math.floor(rect.y));
      const right = Math.min(canvas.width, Math.ceil(rect.x + rect.width));
      const bottom = Math.min(canvas.height, Math.ceil(rect.y + rect.height));
      let count = 0;
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          const r = data[offset];
          const g = data[offset + 1];
          const b = data[offset + 2];
          const maximum = Math.max(r, g, b);
          const minimum = Math.min(r, g, b);
          if ((r > 135 && g > 135 && b > 135) || (maximum > 115 && maximum - minimum > 28)) count += 1;
        }
      }
      return count;
    };
    const colorSignal = (rect, kind) => {
      const left = Math.max(0, Math.floor(rect.x));
      const top = Math.max(0, Math.floor(rect.y));
      const right = Math.min(canvas.width, Math.ceil(rect.x + rect.width));
      const bottom = Math.min(canvas.height, Math.ceil(rect.y + rect.height));
      let count = 0;
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          const r = data[offset];
          const g = data[offset + 1];
          const b = data[offset + 2];
          if (kind === "cyan" && b > 145 && g > 125 && b - r > 48) count += 1;
          else if (kind === "green" && g > 145 && g - r > 34 && g - b > 28) count += 1;
          else if (kind === "neutral" && Math.max(r, g, b) > 62 && Math.max(r, g, b) - Math.min(r, g, b) < 42) count += 1;
        }
      }
      return count;
    };
    return {
      width: canvas.width,
      height: canvas.height,
      captionSignal: signal(zones.caption),
      mapSignal: signal(zones.map),
      stationSignals: zones.stations.map(({ station, rect }) => ({ station, signal: signal(rect), rect })),
      labelSignals: zones.labels.map(({ label, rect }) => ({ label, signal: signal(rect), rect })),
      routeSignals: zones.routes.map(({ route, kind, rect }) => ({ route, kind, signal: colorSignal(rect, kind), rect })),
    };
  }, { source, zones });
  if (captionRequired && pixels.captionSignal < 120) throw new Error(`${name}: raster caption signal missing (${pixels.captionSignal})`);
  if (pixels.mapSignal < 700) throw new Error(`${name}: raster SVG signal missing (${pixels.mapSignal})`);
  const missingStations = pixels.stationSignals.filter((station) => station.signal < 18);
  if (missingStations.length) throw new Error(`${name}: raster station signal missing ${missingStations.map((station) => `${station.station}:${station.signal}:${JSON.stringify(station.rect)}`).join(", ")}`);
  const missingLabels = pixels.labelSignals.filter((label) => label.signal < 2);
  if (missingLabels.length) throw new Error(`${name}: saved PNG is missing required SVG labels ${missingLabels.map((label) => `${label.label}:${label.signal}`).join(", ")}`);
  const missingRoutes = pixels.routeSignals.filter((route) => route.signal < 2);
  if (missingRoutes.length) throw new Error(`${name}: saved PNG is missing required ${missingRoutes.map((route) => `${route.kind} route ${route.route}:${route.signal}`).join(", ")}`);
  return pixels;
}

async function reliableLoopShot(page, selector, name, { hideCopy = false } = {}) {
  const path = join(loopOut, `${name}.png`);
  await page.locator(".instrument-rail, .skip-link").evaluateAll((elements) => elements.forEach((element) => { element.style.visibility = "hidden"; }));
  if (hideCopy) await page.locator("#loop-proof-copy").evaluate((element) => { element.style.visibility = "hidden"; });
  const initialBox = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize();
  if (!initialBox) throw new Error(`${name}: loop capture target has no box`);
  if (viewport.width < 1200 && initialBox.height + 96 > viewport.height) {
    await page.setViewportSize({ width: viewport.width, height: Math.ceil(initialBox.height + 96) });
  }
  await page.locator(selector).scrollIntoViewIfNeeded();
  await settleLoopCompositor(page);
  await holdLoopCompositor(page);
  const geometry = await page.evaluate((selector) => {
    const target = document.querySelector(selector);
    const activeMap = [...document.querySelectorAll(".loop-proof-map")].find((map) => map.getBoundingClientRect().width > 0);
    const targetRect = target.getBoundingClientRect();
    const relative = (rect) => ({ x: rect.x - targetRect.x, y: rect.y - targetRect.y, width: rect.width, height: rect.height });
    const relativePadded = (rect, pad = 3) => ({ x: rect.x - targetRect.x - pad, y: rect.y - targetRect.y - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 });
    const visible = (element) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity || "1") > 0;
    };
    const claimPlate = activeMap.querySelector(".loop-claim-plate");
    const claimPlateRect = visible(claimPlate) ? claimPlate.getBoundingClientRect() : null;
    const occludedByClaimPlate = (label) => {
      if (!claimPlateRect) return false;
      const box = label.getBoundingClientRect();
      const overlapWidth = Math.max(0, Math.min(box.right, claimPlateRect.right) - Math.max(box.left, claimPlateRect.left));
      const overlapHeight = Math.max(0, Math.min(box.bottom, claimPlateRect.bottom) - Math.max(box.top, claimPlateRect.top));
      return overlapWidth * overlapHeight >= box.width * box.height * 0.5;
    };
    const labels = [...activeMap.querySelectorAll("[data-loop-station] text, [data-loop-state-label][data-visible='true'] text")]
      .filter((label) => visible(label) && !occludedByClaimPlate(label))
      .map((label, index) => ({ label: `${label.closest("[data-loop-station]")?.dataset.loopStation ?? "state"}-${index}-${label.textContent.trim()}`, rect: relativePadded(label.getBoundingClientRect(), 2) }));
    const routeKind = (path) => path.closest(".loop-route-active") ? "cyan" : path.closest(".loop-route-retained") ? "green" : "neutral";
    const routes = [...activeMap.querySelectorAll(".loop-route-base path, .loop-route-retained path, .loop-route-active path, .loop-return-residue > path:first-child")]
      .filter(visible)
      .map((route, index) => ({ route: route.dataset.loopActiveRoute ?? route.dataset.loopRetainedRoute ?? `${route.parentElement.getAttribute("class")}-${index}`, kind: routeKind(route), rect: relativePadded(route.getBoundingClientRect(), 4) }));
    const chamberRect = document.querySelector("[data-loop-proof]").getBoundingClientRect();
    return {
      clip: { x: targetRect.x, y: targetRect.y, width: targetRect.width, height: targetRect.height },
      proofClip: { x: chamberRect.x, y: chamberRect.y, width: chamberRect.width, height: chamberRect.height },
      zones: {
        caption: relative(document.querySelector("#loop-proof-copy").getBoundingClientRect()),
        map: relative(activeMap.getBoundingClientRect()),
        stations: [...activeMap.querySelectorAll("[data-loop-station]")].map((station) => ({ station: station.dataset.loopStation, rect: relative(station.getBoundingClientRect()) })),
        labels,
        routes,
      },
    };
  }, selector);
  await page.screenshot({ clip: geometry.clip });
  await settleLoopCompositor(page);
  await page.screenshot({ clip: geometry.clip });
  await settleLoopCompositor(page);
  await page.screenshot({ path, clip: geometry.clip });
  const raster = await validateLoopRaster(page, path, geometry.zones, name, !hideCopy);
  const proofPath = join(loopOut, `${name}-proof.png`);
  await page.screenshot({ path: proofPath, clip: geometry.proofClip });
  if (hideCopy) await page.locator("#loop-proof-copy").evaluate((element) => { element.style.removeProperty("visibility"); });
  await releaseLoopCompositor(page);
  await page.locator(".instrument-rail, .skip-link").evaluateAll((elements) => elements.forEach((element) => { element.style.removeProperty("visibility"); }));
  report.captures.push(path);
  report.captures.push(proofPath);
  return { path, proofPath, raster };
}

async function measureClosing(page) {
  return page.evaluate(() => {
    const closing = document.querySelector(".finale");
    const heading = closing.querySelector("h2");
    const lines = [...heading.querySelectorAll("[data-fit-line]")];
    const paragraph = closing.querySelector(".finale-copy > p:last-child");
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    const words = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      for (const match of node.textContent.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const rect = range.getBoundingClientRect();
        range.detach();
        words.push({ word: match[0], top: Math.round(rect.top) });
      }
    }
    const rows = words.reduce((groups, item) => {
      const row = groups.find((candidate) => Math.abs(candidate.top - item.top) <= 1);
      if (row) row.words.push(item.word);
      else groups.push({ top: item.top, words: [item.word] });
      return groups;
    }, []);
    const closingRect = closing.getBoundingClientRect();
    const lineWidths = lines.map((line) => {
      const range = document.createRange();
      range.selectNodeContents(line);
      const width = range.getBoundingClientRect().width;
      range.detach();
      return width;
    });
    return {
      width: closingRect.width,
      height: closingRect.height,
      headingWidth: heading.clientWidth,
      lineWidths,
      lineFontSizes: lines.map((line) => Number.parseFloat(getComputedStyle(line).fontSize)),
      paragraphFontSize: Number.parseFloat(getComputedStyle(paragraph).fontSize),
      paragraphRows: rows.map((row) => row.words.join(" ")),
      finalParagraphRowWords: rows.at(-1)?.words.length ?? 0,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      overflowing: [...document.querySelectorAll("body *")].map((element) => ({ element, rect: element.getBoundingClientRect() })).filter(({ rect }) => rect.right > innerWidth + 1 || rect.left < -1).slice(0, 20).map(({ element, rect }) => ({ tag: element.tagName, className: typeof element.className === "string" ? element.className : element.getAttribute("class"), text: element.textContent.trim().slice(0, 60), left: rect.left, right: rect.right, width: rect.width })),
      overflowingText: (() => { const found = []; const allText = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); while (allText.nextNode()) { const node = allText.currentNode; if (!node.textContent.trim()) continue; const range = document.createRange(); range.selectNodeContents(node); const rect = range.getBoundingClientRect(); range.detach(); if (rect.right > innerWidth + 1 || rect.left < -1) found.push({ parent: node.parentElement?.className || node.parentElement?.tagName, text: node.textContent.trim().slice(0, 80), left: rect.left, right: rect.right, width: rect.width }); if (found.length >= 20) break; } return found; })(),
    };
  });
}

function verifyClosing(name, measurement, fitted = true) {
  if (measurement.overflow !== 0) throw new Error(`${name}: closing overflow ${measurement.overflow}px ${JSON.stringify({ elements: measurement.overflowing, text: measurement.overflowingText })}`);
  if (measurement.lineWidths.length !== 2) throw new Error(`${name}: expected two authored heading lines`);
  if (measurement.lineWidths.some((width) => width > measurement.headingWidth + 1)) throw new Error(`${name}: heading text exceeds its measure ${JSON.stringify({ headingWidth: measurement.headingWidth, lineWidths: measurement.lineWidths, lineFontSizes: measurement.lineFontSizes })}`);
  if (measurement.finalParagraphRowWords < 2) throw new Error(`${name}: paragraph ends with a one-word line`);
  const phone = measurement.width <= 760;
  const tablet = measurement.width > 760 && measurement.width < 1200;
  if (measurement.paragraphFontSize < 22) throw new Error(`${name}: finale paragraph is too small`);
  if (fitted && measurement.lineWidths.some((width) => width < measurement.headingWidth * 0.99)) throw new Error(`${name}: fitted heading does not fill its measure`);
}

async function measureBeatPanels(page) {
  return page.evaluate(() => {
    const rowsFor = (element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const words = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        for (const match of node.textContent.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const rect = range.getBoundingClientRect();
          range.detach();
          words.push({ word: match[0], top: Math.round(rect.top), left: rect.left, right: rect.right });
        }
      }
      return words.reduce((rows, word) => {
        const row = rows.find((candidate) => Math.abs(candidate.top - word.top) <= 1);
        if (row) {
          row.words.push(word.word);
          row.left = Math.min(row.left, word.left);
          row.right = Math.max(row.right, word.right);
        } else {
          rows.push({ top: word.top, left: word.left, right: word.right, words: [word.word] });
        }
        return rows;
      }, []);
    };

    return [...document.querySelectorAll(".beat[data-beat]")].map((panel) => {
      const summary = panel.querySelector(".beat-claim");
      const mechanism = panel.querySelector("[data-beat-mechanism]");
      const scene = mechanism?.querySelector(".beat-scene");
      const why = mechanism?.querySelector(".mechanism-why");
      const links = mechanism?.querySelector(".mechanism-links");
      const panelRect = panel.getBoundingClientRect();
      const summaryRect = summary?.getBoundingClientRect() ?? panelRect;
      const summaryRows = summary ? rowsFor(summary) : [];
      const whyRows = why ? rowsFor(why) : [];
      const copyFields = [summary, why, scene?.querySelector(".scene-kicker"), ...(mechanism?.querySelectorAll(".mechanism-links a") ?? [])]
        .filter(Boolean)
        .map((element) => element.textContent.replace(/\s+/g, " ").trim().replaceAll(".MD", ""));
      const groups = [...(summary?.querySelectorAll(":scope > span") ?? [])].map((group) => {
        const rect = group.getBoundingClientRect();
        return { text: group.textContent.trim(), words: group.textContent.trim().split(/\s+/).length, width: rect.width, inside: rect.left >= summaryRect.left - 1 && rect.right <= summaryRect.right + 1 };
      });
      const widest = summaryRows.length ? Math.max(...summaryRows.map((row) => row.right - row.left)) : 0;
      const insidePanel = (element) => {
        const rect = element?.getBoundingClientRect();
        return Boolean(rect && rect.left >= panelRect.left - 1 && rect.right <= panelRect.right + 1 && rect.top >= panelRect.top - 1 && rect.bottom <= panelRect.bottom + 1);
      };
      const sourceTargets = [...(mechanism?.querySelectorAll(".mechanism-links a") ?? [])].map((link) => {
        const rect = link.getBoundingClientRect();
        return { label: link.textContent.trim(), width: rect.width, height: rect.height, inside: insidePanel(link) };
      });
      const painted = [...(scene?.querySelectorAll("rect, path, circle") ?? [])].filter((shape) => {
        const geometry = shape.getAttribute("d") || shape.getAttribute("width") || shape.getAttribute("r");
        return Boolean(geometry && geometry !== "0");
      });
      const visibleSceneText = [...(scene?.querySelectorAll("text") ?? [])].filter((text) => {
        const rect = text.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const effectiveSceneTextSizes = visibleSceneText.map((text) => {
        const matrix = text.getScreenCTM();
        const scale = matrix ? Math.hypot(matrix.a, matrix.b) : 0;
        return Number.parseFloat(getComputedStyle(text).fontSize) * scale;
      });
      const containedSceneLabelViolations = visibleSceneText.flatMap((text) => {
        const plate = text.previousElementSibling;
        if (!(plate instanceof SVGRectElement)) return [];
        const labelRect = text.getBoundingClientRect();
        const plateRect = plate.getBoundingClientRect();
        const inside = labelRect.left >= plateRect.left + 0.5 && labelRect.right <= plateRect.right - 0.5 && labelRect.top >= plateRect.top + 0.5 && labelRect.bottom <= plateRect.bottom - 0.5;
        return inside ? [] : [{ label: text.textContent.replace(/\s+/g, " ").trim(), labelRect: labelRect.toJSON(), plateRect: plateRect.toJSON() }];
      });
      return {
        beat: panel.dataset.beat,
        mechanism: mechanism?.dataset.beatMechanism ?? null,
        text: summary?.textContent.replace(/\s+/g, " ").trim() ?? "",
        hasSummary: Boolean(summary),
        fontSize: summary ? Number.parseFloat(getComputedStyle(summary).fontSize) : 0,
        whyFontSize: why ? Number.parseFloat(getComputedStyle(why).fontSize) : 0,
        availableWidth: summaryRect.width,
        usedWidth: widest,
        usedRatio: summaryRows.length ? widest / summaryRect.width : 0,
        lineCount: summaryRows.length,
        rows: summaryRows.map((row) => ({ text: row.words.join(" "), words: row.words.length, width: row.right - row.left })),
        finalLineWords: summaryRows.at(-1)?.words.length ?? 0,
        finalLineText: summaryRows.at(-1)?.words.join(" ") ?? "",
        whyFinalLineWords: whyRows.at(-1)?.words.length ?? 0,
        whyFinalLineText: whyRows.at(-1)?.words.join(" ") ?? "",
        punctuationCounts: copyFields.map((field) => (field.match(/[.—]/g) ?? []).length),
        groups,
        sourceTargets,
        sceneInside: insidePanel(scene),
        whyInside: insidePanel(why),
        linksInside: insidePanel(links),
        scenePaintedGeometry: painted.length,
        mobileScenePresent: Boolean(scene?.querySelector(".scene-mobile")),
        visibleSceneTextCount: visibleSceneText.length,
        minEffectiveSceneTextPx: effectiveSceneTextSizes.length ? Math.min(...effectiveSceneTextSizes) : 0,
        containedSceneLabelViolations,
        sceneSignature: [...(scene?.querySelectorAll("path") ?? [])].map((path) => path.getAttribute("d")).filter(Boolean).join("|"),
        panelHeight: panelRect.height,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
  });
}

function verifyBeatPanels(name, panels) {
  if (panels.length !== 10) throw new Error(`${name}: expected ten task panels`);
  if (new Set(panels.map((panel) => panel.mechanism)).size !== 10) throw new Error(`${name}: mechanisms are missing or duplicated`);
  if (new Set(panels.map((panel) => panel.sceneSignature)).size !== 10) throw new Error(`${name}: scenes are not structurally unique`);
  for (const panel of panels) {
    const summaryRequired = panel.beat !== "refine";
    if (summaryRequired && panel.fontSize < 22) throw new Error(`${name}/${panel.beat}: summary is ${panel.fontSize}px`);
    const phone = name.includes("phone");
    if (!panel.mobileScenePresent) throw new Error(`${name}/${panel.beat}: authored phone scene is missing`);
    if (panel.visibleSceneTextCount < 4 || panel.minEffectiveSceneTextPx < sceneTextFloorPx) throw new Error(`${name}/${panel.beat}: scene text floor is ${panel.minEffectiveSceneTextPx.toFixed(2)}px, requires ${sceneTextFloorPx}px`);
    if (panel.containedSceneLabelViolations.length) throw new Error(`${name}/${panel.beat}: scene labels leave their plates: ${panel.containedSceneLabelViolations.map((item) => item.label).join(", ")}`);
    if (panel.whyFontSize < (phone ? 18 : 17)) throw new Error(`${name}/${panel.beat}: why line is ${panel.whyFontSize}px`);
    if (summaryRequired && panel.finalLineWords < 2) throw new Error(`${name}/${panel.beat}: one-word final line ${panel.finalLineText}`);
    if (panel.whyFinalLineWords < 2) throw new Error(`${name}/${panel.beat}: why line ends with one word ${panel.whyFinalLineText}`);
    if (panel.punctuationCounts.some((count) => count !== 0)) throw new Error(`${name}/${panel.beat}: banned punctuation remains in task-panel copy`);
    if (panel.groups.some((group) => group.words < 2 || !group.inside)) throw new Error(`${name}/${panel.beat}: authored group is orphaned or outside its summary`);
    if (summaryRequired && panel.usedRatio < 0.62) throw new Error(`${name}/${panel.beat}: summary uses only ${(panel.usedRatio * 100).toFixed(1)}% of its width`);
    if (!panel.sceneInside || !panel.whyInside || !panel.linksInside) throw new Error(`${name}/${panel.beat}: scene, why, or links leave panel bounds`);
    if (!panel.sourceTargets.length || panel.sourceTargets.some((target) => target.height < 44 || !target.inside)) throw new Error(`${name}/${panel.beat}: source target missing, undersized, or outside panel`);
    if (panel.scenePaintedGeometry < 4) throw new Error(`${name}/${panel.beat}: scene has ${panel.scenePaintedGeometry} painted geometry marks`);
    if (panel.pageOverflow !== 0) throw new Error(`${name}/${panel.beat}: horizontal overflow ${panel.pageOverflow}px`);
    if (!phone && panel.panelHeight > 760) throw new Error(`${name}/${panel.beat}: panel is ${panel.panelHeight}px tall`);
  }
  for (const [beat, orphan] of [["execution", "conditions"], ["repair", "approach"]]) {
    const panel = panels.find((candidate) => candidate.beat === beat);
    if (panel.finalLineText.trim().toLowerCase() === orphan) throw new Error(`${name}/${beat}: ${orphan} is orphaned`);
  }
}

async function measureRoundSeven(page) {
  return page.evaluate(() => {
    const textWidth = (element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const width = range.getBoundingClientRect().width;
      range.detach();
      return width;
    };
    const parse = (value) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (value) => {
      const [r, g, b] = parse(value).map((channel) => {
        const unit = channel / 255;
        return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (foreground, background) => {
      const a = luminance(foreground);
      const b = luminance(background);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const loopTitle = document.querySelector(".loop-title");
    const equationTitle = document.querySelector(".equation-title");
    const loopCells = [...document.querySelectorAll(".loop-track li")];
    const caveman = document.querySelector(".caveman-disclosure");
    const cavemanGround = getComputedStyle(document.querySelector(".technical-section")).backgroundColor;
    const cavemanTitle = caveman.querySelector("summary");
    const cavemanBody = caveman.querySelector("p");
    const cavemanBadge = caveman.querySelector(".disclosure-state");
    const closing = document.querySelector(".finale");
    const actions = [...closing.querySelectorAll(".finale-actions .finale-action")];
    const closingRect = closing.getBoundingClientRect();
    return {
      viewport: { width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
      loopTitle: { width: loopTitle.clientWidth, lineWidths: [...loopTitle.querySelectorAll("[data-fit-line]")].map(textWidth), fontSizes: [...loopTitle.querySelectorAll("[data-fit-line]")].map((line) => Number.parseFloat(getComputedStyle(line).fontSize)) },
      loopCells: loopCells.map((cell) => {
        const cellRect = cell.getBoundingClientRect();
        const lines = [...cell.querySelectorAll(".loop-line")];
        return {
          width: cellRect.width,
          strongFont: Number.parseFloat(getComputedStyle(cell.querySelector("strong")).fontSize),
          smallFont: Number.parseFloat(getComputedStyle(cell.querySelector("small")).fontSize),
          lines: lines.map((line) => {
            const rect = line.getBoundingClientRect();
            return { text: line.textContent.trim(), left: rect.left, right: rect.right, scale: Number.parseFloat(getComputedStyle(line).getPropertyValue("--loop-scale")) || 1, inside: rect.left >= cellRect.left - 1 && rect.right <= cellRect.right + 1 };
          }),
        };
      }),
      equationTitle: { width: equationTitle.clientWidth, lineWidths: [...equationTitle.querySelectorAll("[data-fit-line]")].map(textWidth), fontSizes: [...equationTitle.querySelectorAll("[data-fit-line]")].map((line) => Number.parseFloat(getComputedStyle(line).fontSize)) },
      caveman: {
        background: cavemanGround,
        titleColor: getComputedStyle(cavemanTitle).color,
        bodyColor: getComputedStyle(cavemanBody).color,
        badgeColor: getComputedStyle(cavemanBadge).color,
        titleContrast: contrast(getComputedStyle(cavemanTitle).color, cavemanGround),
        bodyContrast: contrast(getComputedStyle(cavemanBody).color, cavemanGround),
        badgeContrast: contrast(getComputedStyle(cavemanBadge).color, cavemanGround),
      },
      closingActions: actions.map((action) => {
        const rect = action.getBoundingClientRect();
        return { label: action.textContent.trim(), left: rect.left, width: rect.width, height: rect.height, fontSize: Number.parseFloat(getComputedStyle(action).fontSize) };
      }),
      closingMidpoint: closingRect.left + closingRect.width / 2,
    };
  });
}

async function measureNoJsRoundSeven(page) {
  const measurement = await measureRoundSeven(page);
  const noJs = await page.evaluate(() => {
    const rectFor = (element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const inside = (inner, outer) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
    const equation = document.querySelector(".equation-section");
    const equationTitle = document.querySelector(".equation-title");
    const caveman = document.querySelector(".caveman-disclosure");
    const closing = document.querySelector(".finale");
    const closingRect = rectFor(closing);
    return {
      rootClass: document.documentElement.className,
      loopText: [...document.querySelectorAll(".loop-track li")].map((cell) => ({
        heading: cell.querySelector("strong").innerText.trim(),
        support: cell.querySelector("small").innerText.trim(),
      })),
      heuristic: {
        text: equationTitle.innerText.trim(),
        section: rectFor(equation),
        title: rectFor(equationTitle),
        inside: inside(rectFor(equationTitle), rectFor(equation)),
      },
      caveman: {
        open: caveman.open,
        visible: getComputedStyle(caveman).display !== "none" && caveman.getBoundingClientRect().height > 0,
        rect: rectFor(caveman),
      },
      closingActions: [...closing.querySelectorAll(".finale-actions .finale-action")].map((action) => ({
        label: action.textContent.trim(),
        rect: rectFor(action),
        inside: inside(rectFor(action), closingRect),
      })),
    };
  });
  return { ...measurement, noJs };
}

function verifyRoundSeven(name, measurement) {
  const phone = measurement.viewport.width <= 760;
  const tablet = measurement.viewport.width > 760 && measurement.viewport.width < 1200;
  if (measurement.viewport.scrollWidth !== measurement.viewport.width) throw new Error(`${name}: horizontal overflow`);
  if (measurement.loopTitle.lineWidths.some((width) => width > measurement.loopTitle.width + 1 || width < measurement.loopTitle.width * 0.99)) throw new Error(`${name}: loop heading fit failed`);
  if (measurement.equationTitle.lineWidths.some((width) => width > measurement.equationTitle.width + 1 || width < measurement.equationTitle.width * 0.99)) throw new Error(`${name}: heuristic heading fit failed`);
  const escapedLines = measurement.loopCells.flatMap((cell, index) => cell.lines.filter((line) => !line.inside).map((line) => `${index + 1}:${line.text} (${line.left.toFixed(1)}..${line.right.toFixed(1)} in ${cell.width.toFixed(1)}px)`));
  if (escapedLines.length) throw new Error(`${name}: loop copy leaves its cell: ${escapedLines.join(", ")}`);
  const strongFloor = phone ? 22 : tablet ? 24 : 28;
  const smallFloor = phone ? 17 : tablet ? 17 : 18;
  if (measurement.loopCells.some((cell) => cell.strongFont < strongFloor || cell.smallFont < smallFloor)) throw new Error(`${name}: loop copy remains undersized`);
  for (const key of ["titleContrast", "bodyContrast", "badgeContrast"]) {
    if (measurement.caveman[key] < 4.5) throw new Error(`${name}: Caveman ${key} is ${measurement.caveman[key].toFixed(2)}:1`);
  }
  if (measurement.closingActions.length !== 2) throw new Error(`${name}: expected two closing destinations`);
  if (measurement.closingActions.some((action) => action.height < 44)) throw new Error(`${name}: closing destination below 44px`);
  if (!phone && measurement.closingActions.some((action) => action.left < measurement.closingMidpoint - 24)) throw new Error(`${name}: finale destinations do not occupy the right half`);
}

function verifyNoJsRoundSeven(name, measurement) {
  const phone = measurement.viewport.width <= 760;
  const tablet = measurement.viewport.width > 760 && measurement.viewport.width < 1200;
  const expectedStrong = phone ? 22 : tablet ? 24 : 30;
  const expectedSmall = phone ? 17 : tablet ? 17 : 18;
  if (!measurement.noJs.rootClass.includes("no-js")) throw new Error(`${name}: no-JS root state missing`);
  if (measurement.viewport.scrollWidth !== measurement.viewport.width) throw new Error(`${name}: horizontal overflow`);
  if (measurement.loopCells.some((cell) => cell.strongFont !== expectedStrong || cell.smallFont !== expectedSmall)) throw new Error(`${name}: loop type does not match the responsive JS design`);
  const escapedLines = measurement.loopCells.flatMap((cell, index) => cell.lines.filter((line) => !line.inside).map((line) => `${index + 1}:${line.text}`));
  if (escapedLines.length) throw new Error(`${name}: loop copy leaves its cell: ${escapedLines.join(", ")}`);
  if (measurement.noJs.loopText.length !== 5 || measurement.noJs.loopText.some((item) => !item.heading || !item.support)) throw new Error(`${name}: loop text is missing`);
  if (!measurement.noJs.heuristic.text.includes("Three things") || !measurement.noJs.heuristic.text.includes("shape the result") || !measurement.noJs.heuristic.inside) throw new Error(`${name}: heuristic text is missing or outside its section`);
  if (!measurement.noJs.caveman.open || !measurement.noJs.caveman.visible) throw new Error(`${name}: Caveman is not open and visible`);
  for (const key of ["titleContrast", "bodyContrast", "badgeContrast"]) {
    if (measurement.caveman[key] < 4.5) throw new Error(`${name}: Caveman ${key} is ${measurement.caveman[key].toFixed(2)}:1`);
  }
  if (measurement.noJs.closingActions.length !== 2 || measurement.noJs.closingActions.some((action) => action.rect.height < 44 || !action.inside)) throw new Error(`${name}: closing destinations are missing, undersized, or outside the closing section`);
}

async function measureLoopProof(page) {
  return page.evaluate(() => {
    const numericRect = (value) => value ? ({ x: value.x, y: value.y, top: value.top, right: value.right, bottom: value.bottom, left: value.left, width: value.width, height: value.height }) : null;
    const rect = (element) => numericRect(element?.getBoundingClientRect());
    const svgRect = (value) => ({ x: value.x, y: value.y, width: value.width, height: value.height });
    const stage = document.querySelector("[data-loop-stage]");
    const loopScrollElement = document.querySelector("[data-loop-scroll]");
    const heading = stage.querySelector(".section-head");
    const chamber = document.querySelector("[data-loop-proof]");
    const caption = chamber.querySelector("figcaption");
    const activeMap = [...document.querySelectorAll(".loop-proof-map")].find((map) => map.getBoundingClientRect().width > 0);
    const styles = getComputedStyle(stage);
    const columns = styles.gridTemplateColumns.split(" ").map(Number.parseFloat);
    const labelChecks = [];
    activeMap.querySelectorAll("[data-loop-station]").forEach((station) => {
      const box = station.querySelector(":scope > rect").getBBox();
      station.querySelectorAll(":scope > text").forEach((label) => {
        if (getComputedStyle(label).display === "none") return;
        const text = label.getBBox();
        labelChecks.push({ station: station.dataset.loopStation, text: label.textContent.trim(), inside: text.x >= box.x - 1 && text.y >= box.y - 1 && text.x + text.width <= box.x + box.width + 1 && text.y + text.height <= box.y + box.height + 1, box: svgRect(box), bounds: svgRect(text) });
      });
    });
    const svgBox = activeMap.getBoundingClientRect();
    const viewWidth = activeMap.viewBox.baseVal.width;
    const labelSizes = [...activeMap.querySelectorAll("text")]
      .filter((label) => getComputedStyle(label).display !== "none")
      .map((label) => Number.parseFloat(getComputedStyle(label).fontSize) * svgBox.width / viewWidth);
    const rig = activeMap.querySelector("[data-loop-claim-rig]");
    const transform = rig.getAttribute("transform")?.match(/[\d.-]+/g)?.map(Number) ?? [];
    const gateY = activeMap.classList.contains("loop-proof-map-phone") ? 611 : 447;
    const rigMode = rig.dataset.mode;
    const shipStation = activeMap.querySelector('[data-loop-station="ship"]');
    const shipStationRect = shipStation.querySelector(":scope > rect:first-child");
    const shipStationStyle = getComputedStyle(shipStationRect);
    const state = window.__capture?.state?.().loop ?? { held: false, beat: chamber.dataset.state, progress: 1, dominant: "loop-static", gate: "open", claim: "retained", route: "settled" };
    const dominant = [...activeMap.querySelectorAll("[data-loop-dominant]")];
    const walker = document.createTreeWalker(caption, NodeFilter.SHOW_TEXT);
    const words = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      for (const match of node.textContent.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const wordRect = range.getBoundingClientRect();
        range.detach();
        words.push({ word: match[0], top: Math.round(wordRect.top) });
      }
    }
    const copyRows = words.reduce((rows, item) => {
      const row = rows.find((candidate) => Math.abs(candidate.top - item.top) <= 1);
      if (row) row.words.push(item.word);
      else rows.push({ top: item.top, words: [item.word] });
      return rows;
    }, []);
    return {
      viewport: { width: innerWidth, scrollWidth: document.documentElement.scrollWidth },
      javaScriptEnhanced: document.documentElement.classList.contains("js"),
      state,
      stage: rect(stage),
      heading: rect(heading),
      chamber: rect(chamber),
      loopRangePx: Math.max(0, loopScrollElement.offsetHeight - innerHeight),
      bandPixels: [0.12, 0.16, 0.15, 0.15, 0.15, 0.17, 0.10].map((share) => Math.max(0, loopScrollElement.offsetHeight - innerHeight) * share),
      caption: rect(caption),
      copyRows,
      copyFinalLineWords: copyRows.at(-1)?.words.length ?? 0,
      copySingleWordRows: copyRows.filter((row) => row.words.length === 1),
      columns,
      gap: Number.parseFloat(styles.columnGap),
      chamberHeadingRatio: chamber.getBoundingClientRect().height / heading.getBoundingClientRect().height,
      activeTopology: activeMap.classList.contains("loop-proof-map-phone") ? "phone" : "wide",
      svg: rect(activeMap),
      minLabelSize: Math.min(...labelSizes),
      labelChecks,
      labelsInside: labelChecks.every((check) => check.inside),
      dominantCount: dominant.length,
      dominantText: dominant[0]?.textContent.trim() ?? "",
      claimRigCount: activeMap.querySelectorAll("[data-loop-claim-rig]").length,
      rigMode,
      rigCenter: transform.slice(0, 2),
      packetVisible: rigMode === "packet",
      packetBelowGate: rigMode === "packet" && transform[1] > gateY,
      shipVisual: {
        state: shipStation.dataset.state ?? "static-nojs",
        progress: Number.parseFloat(shipStation.style.getPropertyValue("--loop-station-progress") || (document.documentElement.classList.contains("no-js") ? "1" : "0")),
        stroke: shipStationStyle.stroke,
        fill: shipStationStyle.fill,
      },
      gateBars: [...activeMap.querySelectorAll(".loop-gate-bar")].map((bar) => bar.getAttribute("transform") || "translate(0 0)"),
      residueVisible: getComputedStyle(activeMap.querySelector(".loop-return-residue > path:first-child")).display !== "none",
      blockedVisible: getComputedStyle(activeMap.querySelector(".loop-blocked-label")).display !== "none",
      geometry: {
        heading: rect(heading),
        headingLines: [...heading.querySelectorAll("[data-fit-line]")].map(rect),
        chamber: rect(chamber),
        map: rect(activeMap),
        rigTransform: rig.getAttribute("transform"),
        scanTransform: activeMap.querySelector("[data-loop-scan-gate]").getAttribute("transform"),
        scanBlockTransform: activeMap.querySelector("[data-loop-scan-gate] rect").getAttribute("transform") || "",
        tokenTransform: activeMap.querySelector("[data-loop-return-token]").getAttribute("transform"),
        gateBars: [...activeMap.querySelectorAll(".loop-gate-bar")].map((bar) => bar.getAttribute("transform") || "translate(0 0)"),
        stationStates: [...activeMap.querySelectorAll("[data-loop-station]")].map((station) => [station.dataset.loopStation, station.dataset.state]),
        stationRects: [...activeMap.querySelectorAll("[data-loop-station]")].map((station) => [station.dataset.loopStation, numericRect(station.getBoundingClientRect())]),
      },
    };
  });
}

function verifyLoopProof(name, measurement, beat = "loop-static") {
  if (measurement.viewport.scrollWidth !== measurement.viewport.width) throw new Error(`${name}: horizontal overflow`);
  if (measurement.copyFinalLineWords < 2) throw new Error(`${name}: loop explanation ends with a lone word`);
  if (measurement.copySingleWordRows.length) throw new Error(`${name}: loop explanation contains a one-word line ${JSON.stringify(measurement.copySingleWordRows)}`);
  if (!measurement.labelsInside) throw new Error(`${name}: proof-map label escaped its station`);
  if (measurement.dominantCount !== 1) throw new Error(`${name}: expected one dominant event, got ${measurement.dominantCount}`);
  if (measurement.claimRigCount !== 1) throw new Error(`${name}: active topology does not own exactly one claim rig`);
  if (measurement.state.beat !== beat) throw new Error(`${name}: expected ${beat}, got ${measurement.state.beat}`);
  if (Math.abs(measurement.state.progress - loopProgress[beat]) > 0.0001) throw new Error(`${name}: wrong held progress ${measurement.state.progress}`);
  const expected = {
    "loop-plan": ["closed", "packet", "forward"],
    "loop-advance": ["closed", "packet", "forward"],
    "loop-check": ["closed", "claim", "forward"],
    "loop-fail": ["closed", "confirmed-problem", "return"],
    "loop-return": ["closed", "confirmed-problem", "return"],
    "loop-ship": ["open", "check-passed", "release"],
    "loop-static": ["open", "retained", "settled"],
  }[beat];
  if (measurement.state.gate !== expected[0] || measurement.state.claim !== expected[1] || measurement.state.route !== expected[2]) throw new Error(`${name}: loop state contract drifted`);
  if (beat === "loop-fail" && (measurement.packetBelowGate || !measurement.blockedVisible)) throw new Error(`${name}: failed work reached release or Ship is not blocked`);
  if (beat === "loop-ship" && (!measurement.packetBelowGate || measurement.state.gate !== "open")) throw new Error(`${name}: release packet does not follow the open human gate`);
  if (["loop-return", "loop-ship", "loop-static"].includes(beat) && !measurement.residueVisible) throw new Error(`${name}: retained failed path disappeared`);
  if (measurement.viewport.width === 1440) {
    if (measurement.javaScriptEnhanced && Math.abs(measurement.loopRangePx - 5600) > 1) throw new Error(`${name}: desktop loop range is ${measurement.loopRangePx}px`);
    if (measurement.javaScriptEnhanced && Math.min(...measurement.bandPixels) < 560) throw new Error(`${name}: a named band spans less than 560px`);
    if (Math.abs(measurement.columns[0] - 820) > 1 || Math.abs(measurement.columns[1] - 460) > 1 || Math.abs(measurement.gap - 48) > 1) throw new Error(`${name}: desktop 820 / 48 / 460 composition drifted`);
    if (Math.abs(measurement.heading.width - 820) > 1 || Math.abs(measurement.chamber.width - 460) > 1) throw new Error(`${name}: desktop child width drifted`);
    if (measurement.chamberHeadingRatio < 0.86) throw new Error(`${name}: chamber reaches only ${(measurement.chamberHeadingRatio * 100).toFixed(1)}% of heading block`);
  }
  if (measurement.viewport.width === 390 && measurement.minLabelSize < 10.99) throw new Error(`${name}: phone label renders at ${measurement.minLabelSize}px`);
}

if (["all", "loop-phaser"].includes(captureScope)) {
{
  const { context, page } = await open("dark", { width: 1440, height: 900 }, "desktop-dark");
  await shot(page, "desktop-dark-hero");
  await page.locator(".story-intro").scrollIntoViewIfNeeded();
  await elementShot(page, ".story-intro", "desktop-dark-story-title");
  await page.locator(".hero .action.primary").focus();
  await elementShot(page, ".hero .action.primary", "desktop-dark-focus");
  await page.locator(".hero .action.primary").blur();
  await page.locator("#loop").scrollIntoViewIfNeeded();
  await elementShot(page, "#loop", "desktop-dark-loop");
  await page.locator(".equation-section").scrollIntoViewIfNeeded();
  await elementShot(page, ".equation-section", "desktop-dark-heuristic");
  for (const [index, name] of [[0, "plan"], [2, "verification"]]) {
    const group = page.locator(".skill-group").nth(index);
    await group.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1600);
    await shot(page, `desktop-dark-skills-${name}`);
  }
  await page.locator(".caveman-disclosure").scrollIntoViewIfNeeded();
  await elementShot(page, ".caveman-disclosure", "desktop-dark-caveman");
  await page.locator(".technical-section").scrollIntoViewIfNeeded();
  await elementShot(page, ".technical-section", "desktop-dark-technical");
  await page.locator(".finale").scrollIntoViewIfNeeded();
  await elementShot(page, ".finale", "desktop-dark-finale");
  report.measurements.desktopDarkClosing = await measureClosing(page);
  verifyClosing("desktop-dark", report.measurements.desktopDarkClosing);
  report.measurements.desktopDarkRoundSeven = await measureRoundSeven(page);
  verifyRoundSeven("desktop-dark", report.measurements.desktopDarkRoundSeven);
  for (const beat of beats) {
    await page.evaluate((name) => window.__capture.hold(name), beat);
    await shot(page, `desktop-dark-${beat}`);
  }
  report.measurements.desktopDarkBeats = await measureBeatPanels(page);
  verifyBeatPanels("desktop-dark", report.measurements.desktopDarkBeats);
  report.measurements.desktop = await page.evaluate(() => {
    const rail = document.querySelector(".instrument-rail").getBoundingClientRect();
    const grid = document.querySelector(".story-grid");
    const styles = getComputedStyle(grid);
    const columns = styles.gridTemplateColumns.split(" ").map(Number.parseFloat);
    const rect = grid.getBoundingClientRect();
    const labelChecks = [];
    const within = (label, box, owner) => {
      const text = label.getBBox();
      const rect = box.getBBox();
      labelChecks.push({ owner, label: label.textContent.trim(), inside: text.x >= rect.x - 1 && text.y >= rect.y - 1 && text.x + text.width <= rect.x + rect.width + 1 && text.y + text.height <= rect.y + rect.height + 1, text, rect });
    };
    document.querySelectorAll("#system-map .map-node").forEach((node) => {
      const box = node.querySelector(":scope > rect");
      node.querySelectorAll(":scope > text").forEach((label) => within(label, box, node.dataset.node));
      node.querySelectorAll(":scope > .review-child").forEach((child) => {
        const childBox = child.querySelector("rect");
        child.querySelectorAll("text").forEach((label) => within(label, childBox, `${node.dataset.node}/${child.classList[1]}`));
      });
    });
    return { railHeight: rail.height, storyLeft: rect.left, storyRight: rect.right, gap: Number.parseFloat(styles.columnGap), columns, width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, labelChecks, labelsInside: labelChecks.every((check) => check.inside) };
  });
  await context.close();
}

{
  const { context, page } = await open("light", { width: 1440, height: 900 }, "desktop-light");
  await shot(page, "desktop-light-hero");
  await page.locator("#loop").scrollIntoViewIfNeeded();
  await elementShot(page, "#loop", "desktop-light-loop");
  await page.locator(".equation-section").scrollIntoViewIfNeeded();
  await elementShot(page, ".equation-section", "desktop-light-heuristic");
  await page.locator(".caveman-disclosure").scrollIntoViewIfNeeded();
  await elementShot(page, ".caveman-disclosure", "desktop-light-caveman");
  for (const beat of ["intent", "review-fork", "refine"]) {
    await page.evaluate((name) => window.__capture.hold(name), beat);
    await shot(page, `desktop-light-${beat}`);
  }
  report.measurements.desktopLightBeats = await measureBeatPanels(page);
  verifyBeatPanels("desktop-light", report.measurements.desktopLightBeats);
  await page.locator(".finale").scrollIntoViewIfNeeded();
  await elementShot(page, ".finale", "desktop-light-finale");
  report.measurements.desktopLightClosing = await measureClosing(page);
  verifyClosing("desktop-light", report.measurements.desktopLightClosing);
  report.measurements.desktopLightRoundSeven = await measureRoundSeven(page);
  verifyRoundSeven("desktop-light", report.measurements.desktopLightRoundSeven);
  await context.close();
}

{
  const { context, page } = await open("dark", { width: 390, height: 844 }, "phone-dark");
  await shot(page, "phone-dark-hero");
  await page.locator(".phone-viz").scrollIntoViewIfNeeded();
  await elementShot(page, ".phone-viz", "phone-dark-map");
  await page.locator("#loop").scrollIntoViewIfNeeded();
  await elementShot(page, "#loop", "phone-dark-loop");
  await page.locator(".equation-section").scrollIntoViewIfNeeded();
  await elementShot(page, ".equation-section", "phone-dark-heuristic");
  await page.locator(".caveman-disclosure").scrollIntoViewIfNeeded();
  await elementShot(page, ".caveman-disclosure", "phone-dark-caveman");
  await page.locator(".technical-section").scrollIntoViewIfNeeded();
  await elementShot(page, ".technical-section", "phone-dark-technical");
  for (const beat of beats) {
    await elementShot(page, `.beat[data-beat="${beat}"]`, `phone-dark-${beat}`);
  }
  await page.locator(".finale").scrollIntoViewIfNeeded();
  await elementShot(page, ".finale", "phone-dark-finale");
  report.measurements.phoneDarkClosing = await measureClosing(page);
  verifyClosing("phone-dark", report.measurements.phoneDarkClosing);
  report.measurements.phoneDarkRoundSeven = await measureRoundSeven(page);
  verifyRoundSeven("phone-dark", report.measurements.phoneDarkRoundSeven);
  report.measurements.phoneDarkBeats = await measureBeatPanels(page);
  verifyBeatPanels("phone-dark", report.measurements.phoneDarkBeats);
  await shot(page, "phone-dark-fullpage", { fullPage: true });
  report.measurements.phoneDark = await page.evaluate(() => {
    const all = [...document.querySelectorAll("*")];
    const sticky = all.filter((element) => getComputedStyle(element).position === "sticky").length;
    const mapWidth = document.querySelector(".phone-viz svg").getBoundingClientRect().width;
    const sourceSizes = [...document.querySelectorAll("#system-map text")].map((element) => Number.parseFloat(getComputedStyle(element).fontSize)).filter(Number.isFinite);
    return { width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, sticky, minSvgFont: Math.min(...sourceSizes) * mapWidth / 600, mapWidth };
  });
  await context.close();
}

for (const theme of ["dark", "light"]) {
  const name = `tablet-${theme}`;
  const { context, page } = await open(theme, { width: 1024, height: 768 }, name);
  if (theme === "dark") {
    for (const beat of beats) {
      await page.evaluate((beat) => window.__capture.hold(beat), beat);
      await shot(page, `${name}-${beat}`);
    }
  }
  for (const [selector, suffix] of [
    ["#loop", "loop"],
    [".equation-section", "heuristic"],
    [".caveman-disclosure", "caveman"],
    [".finale", "finale"],
  ]) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    await elementShot(page, selector, `${name}-${suffix}`);
  }
  const roundSeven = await measureRoundSeven(page);
  verifyRoundSeven(name, roundSeven);
  report.measurements[`${name}RoundSeven`] = roundSeven;
  const beatPanels = await measureBeatPanels(page);
  verifyBeatPanels(name, beatPanels);
  report.measurements[`${name}Beats`] = beatPanels;
  report.measurements[name] = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, sticky: getComputedStyle(document.querySelector(".desktop-viz")).position }));
  await context.close();
}

{
  const { context, page } = await open("light", { width: 390, height: 844 }, "phone-light");
  await page.locator(".phone-viz").scrollIntoViewIfNeeded();
  await elementShot(page, ".phone-viz", "phone-light-map");
  await page.locator("#loop").scrollIntoViewIfNeeded();
  await elementShot(page, "#loop", "phone-light-loop");
  await page.locator(".equation-section").scrollIntoViewIfNeeded();
  await elementShot(page, ".equation-section", "phone-light-heuristic");
  await page.locator(".caveman-disclosure").scrollIntoViewIfNeeded();
  await elementShot(page, ".caveman-disclosure", "phone-light-caveman");
  await page.locator(".finale").scrollIntoViewIfNeeded();
  await elementShot(page, ".finale", "phone-light-finale");
  report.measurements.phoneLightClosing = await measureClosing(page);
  verifyClosing("phone-light", report.measurements.phoneLightClosing);
  report.measurements.phoneLightRoundSeven = await measureRoundSeven(page);
  verifyRoundSeven("phone-light", report.measurements.phoneLightRoundSeven);
  report.measurements.phoneLightBeats = await measureBeatPanels(page);
  verifyBeatPanels("phone-light", report.measurements.phoneLightBeats);
  await shot(page, "phone-light-fullpage", { fullPage: true });
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "dark", reducedMotion: "reduce" });
  const page = await context.newPage();
  watch(page, "desktop-reduced");
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator(".story-intro").scrollIntoViewIfNeeded();
  await elementShot(page, ".story-intro", "desktop-reduced-story-title");
  report.measurements.reduced = await page.evaluate(() => {
    const word = document.querySelector("[data-engineering-word]");
    return { progress: getComputedStyle(word).getPropertyValue("--engineering-progress").trim(), clip: getComputedStyle(word).getPropertyValue("--engineering-clip").trim(), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  await context.close();
}

for (const [theme, viewport, name] of [
  ["dark", { width: 1440, height: 900 }, "desktop-dark-nojs"],
  ["light", { width: 1440, height: 900 }, "desktop-light-nojs"],
  ["dark", { width: 1024, height: 768 }, "tablet-dark-nojs"],
  ["dark", { width: 390, height: 844 }, "phone-dark-nojs"],
  ["light", { width: 390, height: 844 }, "phone-light-nojs"],
]) {
  const { context, page } = await open(theme, viewport, name, false);
  for (const [selector, suffix] of [
    ["#loop", "loop"],
    [".equation-section", "heuristic"],
    [".caveman-disclosure", "caveman"],
    [".finale", "finale"],
  ]) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    await elementShot(page, selector, `${name}-${suffix}`);
  }
  for (const beat of ["repair", "refine"]) {
    await elementShot(page, `.beat[data-beat="${beat}"]`, `${name}-${beat}`);
  }
  await shot(page, `${name}-fullpage`, { fullPage: true });
  const closing = await measureClosing(page);
  verifyClosing(name, closing, false);
  const noJs = await measureNoJsRoundSeven(page);
  verifyNoJsRoundSeven(name, noJs);
  noJs.beatPanels = await measureBeatPanels(page);
  verifyBeatPanels(name, noJs.beatPanels);
  noJs.beats = await page.locator("[data-beat]").count();
  noJs.map = await page.locator(".phone-viz svg").evaluate((svg) => svg.getBoundingClientRect().height);
  noJs.closing = closing;
  report.measurements[name] = noJs;
  await context.close();
}

async function captureLoopCase({ theme, viewport, name, beat = null, progress = null, natural = false, javaScriptEnabled = true, selector = ".loop-stage", hideCopy = false }) {
  const { context, page } = await open(theme, viewport, name, javaScriptEnabled);
  if (javaScriptEnabled && beat) await page.evaluate((value) => window.__capture.loopHold(value), beat);
  else if (javaScriptEnabled && progress !== null && !natural) await page.evaluate((value) => window.__capture.loopHoldProgress(value), progress);
  else {
    await page.locator("#loop").scrollIntoViewIfNeeded();
    if (natural && progress !== null) {
      await page.evaluate((value) => {
        const scroll = document.querySelector("[data-loop-scroll]");
        const stage = document.querySelector("[data-loop-stage]");
        const top = scroll.getBoundingClientRect().top + scrollY;
        const range = scroll.offsetHeight - innerHeight;
        scrollTo({ top: top + range * value, behavior: "instant" });
      }, progress);
    }
  }
  if (javaScriptEnabled) await page.evaluate(() => window.__capture.phaserHold("prove", "idle"));
  await settleLoopCompositor(page);
  const measurement = await measureLoopProof(page);
  if (beat) verifyLoopProof(name, measurement, beat);
  else {
    if (measurement.viewport.scrollWidth !== measurement.viewport.width) throw new Error(`${name}: horizontal overflow`);
    if (measurement.copyFinalLineWords < 2) throw new Error(`${name}: loop explanation ends with a lone word`);
    if (measurement.copySingleWordRows.length) throw new Error(`${name}: loop explanation contains a one-word line ${JSON.stringify(measurement.copySingleWordRows)}`);
    if (!measurement.labelsInside || measurement.dominantCount !== 1) throw new Error(`${name}: static proof structure failed`);
  }
  if (natural && Math.abs(measurement.state.progress - progress) > 0.0006) throw new Error(`${name}: expected natural progress ${progress}, got ${measurement.state.progress}`);
  const capture = await reliableLoopShot(page, selector, name, { hideCopy });
  await context.close();
  return { measurement, ...capture };
}

report.measurements.loopDesktopDark = {};
for (const beat of loopBeats) {
  const name = `candidate-desktop-dark-${beat}`;
  const first = await captureLoopCase({ theme: "dark", viewport: { width: 1440, height: 900 }, name, beat });
  const repeat = await captureLoopCase({ theme: "dark", viewport: { width: 1440, height: 900 }, name: `${name}-repeat`, beat });
  const stateEqual = JSON.stringify(first.measurement.state) === JSON.stringify(repeat.measurement.state);
  const geometryEqual = JSON.stringify(first.measurement.geometry) === JSON.stringify(repeat.measurement.geometry);
  const proofRasterEqual = createHash("sha256").update(readFileSync(first.proofPath)).digest("hex") === createHash("sha256").update(readFileSync(repeat.proofPath)).digest("hex");
  const fullStageRasterEqual = createHash("sha256").update(readFileSync(first.path)).digest("hex") === createHash("sha256").update(readFileSync(repeat.path)).digest("hex");
  if (!stateEqual || !geometryEqual || !proofRasterEqual) throw new Error(`${name}: repeated fresh-context capture mismatch state=${stateEqual} geometry=${geometryEqual} proofPngHash=${proofRasterEqual}; fullStagePngHash=${fullStageRasterEqual} is observed but not gated because Chromium can vary static heading antialiasing`);
  report.measurements.loopDesktopDark[beat] = { ...first.measurement, raster: first.raster, repeatStateEqual: stateEqual, repeatGeometryEqual: geometryEqual, repeatProofRasterHashEqual: proofRasterEqual, repeatFullStageRasterHashEqual: fullStageRasterEqual };
  if (["loop-plan", "loop-advance", "loop-static"].includes(beat)) {
    await captureLoopCase({ theme: "dark", viewport: { width: 1440, height: 900 }, name: `${name}-no-copy`, beat, hideCopy: true });
  }
}

report.measurements.loopNaturalFilmstrip = {};
for (const progress of [0, 0.20, 0.355, 0.505, 0.655, 0.815, 1]) {
  const key = String(progress).replace(".", "-");
  const result = await captureLoopCase({ theme: "dark", viewport: { width: 1440, height: 900 }, name: `candidate-natural-desktop-dark-${key}`, progress, natural: true });
  report.measurements.loopNaturalFilmstrip[key] = { ...result.measurement, raster: result.raster };
}

report.measurements.loopNatural500px = {};
let priorBandIndex = null;
for (const pixels of [...Array.from({ length: 12 }, (_, index) => index * 500), 5600]) {
  const progress = pixels / 5600;
  const result = await captureLoopCase({ theme: "dark", viewport: { width: 1440, height: 900 }, name: `candidate-natural-500px-${pixels}`, progress, natural: true });
  const bandIndex = loopBeats.indexOf(result.measurement.state.beat);
  if (priorBandIndex !== null && bandIndex - priorBandIndex > 1) throw new Error(`natural-${pixels}px: one 500px step crossed more than one named band`);
  priorBandIndex = bandIndex;
  report.measurements.loopNatural500px[pixels] = { ...result.measurement, raster: result.raster, bandIndex };
}

report.measurements.loopNaturalCommitAudit = {};
for (const pixels of [1500, 3500, 5500]) {
  const progress = pixels / 5600;
  const result = await captureLoopCase({ theme: "dark", viewport: { width: 1440, height: 900 }, name: `audit-natural-commit-${pixels}`, progress, natural: true });
  report.measurements.loopNaturalCommitAudit[pixels] = { ...result.measurement, raster: result.raster };
}

report.measurements.loopDesktopLight = {};
for (const beat of ["loop-check", "loop-fail", "loop-ship", "loop-static"]) {
  const result = await captureLoopCase({ theme: "light", viewport: { width: 1440, height: 900 }, name: `candidate-desktop-light-${beat}`, beat });
  report.measurements.loopDesktopLight[beat] = { ...result.measurement, raster: result.raster };
}

for (const [theme, viewport, name] of [
  ["dark", { width: 1024, height: 768 }, "tablet-dark"],
  ["light", { width: 1024, height: 768 }, "tablet-light"],
  ["dark", { width: 768, height: 900 }, "768-dark"],
  ["light", { width: 768, height: 900 }, "768-light"],
]) {
  const result = await captureLoopCase({ theme, viewport, name: `candidate-${name}-loop-static`, beat: "loop-static" });
  report.measurements[`loop_${name.replaceAll("-", "_")}`] = { ...result.measurement, raster: result.raster };
}

report.measurements.loopPhoneDark = {};
for (const beat of loopBeats) {
  const result = await captureLoopCase({ theme: "dark", viewport: { width: 390, height: 844 }, name: `candidate-phone-dark-${beat}`, beat, selector: ".loop-proof-chamber" });
  report.measurements.loopPhoneDark[beat] = { ...result.measurement, raster: result.raster };
}
{
  const result = await captureLoopCase({ theme: "light", viewport: { width: 390, height: 844 }, name: "candidate-phone-light-loop-static", beat: "loop-static", selector: ".loop-proof-chamber" });
  report.measurements.loopPhoneLight = { ...result.measurement, raster: result.raster };
}

for (const [theme, viewport, name, selector] of [
  ["dark", { width: 1440, height: 900 }, "desktop-dark-nojs", ".loop-stage"],
  ["light", { width: 1440, height: 900 }, "desktop-light-nojs", ".loop-stage"],
  ["dark", { width: 1024, height: 768 }, "tablet-dark-nojs", ".loop-stage"],
  ["dark", { width: 768, height: 900 }, "768-dark-nojs", ".loop-stage"],
  ["light", { width: 768, height: 900 }, "768-light-nojs", ".loop-stage"],
  ["dark", { width: 390, height: 844 }, "phone-dark-nojs", ".loop-proof-chamber"],
  ["light", { width: 390, height: 844 }, "phone-light-nojs", ".loop-proof-chamber"],
]) {
  const result = await captureLoopCase({ theme, viewport, name: `candidate-${name}-loop-static`, beat: "loop-static", javaScriptEnabled: false, selector });
  report.measurements[`loop_${name.replaceAll("-", "_")}`] = { ...result.measurement, raster: result.raster };
}

const bandRanges = { plan: [0, 0.12], check: [0.28, 0.43], fail: [0.43, 0.58], return: [0.58, 0.73], ship: [0.73, 0.90], static: [0.90, 1] };
const intermediateLocals = {
  plan: [0.25, 0.54, 0.56],
  check: [0.10, 0.149, 0.20, 0.299, 0.35, 0.699, 0.75],
  fail: [0.10, 0.199, 0.225, 0.349, 0.50, 0.749, 0.80],
  return: [0.20, 0.399, 0.40, 0.60, 0.90],
  ship: [0.028, 0.10, 0.149, 0.20, 0.299, 0.35, 0.399, 0.50, 0.90],
  static: [0, 0.10, 0.299, 0.30, 0.35],
};
report.measurements.loopIntermediate = {};
for (const [band, locals] of Object.entries(intermediateLocals)) {
  report.measurements.loopIntermediate[band] = {};
  for (const local of locals) {
    const [start, end] = bandRanges[band];
    const progress = start + (end - start) * local;
    const name = `probe-${band}-${String(local).replace(".", "-")}`;
    const { context, page } = await open("dark", { width: 1440, height: 900 }, name);
    await page.evaluate((value) => window.__capture.loopHoldProgress(value), progress);
    await settleLoopCompositor(page);
    const measurement = await measureLoopProof(page);
    if (Math.abs(measurement.state.local - local) > 0.0002) throw new Error(`${name}: local phase drifted to ${measurement.state.local}`);
    if (measurement.copyFinalLineWords < 2 || measurement.viewport.scrollWidth !== measurement.viewport.width) throw new Error(`${name}: copy or overflow gate failed`);
    const needsSettleCapture = band === "static" && [0, 0.10, 0.299, 0.30].includes(local);
    if (needsSettleCapture) await page.evaluate(() => window.__capture.phaserHold("prove", "idle"));
    const auditCapture = needsSettleCapture ? await reliableLoopShot(page, ".loop-stage", `audit-settle-${String(local).replace(".", "-")}`) : null;
    report.measurements.loopIntermediate[band][local] = { ...measurement, auditCapture };
    await context.close();
  }
}
for (const local of [0.028, 0.10, 0.20, 0.35]) {
  const measurement = report.measurements.loopIntermediate.ship[local];
  if (measurement.state.gate !== "closed" || measurement.packetVisible) throw new Error(`ship-${local}: release advanced before authority`);
}
const shipEarly = report.measurements.loopIntermediate.ship[0.028];
if (shipEarly.gateBars.some((bar) => bar !== "translate(0.00 0)")) throw new Error("ship-0.028: gate bars retracted before authority key");
const shipHalf = report.measurements.loopIntermediate.ship[0.50];
if (shipHalf.state.gate !== "open" || !shipHalf.packetBelowGate || !shipHalf.gateBars.includes("translate(-18.00 0)")) throw new Error("ship-0.50: gate did not open before packet moved below it");
for (const [local, expectedProgress, expectedState] of [[0, 0, "retaining"], [0.10, 1 / 3, "retaining"], [0.299, 0.299 / 0.30, "retaining"], [0.30, 1, "retained"]]) {
  const visual = report.measurements.loopIntermediate.static[local].shipVisual;
  if (Math.abs(visual.progress - expectedProgress) > 0.0002 || visual.state !== expectedState) throw new Error(`static-${local}: Ship retention is ${visual.state} at ${visual.progress}, expected ${expectedState} at ${expectedProgress}`);
}
const settleStrokes = [0, 0.10, 0.299].map((local) => report.measurements.loopIntermediate.static[local].shipVisual.stroke);
if (new Set(settleStrokes).size !== settleStrokes.length) throw new Error(`static-settle: Ship stroke does not change continuously ${JSON.stringify(settleStrokes)}`);
if (report.measurements.loopIntermediate.static[0.30].state.claim !== "retained" || report.measurements.loopIntermediate.static[0.299].state.claim === "retained") throw new Error("static-settle: retained state arrived before local 0.30");

async function captureCompactReview(theme, viewport, name, javaScriptEnabled) {
  const { context, page } = await open(theme, viewport, name, javaScriptEnabled);
  if (javaScriptEnabled && viewport.width >= 1200) await page.evaluate(() => window.__capture.hold("review-fork"));
  const review = page.locator('[data-beat="review-fork"]');
  await review.scrollIntoViewIfNeeded();
  const measurement = await review.evaluate((panel) => {
    const mechanism = panel.querySelector('[data-beat-mechanism="review-fork"]');
    const scene = mechanism.querySelector(".beat-scene");
    const why = mechanism.querySelector(".mechanism-why");
    const links = [...mechanism.querySelectorAll(".mechanism-links a")];
    const panelRect = panel.getBoundingClientRect();
    const sceneRect = scene.getBoundingClientRect();
    const inside = (rect) => rect.left >= panelRect.left - 1 && rect.right <= panelRect.right + 1 && rect.top >= panelRect.top - 1 && rect.bottom <= panelRect.bottom + 1;
    return {
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      mechanismCount: panel.querySelectorAll("[data-beat-mechanism]").length,
      staleTaxonomyCount: panel.querySelectorAll("dl, dt, dd, .review-explainer").length,
      hasExactCodexRoute: ["CLAUDE STARTS CODEX", "CODEX READS REPO", "CLAUDE CHECKS FINDINGS"].every((label) => scene.textContent.includes(label)),
      sceneInside: inside(sceneRect),
      whyInside: inside(why.getBoundingClientRect()),
      linkTargets: links.map((link) => ({ height: link.getBoundingClientRect().height, inside: inside(link.getBoundingClientRect()) })),
      panel: panelRect.toJSON(),
      scene: sceneRect.toJSON(),
    };
  });
  if (measurement.scrollWidth !== measurement.width || measurement.mechanismCount !== 1 || measurement.staleTaxonomyCount !== 0 || !measurement.hasExactCodexRoute || !measurement.sceneInside || !measurement.whyInside || measurement.linkTargets.some((target) => target.height < 44 || !target.inside)) throw new Error(`${name}: review mechanism is incomplete, clipped, or stale`);
  await elementShot(page, '[data-beat="review-fork"]', name);
  await context.close();
  return measurement;
}

report.measurements.compactReview = {};
for (const [theme, viewport, name, javaScriptEnabled] of [
  ["dark", { width: 1440, height: 900 }, "review-compact-desktop", true],
  ["dark", { width: 1024, height: 768 }, "review-compact-tablet", true],
  ["dark", { width: 390, height: 844 }, "review-compact-phone", true],
  ["dark", { width: 1440, height: 900 }, "review-compact-desktop-nojs", false],
  ["dark", { width: 1024, height: 768 }, "review-compact-tablet-nojs", false],
  ["dark", { width: 390, height: 844 }, "review-compact-phone-nojs", false],
]) report.measurements.compactReview[name] = await captureCompactReview(theme, viewport, name, javaScriptEnabled);

}

if (["all", "story-mechanisms"].includes(captureScope)) {
  const spotBeats = ["context", "review-fork", "repair", "release", "refine"];
  const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

  async function captureStoryPanelMatrix(theme, viewport, label, selectedBeats, javaScriptEnabled = true, repeat = false) {
    const { context, page } = await open(theme, viewport, label, javaScriptEnabled);
    const captures = {};
    for (const beat of selectedBeats) {
      if (javaScriptEnabled) await page.evaluate((value) => window.__capture.hold(value), beat);
      else await page.locator(`[data-beat="${beat}"]`).scrollIntoViewIfNeeded();
      const first = await elementShot(page, `[data-beat="${beat}"]`, `story-${label}-${beat}-a`);
      let rasterHashEqual = null;
      if (repeat) {
        if (javaScriptEnabled) await page.evaluate((value) => window.__capture.hold(value), beat);
        const second = await elementShot(page, `[data-beat="${beat}"]`, `story-${label}-${beat}-b`);
        rasterHashEqual = hash(first) === hash(second);
        if (!rasterHashEqual) throw new Error(`${label}/${beat}: repeated held panel PNG hash changed`);
      }
      captures[beat] = { first, rasterHashEqual };
    }
    const panels = await measureBeatPanels(page);
    verifyBeatPanels(label, panels);
    await context.close();
    return { panels, captures };
  }

  report.measurements.storyMechanisms = {};
  report.measurements.storyMechanisms.desktopDark = await captureStoryPanelMatrix("dark", { width: 1440, height: 900 }, "desktop-dark", beats, true);
  report.measurements.storyMechanisms.phoneDark = await captureStoryPanelMatrix("dark", { width: 390, height: 844 }, "phone-dark", beats, true);
  report.measurements.storyMechanisms.desktopLight = await captureStoryPanelMatrix("light", { width: 1440, height: 900 }, "desktop-light", spotBeats, true, true);
  report.measurements.storyMechanisms.phoneLight = await captureStoryPanelMatrix("light", { width: 390, height: 844 }, "phone-light", spotBeats, true, true);
  report.measurements.storyMechanisms.desktopNoJs = await captureStoryPanelMatrix("dark", { width: 1440, height: 900 }, "desktop-dark-nojs", spotBeats, false, true);
  report.measurements.storyMechanisms.phoneNoJs = await captureStoryPanelMatrix("dark", { width: 390, height: 844 }, "phone-dark-nojs", spotBeats, false, true);
  if (report.errors.length) throw new Error(`story mechanism capture reported browser errors: ${report.errors.join(" | ")}`);
}

const mechanismSelectors = Object.freeze({
  fact: ".fact-strip",
  context: "[data-mechanism=\"context\"]",
  memory: "[data-mechanism=\"memory\"]",
  runtime: "[data-mechanism=\"runtime\"]",
  creator: "[data-mechanism=\"creator\"]",
  finale: "[data-mechanism=\"finale\"]",
});

async function measureMechanism(page, mechanism) {
  return page.evaluate((name) => {
    const element = name === "fact" ? document.querySelector(".fact-strip") : document.querySelector(`[data-mechanism="${name}"]`);
    const rowsFor = (target) => {
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      const words = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        for (const match of node.textContent.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const rect = range.getBoundingClientRect();
          range.detach();
          if (rect.width > 0 && rect.height > 0) words.push({ word: match[0], top: Math.round(rect.top) });
        }
      }
      return words.reduce((rows, word) => {
        const row = rows.find((candidate) => Math.abs(candidate.top - word.top) <= 1);
        if (row) row.words.push(word.word);
        else rows.push({ top: word.top, words: [word.word] });
        return rows;
      }, []);
    };
    const selectors = name === "fact" ? [".fact-cell > p"]
      : name === "context" ? ["h2", ".context-heading > p:last-child"]
      : name === "memory" ? ["h2", ".memory-lead > p:last-child", ".memory-card > strong", ".memory-card > p", ".memory-console-body p", ".memory-discipline h3 span", ".memory-discipline-direction", ".memory-discipline-copy p"]
      : name === "runtime" ? ["h2", ".runtime-copy > p:last-child"]
      : name === "creator" ? ["h2", ".creator-heading > div > p", ".creator-card > strong", ".creator-card > p"]
      : ["h2", ".finale-copy > p:last-child", ".finale-action strong"];
    const textRows = selectors.flatMap((selector) => [...element.querySelectorAll(selector)]
      .filter((target) => getComputedStyle(target).display !== "none")
      .map((target) => ({ selector, text: target.textContent.trim(), rows: rowsFor(target).map((row) => row.words) })));
    const rect = element.getBoundingClientRect();
    return {
      phase: element.dataset.mechanismPhase,
      viewport: { width: innerWidth, scrollWidth: document.documentElement.scrollWidth },
      rect: rect.toJSON(),
      textRows,
      oneWordFinals: textRows.filter((entry) => entry.rows.at(-1)?.length === 1).map((entry) => ({ selector: entry.selector, text: entry.text, word: entry.rows.at(-1)[0] })),
      phoneTranscriptLines: name === "memory" ? [...element.querySelectorAll(".memory-console-body p")].filter((line) => getComputedStyle(line).display !== "none").length : null,
    };
  }, mechanism);
}

async function captureMechanismHold(theme, viewport, hold, label) {
  const mechanism = hold.split("-")[0];
  const selector = mechanismSelectors[mechanism];
  const { context, page } = await open(theme, viewport, `mechanism-${label}-${hold}`);
  await page.evaluate((name) => window.__capture.mechanismHold(name), hold);
  if (mechanism === "memory") await page.locator(".memory-discipline").evaluate((element) => { element.style.display = "none"; });
  if (mechanism === "finale") await page.evaluate(() => window.__capture.phaserHold("around", "idle"));
  await page.locator(".instrument-rail, .skip-link").evaluateAll((elements) => elements.forEach((element) => { element.style.visibility = "hidden"; }));
  const measurementA = await measureMechanism(page, mechanism);
  if (measurementA.viewport.scrollWidth !== measurementA.viewport.width) throw new Error(`${label}-${hold}: horizontal overflow`);
  if (measurementA.oneWordFinals.length) throw new Error(`${label}-${hold}: one-word final line ${JSON.stringify(measurementA.oneWordFinals)}`);
  const first = await elementShot(page, selector, `mechanism-${label}-${hold}-a`);
  await page.evaluate((name) => window.__capture.mechanismHold(name), hold);
  if (mechanism === "finale") await page.evaluate(() => window.__capture.phaserHold("around", "idle"));
  const measurementB = await measureMechanism(page, mechanism);
  const second = await elementShot(page, selector, `mechanism-${label}-${hold}-b`);
  const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
  const stateEqual = JSON.stringify(measurementA) === JSON.stringify(measurementB);
  const rasterHashEqual = hash(first) === hash(second);
  if (!stateEqual || !rasterHashEqual) throw new Error(`${label}-${hold}: deterministic hold mismatch state=${stateEqual} raster=${rasterHashEqual}`);
  await context.close();
  return { ...measurementA, stateEqual, rasterHashEqual, captures: [first, second] };
}

if (["all", "mechanisms"].includes(captureScope)) {
async function captureStaticMechanism(theme, viewport, mechanism, label) {
  const selector = mechanismSelectors[mechanism];
  const { context, page } = await open(theme, viewport, `mechanism-${label}-${mechanism}`);
  await page.locator(selector).scrollIntoViewIfNeeded();
  const measurementA = await measureMechanism(page, mechanism);
  if (measurementA.viewport.scrollWidth !== measurementA.viewport.width) throw new Error(`${label}-${mechanism}: horizontal overflow`);
  if (measurementA.oneWordFinals.length) throw new Error(`${label}-${mechanism}: one-word final line ${JSON.stringify(measurementA.oneWordFinals)}`);
  const first = await elementShot(page, selector, `mechanism-${label}-${mechanism}-a`);
  const measurementB = await measureMechanism(page, mechanism);
  const second = await elementShot(page, selector, `mechanism-${label}-${mechanism}-b`);
  const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
  const stateEqual = JSON.stringify(measurementA) === JSON.stringify(measurementB);
  const rasterHashEqual = hash(first) === hash(second);
  if (!stateEqual || !rasterHashEqual) throw new Error(`${label}-${mechanism}: deterministic capture mismatch state=${stateEqual} raster=${rasterHashEqual}`);
  await context.close();
  return { ...measurementA, stateEqual, rasterHashEqual, captures: [first, second] };
}

report.measurements.factStrip = {};
for (const theme of ["dark", "light"]) {
  for (const [viewportName, viewport] of [["desktop", { width: 1440, height: 900 }], ["768", { width: 768, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
    const label = `${viewportName}-${theme}`;
    report.measurements.factStrip[label] = await captureStaticMechanism(theme, viewport, "fact", label);
  }
}

report.measurements.mechanismDesktop = {};
for (const theme of ["dark", "light"]) {
  report.measurements.mechanismDesktop[theme] = {};
  for (const hold of ["context-roots", "context-route", "context-library", "memory-observe", "memory-commit", "memory-retrieve", "memory-replay-complete", "runtime-source", "runtime-adapt", "runtime-fan-out", "creator-name", "creator-assemble", "creator-ready", "finale-ready"]) {
    report.measurements.mechanismDesktop[theme][hold] = await captureMechanismHold(theme, { width: 1440, height: 900 }, hold, `desktop-${theme}`);
  }
}

report.measurements.mechanismPhone = {};
for (const theme of ["dark", "light"]) {
  report.measurements.mechanismPhone[theme] = {};
  for (const hold of ["context-library", "memory-replay-complete", "runtime-fan-out", "creator-ready", "finale-ready"]) {
    report.measurements.mechanismPhone[theme][hold] = await captureMechanismHold(theme, { width: 390, height: 844 }, hold, `phone-${theme}`);
  }
}

report.measurements.mechanism768 = {};
for (const theme of ["dark", "light"]) {
  report.measurements.mechanism768[theme] = {};
  for (const hold of ["context-library", "memory-replay-complete", "runtime-fan-out", "creator-ready", "finale-ready"]) {
    report.measurements.mechanism768[theme][hold] = await captureMechanismHold(theme, { width: 768, height: 900 }, hold, `768-${theme}`);
  }
}

report.measurements.mechanismNoJs = {};
for (const [theme, viewport, label] of [
  ["dark", { width: 1440, height: 900 }, "desktop-dark-nojs"],
  ["light", { width: 1440, height: 900 }, "desktop-light-nojs"],
  ["dark", { width: 768, height: 900 }, "768-dark-nojs"],
  ["light", { width: 768, height: 900 }, "768-light-nojs"],
  ["dark", { width: 390, height: 844 }, "phone-dark-nojs"],
  ["light", { width: 390, height: 844 }, "phone-light-nojs"],
]) {
  const { context, page } = await open(theme, viewport, label, false);
  report.measurements.mechanismNoJs[label] = {};
  for (const mechanism of ["fact", "context", "memory", "runtime", "creator", "finale"]) {
    const selector = mechanismSelectors[mechanism];
    await page.locator(selector).scrollIntoViewIfNeeded();
    const measurement = await measureMechanism(page, mechanism);
    if (measurement.viewport.scrollWidth !== measurement.viewport.width || measurement.oneWordFinals.length) throw new Error(`${label}-${mechanism}: no-JS layout failed ${JSON.stringify(measurement.oneWordFinals)}`);
    const capture = await elementShot(page, selector, `${label}-mechanism-${mechanism}`);
    report.measurements.mechanismNoJs[label][mechanism] = { ...measurement, capture };
  }
  await context.close();
}

async function captureMemoryDiscipline(theme, viewport, label) {
  const { context, page } = await open(theme, viewport, `memory-discipline-${label}`, true, false);
  const section = page.locator(".memory-discipline");
  const figure = page.locator(".memory-comparison-scroll");
  await figure.scrollIntoViewIfNeeded();
  await page.waitForTimeout(50);
  const probe = () => page.evaluate(() => {
    const root = document.querySelector("[data-memory-comparison]");
    return {
      rows: [...root.querySelectorAll(".row")].map((node) => Number.parseFloat(getComputedStyle(node).opacity)),
      checks: [...root.querySelectorAll(".check")].map((node) => Number.parseFloat(getComputedStyle(node).strokeDashoffset)),
      crosses: [...root.querySelectorAll(".x-mark")].map((node) => Number.parseFloat(getComputedStyle(node).strokeDashoffset)),
    };
  });
  const atStart = await probe();
  await elementShot(page, ".memory-comparison-scroll", `memory-discipline-${label}-start`);
  await page.waitForTimeout(1600);
  const atMiddle = await probe();
  await elementShot(page, ".memory-comparison-scroll", `memory-discipline-${label}-middle`);
  await page.waitForTimeout(2100);
  const atEnd = await probe();
  if (atStart.rows.filter((value) => value > .99).length >= 6) throw new Error(`${label}: memory comparison starts fully revealed`);
  if (atMiddle.rows.filter((value) => value > .99).length <= atStart.rows.filter((value) => value > .99).length) throw new Error(`${label}: memory comparison does not advance`);
  if (atEnd.rows.some((value) => value < .99) || atEnd.checks.some((value) => value !== 0) || atEnd.crosses.some((value) => value !== 0)) throw new Error(`${label}: memory comparison does not complete`);
  await freezeMemoryComparison(page);
  const measurement = await page.evaluate(() => {
    const section = document.querySelector(".memory-discipline");
    const comparison = document.querySelector(".memory-comparison");
    const scroller = document.querySelector(".memory-comparison-scroll");
    const svg = document.querySelector("[data-memory-comparison]");
    const heading = document.querySelector(".memory-discipline h3").getBoundingClientRect();
    const copy = document.querySelector(".memory-discipline-copy").getBoundingClientRect();
    const links = [...document.querySelectorAll(".memory-source-links a")];
    const finalRowWords = (node) => {
      const rows = [];
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode;
        for (const match of text.textContent.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(text, match.index);
          range.setEnd(text, match.index + match[0].length);
          const top = Math.round(range.getBoundingClientRect().top);
          const row = rows.find((candidate) => Math.abs(candidate.top - top) <= 1);
          if (row) row.words += 1;
          else rows.push({ top, words: 1 });
        }
      }
      return rows.at(-1)?.words ?? 0;
    };
    return {
      viewportWidth: innerWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
      sectionWidth: section.getBoundingClientRect().width,
      comparisonWidth: comparison.getBoundingClientRect().width,
      scrollerClientWidth: scroller.clientWidth,
      scrollerScrollWidth: scroller.scrollWidth,
      svgWidth: svg.getBoundingClientRect().width,
      headingCopyGap: copy.left - heading.right,
      headingLines: [...document.querySelectorAll(".memory-discipline h3 span")].map((line) => line.textContent.trim().split(/\s+/).length),
      copyFinalRows: [...document.querySelectorAll(".memory-discipline-direction, .memory-discipline-copy p")].map(finalRowWords),
      linkHeights: links.map((link) => link.getBoundingClientRect().height),
      sourceCount: links.length,
    };
  });
  if (measurement.pageScrollWidth !== measurement.viewportWidth) throw new Error(`${label}: memory discipline causes page overflow`);
  if (Math.abs(measurement.sectionWidth - measurement.comparisonWidth) > 1) throw new Error(`${label}: memory comparison does not fill its section`);
  if (measurement.headingLines.some((words) => words < 2)) throw new Error(`${label}: memory heading has a one-word authored line`);
  if (measurement.copyFinalRows.some((words) => words < 2)) throw new Error(`${label}: memory copy ends with a one-word rendered line`);
  if (measurement.linkHeights.some((height) => height < 44) || measurement.sourceCount !== 4) throw new Error(`${label}: memory source rail is incomplete or too small`);
  if (viewport.width > 900 && measurement.headingCopyGap < 24) throw new Error(`${label}: memory heading collides with its copy`);
  if (viewport.width <= 760 && (measurement.svgWidth < 720 || measurement.scrollerScrollWidth <= measurement.scrollerClientWidth)) throw new Error(`${label}: phone comparison is shrunken instead of readable and scrollable`);
  await elementShot(page, ".memory-discipline-head", `memory-discipline-${label}-copy`);
  await elementShot(page, ".memory-comparison-scroll", `memory-discipline-${label}-complete-left`);
  if (viewport.width <= 760) {
    await figure.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
    await elementShot(page, ".memory-comparison-scroll", `memory-discipline-${label}-complete-right`);
  }
  await elementShot(page, ".memory-source-links", `memory-discipline-${label}-sources`);
  await context.close();
  return { ...measurement, animation: { atStart, atMiddle, atEnd } };
}

report.measurements.memoryDiscipline = {};
for (const [theme, viewport, label] of [
  ["dark", { width: 1440, height: 900 }, "desktop-dark"],
  ["light", { width: 1440, height: 900 }, "desktop-light"],
  ["dark", { width: 768, height: 900 }, "768-dark"],
  ["dark", { width: 390, height: 844 }, "phone-dark"],
  ["light", { width: 390, height: 844 }, "phone-light"],
]) report.measurements.memoryDiscipline[label] = await captureMemoryDiscipline(theme, viewport, label);
}

async function capturePhaserMatrix(viewport, label) {
  const { context, page } = await open("dark", viewport, `phaser-${label}`);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const pre = await page.evaluate(() => ({
    hero: document.querySelectorAll('[data-phaser-canvas="hero"]').length,
    later: [...document.querySelectorAll("[data-phaser-word]")].map((target) => [target.dataset.phaserTarget, target.querySelectorAll("canvas").length]),
  }));
  if (pre.hero !== 1 || pre.later.some(([, count]) => count !== 0)) throw new Error(`phaser-${label}: lazy allocation contract failed before intersection`);
  const results = { pre, targets: {} };
  for (const target of ["hero", "prove", "result", "around"]) {
    const selector = `[data-phaser-target="${target}"]`;
    await page.locator(selector).scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const allocated = await page.locator(selector).locator("canvas").count();
    if (allocated !== 1) throw new Error(`phaser-${label}-${target}: canvas did not allocate after intersection`);
    const geometryBefore = await page.locator(selector).evaluate((element) => {
      const heading = element.closest("[data-fit-heading]");
      const lines = heading ? [...heading.querySelectorAll("[data-fit-line]")] : [element];
      return {
        scrollWidth: document.documentElement.scrollWidth,
        width: innerWidth,
        lines: lines.map((line) => ({ rect: line.getBoundingClientRect().toJSON(), fontSize: getComputedStyle(line).fontSize })),
      };
    });
    results.targets[target] = { geometryBefore, states: {} };
    for (const state of ["idle", "sweep-mid", "handoff"]) {
      await page.evaluate(({ target, state }) => window.__capture.phaserHold(target, state), { target, state });
      const metrics = await page.evaluate((target) => window.__capture.phaserMetrics(target), target);
      const boundsDelta = Math.max(
        Math.abs(metrics.targetRect.x - metrics.canvasRect.x),
        Math.abs(metrics.targetRect.y - metrics.canvasRect.y),
        Math.abs(metrics.targetRect.width - metrics.canvasRect.width),
        Math.abs(metrics.targetRect.height - metrics.canvasRect.height),
      );
      if (boundsDelta > 1) throw new Error(`phaser-${label}-${target}-${state}: canvas misses target by ${boundsDelta}px`);
      if (state !== "idle" && metrics.insideSignal < 30) throw new Error(`phaser-${label}-${target}-${state}: glyph mask has no raster signal`);
      if (metrics.outsideSignal > Math.max(4, metrics.insideSignal * 0.002)) throw new Error(`phaser-${label}-${target}-${state}: raster spills outside glyph mask`);
      const captureSelector = target === "hero" ? ".hero" : selector;
      const first = await elementShot(page, captureSelector, `phaser-${label}-${target}-${state}`);
      await page.evaluate(({ target, state }) => window.__capture.phaserHold(target, state), { target, state });
      const repeatMetrics = await page.evaluate((target) => window.__capture.phaserMetrics(target), target);
      const repeat = await elementShot(page, captureSelector, `phaser-${label}-${target}-${state}-repeat`);
      const rasterHashEqual = createHash("sha256").update(readFileSync(first)).digest("hex") === createHash("sha256").update(readFileSync(repeat)).digest("hex");
      if (metrics.pixels !== repeatMetrics.pixels || !rasterHashEqual) throw new Error(`phaser-${label}-${target}-${state}: held pixels or PNG hash changed`);
      results.targets[target].states[state] = { insideSignal: metrics.insideSignal, outsideSignal: metrics.outsideSignal, boundsDelta, rasterHashEqual };
    }
    const geometryAfter = await page.locator(selector).evaluate((element) => {
      const heading = element.closest("[data-fit-heading]");
      const lines = heading ? [...heading.querySelectorAll("[data-fit-line]")] : [element];
      return {
        scrollWidth: document.documentElement.scrollWidth,
        width: innerWidth,
        lines: lines.map((line) => ({ rect: line.getBoundingClientRect().toJSON(), fontSize: getComputedStyle(line).fontSize })),
      };
    });
    if (geometryAfter.scrollWidth !== geometryAfter.width || JSON.stringify(geometryBefore.lines) !== JSON.stringify(geometryAfter.lines)) throw new Error(`phaser-${label}-${target}: fitting geometry or overflow changed`);
    results.targets[target].geometryAfter = geometryAfter;
  }
  await context.close();
  return results;
}

if (["all", "loop-phaser"].includes(captureScope)) {
  report.measurements.phaserDesktop = await capturePhaserMatrix({ width: 1440, height: 900 }, "desktop");
  report.measurements.phaserPhone = await capturePhaserMatrix({ width: 390, height: 844 }, "phone");

  const { context, page } = await open("dark", { width: 1440, height: 900 }, "determinism");
  await page.evaluate(() => window.__capture.hold("review-fork"));
  const stateA = await page.evaluate(() => window.__capture.state());
  const geometryA = await page.evaluate(() => ({ map: document.querySelector(".desktop-viz").getBoundingClientRect().toJSON(), camera: document.querySelector("[data-map-camera]").getBoundingClientRect().toJSON() }));
  const a = await shot(page, "determinism-review-a");
  await page.evaluate(() => window.__capture.hold("review-fork"));
  const stateB = await page.evaluate(() => window.__capture.state());
  const geometryB = await page.evaluate(() => ({ map: document.querySelector(".desktop-viz").getBoundingClientRect().toJSON(), camera: document.querySelector("[data-map-camera]").getBoundingClientRect().toJSON() }));
  const b = await shot(page, "determinism-review-b");
  const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
  report.measurements.determinism = {
    stateEqual: JSON.stringify(stateA) === JSON.stringify(stateB),
    geometryEqual: JSON.stringify(geometryA) === JSON.stringify(geometryB),
    rasterEqual: hash(a) === hash(b),
    rasterNote: "Chromium re-rasterizes transformed SVG <use> text between otherwise unchanged screenshots; DOM state and geometry are the deterministic contract.",
    stateA,
    stateB,
    geometryA,
    geometryB,
  };
  await context.close();
}

writeFileSync(join(out, "capture-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
