// quench · grain.mjs
// One noise tile, generated once at boot and tiled by CSS. The PRNG is
// seeded rather than Math.random so two captures of the same frame are
// byte identical.

const TILE = 128;
const SEED = 0x1F35C7;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Values stay high (176..255) because the plate multiplies: bright noise
// over dark metal reads as film grain instead of a grey wash
export function paintGrain(el) {
  if (!el) return false;
  try {
    const c = document.createElement("canvas");
    c.width = TILE;
    c.height = TILE;
    const g = c.getContext("2d");
    if (!g) return false;
    const img = g.createImageData(TILE, TILE);
    const d = img.data;
    const rnd = mulberry32(SEED);
    for (let i = 0; i < d.length; i += 4) {
      const v = 176 + ((rnd() * 80) | 0);
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    el.style.backgroundImage = "url(" + c.toDataURL("image/png") + ")";
    return true;
  } catch (err) {
    return false;
  }
}
