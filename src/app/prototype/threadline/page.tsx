import type { Metadata } from "next";
import { ThreadlineApp } from "@/components/threadline/ThreadlineApp";

export const metadata: Metadata = {
  title: "Threadline — Apparel DPC Launch Control",
  description:
    "An internal operations prototype connecting apparel PLM, 3D, compliance, and commerce launch workflows.",
};

export default function ThreadlinePage() {
  return <ThreadlineApp />;
}
