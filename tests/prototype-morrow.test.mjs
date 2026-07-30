import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Morrow is discoverable and exposes the shopper contract", async () => {
  const [directory, page, app, styles, catalog] = await Promise.all([
    read("public/prototype/index.html"),
    read("src/app/prototype/morrow/page.tsx"),
    read("src/components/morrow/MorrowApp.tsx"),
    read("src/app/prototype/morrow/morrow.module.css"),
    read("src/lib/morrow/catalog.ts"),
  ]);

  assert.equal((directory.match(/href="\/prototype\/morrow"/g) ?? []).length, 1);
  assert.match(directory, /<span class="num">09<\/span>[\s\S]*?<h2>Morrow<\/h2>/);
  assert.match(directory, /Customer storefront/);
  assert.match(page, /Morrow — City \/ Weather/);
  assert.match(catalog, /demoStyles/);
  assert.match(catalog, /formatPrice/);

  for (const contract of [
    "CUSTOMER STOREFRONT PROTOTYPE",
    "Shop the collection",
    "Choose color",
    "Choose size",
    "SIMULATED 3D VIEW",
    "Add to bag",
    "aria-live",
    "/prototype/threadline",
  ]) {
    assert.match(app, new RegExp(contract));
  }

  assert.match(app, /showModal/);
  assert.match(app, /aria-pressed/);
  assert.match(app, /Escape/);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /@media \(max-width: 560px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /:focus-visible/);
  assert.doesNotMatch(styles, /linear-gradient|radial-gradient|backdrop-filter/);
});

test("Morrow ships its original campaign asset", async () => {
  await access(
    new URL(
      "../public/prototype/morrow/city-weather-campaign.png",
      import.meta.url,
    ),
  );
});

