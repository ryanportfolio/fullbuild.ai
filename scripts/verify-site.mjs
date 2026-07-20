import { brotliCompressSync } from "node:zlib";
import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { PHASE_TOKENS } from "../src/phase-state.mjs";
import { renderPage } from "../src/template.mjs";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const bytes = (value) => brotliCompressSync(Buffer.from(value)).byteLength;
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const site = JSON.parse(await read("content/site.json"));
const html = await read("index.html");
const css = await read("src/styles.css");
const packageJson = JSON.parse(await read("package.json"));
const jsPaths = ["src/app.mjs", "src/phase-state.mjs", "src/stage-machine.mjs"];
const jsSources = await Promise.all(jsPaths.map(read));
const joinedJs = jsSources.join("\n");

assert(html === renderPage(site), "index.html is stale; run npm run build");
assert(site.brand.tagline === "idea → design → engineering → shipped", "tagline changed");
assert(JSON.stringify(site.stages.map(({ id }) => id)) === JSON.stringify(["idea", "design", "engineering", "shipped"]), "lifecycle order changed");
assert(site.caseStudy.status === "engineering", "current case state must remain engineering");
assert(site.deployment.verified === false && site.deployment.url === null, "production deployment must remain unclaimed");
assert(site.stages.at(-1).locked === true, "shipped stage must remain locked");

assert((html.match(/<h1\b/g) ?? []).length === 1, "page must contain exactly one h1");
assert((html.match(/data-phase-control=/g) ?? []).length === 4, "four lifecycle controls are required");
assert((html.match(/data-phase-world=/g) ?? []).length === 4, "four material worlds are required");
assert((html.match(/data-placeholder-case/g) ?? []).length === 3, "three future case structures are required");
assert(/data-phase-control="shipped"[^>]*aria-disabled="true"/.test(html), "shipped control must announce its lock");
assert(/aria-live="polite"/.test(html), "locked-state announcement is missing");
assert(/<noscript>/.test(html), "complete no-JavaScript copy is required");
assert(!/proof-canvas|proof-fallback|proof-lineage|data-proof-viewport/.test(html), "retired Proof Lab markup returned");
assert(!/<canvas\b|WebGL|createProofRenderer|createProofGeometry/.test(`${html}\n${joinedJs}`), "retired canvas/WebGL identity returned");

assert(/prefers-reduced-motion/.test(css), "reduced-motion CSS is missing");
assert(/forced-colors/.test(css), "forced-colors CSS is missing");
assert(!/transition:\s*all\b/.test(css), "transition: all is prohibited");
assert(!/backdrop-filter\s*:/.test(css), "backdrop filters are prohibited");
assert(!/(?:linear|radial|conic)-gradient\s*\(/i.test(css), "generic CSS gradients are prohibited");
assert(/Anybody\[wdth,wght\]\.ttf/.test(css), "local variable display font is not wired");

assert(site.placeholders.length === 3, "three honest future cases are required");
assert(new Set(site.placeholders.map(({ form }) => form)).size === 3, "future cases must use distinct structures");
assert(site.placeholders.every(({ placeholder, title, missing }) => placeholder === true && /pending/i.test(`${title} ${missing}`)), "future cases must stay explicitly pending");
assert(PHASE_TOKENS.length === 4, "four phase tokens are required");
assert(new Set(PHASE_TOKENS.map(({ silhouette }) => silhouette)).size === 4, "phase silhouettes must remain distinct");
assert(PHASE_TOKENS.every((phase, index) => index === 0 || phase.depth > PHASE_TOKENS[index - 1].depth), "phase depth must increase monotonically");

assert(Object.keys(packageJson.dependencies ?? {}).length === 0 && Object.keys(packageJson.devDependencies ?? {}).length === 0, "runtime or development dependencies were added");
assert(!/\b(?:three|babylon|pixi|gsap)\b/i.test(joinedJs), "runtime engine dependency detected");

const internalReferences = [...html.matchAll(/(?:href|src)="\/(?!\/)([^"?#]+)[^"\s]*"/g)].map((match) => match[1]);
internalReferences.push("assets/fonts/Anybody[wdth,wght].ttf", "assets/fonts/OFL.txt");
for (const reference of new Set(internalReferences)) {
  try {
    await access(resolve(root, reference));
  } catch {
    failures.push(`missing internal reference: /${reference}`);
  }
}

const documentBytes = bytes(`${html}\n${css}`);
const scriptBytes = bytes(joinedJs);
const font = await stat(resolve(root, "assets/fonts/Anybody[wdth,wght].ttf"));
assert(documentBytes <= 48 * 1024, `compressed HTML + CSS is ${documentBytes} bytes; budget is 49152`);
assert(scriptBytes <= 20 * 1024, `compressed JavaScript is ${scriptBytes} bytes; budget is 20480`);
assert(font.size <= 220 * 1024, `font is ${font.size} bytes; budget is 225280`);

if (failures.length > 0) {
  console.error(`Verification failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Verification passed.");
  console.log(`- HTML + CSS (Brotli): ${documentBytes} bytes / 49152`);
  console.log(`- JavaScript (Brotli): ${scriptBytes} bytes / 20480`);
  console.log(`- Anybody variable font: ${font.size} bytes / 225280`);
  console.log(`- Material states: ${PHASE_TOKENS.map(({ id, silhouette }) => `${id}:${silhouette}`).join(", ")}`);
}
