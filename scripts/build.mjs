import { readFile, writeFile } from "node:fs/promises";

import { renderPage } from "../src/template.mjs";

const site = JSON.parse(await readFile(new URL("../content/site.json", import.meta.url), "utf8"));
const output = renderPage(site);

await writeFile(new URL("../index.html", import.meta.url), output, "utf8");
console.log(`Built index.html (${Buffer.byteLength(output).toLocaleString()} bytes).`);
