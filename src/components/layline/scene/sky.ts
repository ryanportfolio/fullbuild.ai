/**
 * One sky, sampled by direction, and everything that needs a colour from it
 * calls the same function: the dome, the reflection in the water, and the haze
 * that eats the far water and the shoreline. A flat grey fog against a gradient
 * sky leaves a seam on the horizon; there is no seam to leave here.
 *
 * One sun, at 22 degrees, bearing 305 in the course frame. That bearing is not
 * decorative: it puts the glint path off the left shoulder of the fleet in the
 * default wide, which is the composition the reference broadcasts use, and it
 * keeps the disc out of the frame in every rig but the low chase.
 */
import { Vector3 } from "three";

const DEG = Math.PI / 180;

export const SUN_ELEVATION = 22;
export const SUN_AZIMUTH = 305;

/* Clear-day coastal extinction, exp(-d * rho). Only the water reads it: the
 * fleet is never more than a few hundred metres out on these legs, so hulls
 * carry no haze term, and the shoreline runs its own SHORE_HAZE. At this rho
 * the far water is down to 6 percent of its own colour at the 5.1 km where the
 * last ring ends, so the surface dissolves into the sky before it can show an
 * edge. */
export const HAZE_RHO = 0.00055;

/* The same closed palette the stylesheet declares. A shader cannot read a CSS
 * custom property, so these hexes exist twice and move together or not at all. */
export const SKY_ZENITH = "#33628c";
export const SKY_HORIZON = "#d9e6ee";
export const SUN_TINT = "#f3ddc0";
export const SUN_DISC = "#ffdfae";
export const WATER_DEEP = "#0a2a44";
export const WATER_MID = "#12456b";
export const WATER_SCATTER = "#1c6b53"; // light through the back of a crest
export const GLINT = "#ffd9a0";
export const WHITECAP = "#eaf2f5";
export const SHORE = "#16212a"; // the bluff and terminals, under their own haze

/* Venue materials, San Pedro Bay (round 4d).
 *
 * Contract amendment 5 replaced the closed-palette rule with a reference rule:
 * every venue colour is the real material, sourced, and the venue is lit rather
 * than tinted. These seven are REFLECTANCES, not screen colours: each is what a
 * colour chart would read off the material under equal-energy white, and
 * VenueShore multiplies them by the sun and the sky to get a pixel. Reading them
 * as if they were the rendered result is wrong by roughly the illuminant.
 *
 * Provenance for every one of them, with the source photographs and the derived
 * numbers, is .tmp/venue-audit/round4d/provenance.md. Only VenueShore reads
 * them; the sky, the water and the boats are untouched. */
export const VENUE_SKY_FILL = "#8196ad"; // the sky dome's own hemispherical average, derived
export const VENUE_APRON = "#7e7d74"; // harbour fill, armour stone, apron, waterfront green
export const VENUE_SCRUB = "#847a63"; // dry coastal sage scrub over Monterey Fm bluffs
export const VENUE_YARD = "#777677"; // container stacks over the concrete apron
export const VENUE_STEEL = "#727575"; // POLB gantry cranes, the mixed liveries of a bank
export const VENUE_BLOCK = "#939293"; // industrial massing, tilt-up and sheet metal
export const VENUE_TOWER = "#77787b"; // downtown Long Beach, precast and blue-green glass

/* The far horizon curtain has no lighting model: it draws a ridge as a fraction
 * of the way from the sky toward a tint, so these three are APPEARANCES rather
 * than reflectances, and they are solved rather than picked. Each measured
 * ridge in research.md came with the sky sampled in the same frame, so the
 * exposure divides out and the ratio transfers to this scene's brighter sky;
 * .tmp/venue-audit/round4d/curtain-solve.mjs inverts the curtain's own mix for
 * the tint each ratio implies at that range's extinction.
 *
 * Both are plain blue. The first round-4d pass used a blue-violet for the far
 * band on the received wisdom that distance goes violet, and the measurements
 * refused it: every sampled ridge came back at hue 199 to 213, blue with a
 * cyan lean, because 80 to 87 per cent of the extinction over this basin is
 * aerosol rather than Rayleigh. */
export const VENUE_RIDGE_NEAR = "#5e78af"; // Palos Verdes at 10 to 17 km
export const VENUE_RIDGE_FAR = "#8fcbe5"; // the San Gabriels at 54 to 90 km
export const VENUE_HAZE_LOW = "#cdd2d2"; // the near-neutral aerosol veil a ridge's foot sits in

/** Unit vector from the scene toward the sun, in world space. */
export function sunDirection(): Vector3 {
  const elevation = SUN_ELEVATION * DEG;
  const bearing = SUN_AZIMUTH * DEG;
  const flat = Math.cos(elevation);
  /* Course bearings run clockwise from +y and the renderer maps +y onto -z. */
  return new Vector3(flat * Math.sin(bearing), Math.sin(elevation), -flat * Math.cos(bearing));
}

export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSunTint;
uniform vec3 uSunDisc;

vec3 laylineSky(vec3 dir, float discWeight) {
  vec3 col = mix(uSkyHorizon, uSkyZenith, pow(clamp(dir.y, 0.0, 1.0), 0.42));
  /* Under the waterline the dome is haze. Any gap between the far water and
   * the horizon has to read as distance, never as a hole. */
  col = mix(col, uSkyHorizon * 0.93, clamp(-dir.y * 7.0, 0.0, 1.0));
  float ang = acos(clamp(dot(dir, uSunDir), -1.0, 1.0));
  float warm = clamp(exp(-ang * 11.0) * 0.62 + exp(-ang * 3.2) * 0.10, 0.0, 1.0);
  col = mix(col, uSunTint, warm);
  /* The disc is carried above 1.0 so tone mapping rolls it off. Reflections
   * ask for it at zero weight, because the specular lobes below already own
   * the sun and counting it twice makes fireflies. */
  return col + uSunDisc * (3.2 * discWeight * (1.0 - smoothstep(0.0072, 0.0104, ang)));
}
`;
