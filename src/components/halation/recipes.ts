export type EiMode = "box" | "push";

export interface Recipe {
  ei: string;
  dilution: string;
  tempC: string;
  timeSec: number;
}

export interface Stock {
  id: string;
  name: string;
  iso: string;
  /* Kestrel is pinned at 21.0 C; it shows HOLD 21.0 C instead of a compensation strip */
  pinned: boolean;
  box: Recipe;
  push: Recipe;
}

export const stocks: Stock[] = [
  {
    id: "nightjar",
    name: "Nightjar",
    iso: "400",
    pinned: false,
    box: { ei: "400", dilution: "1+31", tempC: "20.0", timeSec: 690 },
    push: { ei: "800", dilution: "1+31", tempC: "20.0", timeSec: 885 },
  },
  {
    id: "ashfield",
    name: "Ashfield",
    iso: "125",
    pinned: false,
    box: { ei: "125", dilution: "1+31", tempC: "20.0", timeSec: 540 },
    push: { ei: "250", dilution: "1+31", tempC: "20.0", timeSec: 675 },
  },
  {
    id: "vireo",
    name: "Vireo",
    iso: "50",
    pinned: false,
    box: { ei: "50", dilution: "1+47", tempC: "20.0", timeSec: 750 },
    push: { ei: "100", dilution: "1+47", tempC: "20.0", timeSec: 900 },
  },
  {
    id: "kestrel",
    name: "Kestrel",
    iso: "3200",
    pinned: true,
    box: { ei: "3200", dilution: "1+15", tempC: "21.0", timeSec: 810 },
    push: { ei: "6400", dilution: "1+15", tempC: "21.0", timeSec: 1020 },
  },
  {
    id: "lantern",
    name: "Lantern",
    iso: "100",
    pinned: false,
    box: { ei: "100", dilution: "1+31", tempC: "20.0", timeSec: 495 },
    push: { ei: "200", dilution: "1+31", tempC: "20.0", timeSec: 620 },
  },
];

/* Spec 2.8: multipliers on base time, rounded to the nearest 5 seconds */
export const compensation: Array<{ tempC: string; factor: number }> = [
  { tempC: "18.0", factor: 1.13 },
  { tempC: "20.0", factor: 1.0 },
  { tempC: "22.0", factor: 0.89 },
  { tempC: "24.0", factor: 0.79 },
];

export function formatTime(totalSec: number): string {
  const rounded = Math.round(totalSec / 5) * 5;
  const min = Math.floor(rounded / 60);
  const sec = rounded % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}
