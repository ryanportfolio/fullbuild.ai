import { Fraunces } from "next/font/google";
import type { ReactNode } from "react";

// Display face for the Tawkify concept only. SOFT 0 / WONK 0 is set in CSS to
// pull Fraunces onto Contralto's territory; opsz is set per type role.
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"],
  variable: "--font-fraunces",
  display: "swap",
});

export default function TawkifyLayout({ children }: { children: ReactNode }) {
  return <div className={fraunces.variable}>{children}</div>;
}
