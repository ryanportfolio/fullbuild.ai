import type { Metadata } from "next";
import { MorrowApp } from "@/components/morrow/MorrowApp";

export const metadata: Metadata = {
  title: "Morrow — City / Weather",
  description:
    "A customer-facing apparel storefront prototype connected to the Threadline DPC product story.",
};

export default function MorrowPage() {
  return <MorrowApp />;
}
