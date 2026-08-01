import type { Metadata } from "next";
import { RelayApp } from "@/components/relay/RelayApp";

export const metadata: Metadata = {
  title: "Relay · Proactive Contact",
  description:
    "A proactive contact center AI agent for a fictional utility, shown from both ends of the wire: the customer's thread on one side, live NLU, flow state and human handover on the other.",
};

export default function RelayPage() {
  return <RelayApp />;
}
