import type { Metadata } from "next";
import DocsView from "@/components/DocsView";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "PS3 PPU Lab documentation: a PowerPC mnemonic reference and guides for structs, functions, register aliases, imports, and the disassembler. Inspired by CodeWizardPS3.",
  alternates: { canonical: "/docs" },
};

export default function DocsPage() {
  return <DocsView />;
}
