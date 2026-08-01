import type { Metadata } from "next";
import { HalationApp } from "@/components/halation/HalationApp";

export const metadata: Metadata = {
  title: "Halation · Darkroom Chemistry",
  description:
    "Product page prototype for Halation No. 2, a fictional one-shot black and white film developer. Pick a stock, read your numbers: the recipe card is the product.",
};

export default function HalationPage() {
  return <HalationApp />;
}
