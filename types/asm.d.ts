// ambient types for the hand-maintained ppc declaration tables (plain .js)

interface AsmInstruction {
  name: string;
  opCode: number;
  type: string;
  opShift: number[] | null;
  shifts: number[];
  order: number[];
  title?: string;
  help?: string;
  example?: string;
}

interface AsmPseudo {
  name: string;
  args: string[];
  title?: string;
  help?: string;
  example?: string;
  expand: (operands: string[], ctx: unknown) => Array<{ op: string; operands: string[] }>;
}

declare module "@/lib/asm/asm_declarations.overrides" {
  export const INSTRUCTIONS: AsmInstruction[];
  export function byName(): Map<string, AsmInstruction[]>;
}

declare module "@/lib/asm/asm_pseudos.overrides" {
  export const PSEUDOS: AsmPseudo[];
  export function byName(): Map<string, AsmPseudo[]>;
}

interface StructFieldView {
  name: string;
  offset: string;
  type: string | null;
  size: number;
  value: string | null;
}

interface StructDataBlock {
  name: string;
  address: number;
  words: number[];
  byteLen: number;
}

interface StructTypeView {
  name: string;
  address: string | null;
  packed: boolean;
  fields: StructFieldView[];
}

interface StructInstanceView {
  name: string;
  type: string;
  reg: string;
  line: number;
}

interface GlobalView {
  name: string;
  type: string;
  reg: string;
}

interface ParsedStructs {
  types: StructTypeView[];
  instances: StructInstanceView[];
}

declare module "@/lib/struct-preprocessor" {
  export function preprocessStructs(text: string, extraTypeText?: string): string;
  export function parseStructs(text: string): ParsedStructs;
  export function emitStructData(text: string): StructDataBlock[];
}

interface FuncParam {
  name: string;
  type: string;
  reg: string;
}

interface FuncView {
  name: string;
  params: FuncParam[];
  ret: string | null;
  addr: string | null;
  locals: string[];
  line: number;
}

declare module "@/lib/func-preprocessor" {
  export function preprocessFuncs(text: string, extraTypeText?: string): string;
  export function localRenameMap(text: string): Map<string, string>;
  export function parseFuncs(text: string): FuncView[];
  export function parseFuncHeader(code: string): { keyword: string; name: string; addr: string | null; params: FuncParam[]; ret: string | null } | null;
  export function parseGlobals(text: string): GlobalView[];
  export function validateFuncs(text: string):
    | { ok: true }
    | { ok: false; message: string; line: number; col?: number; length: number; errors?: { message: string; line: number; col?: number; length: number }[] };
}

interface ImportResolution {
  text: string;
  structText: string;
  aliasSeed: { name: string; reg: string }[];
  labels: Map<string, { addr: number; from: string; hasAddr: boolean }>;
  missing: { name: string; line: number }[];
  noAddress: string[];
}

declare module "@/lib/import-resolver" {
  export function resolveImports(text: string, loadFile: (name: string) => string | null, opts?: { maxDepth?: number }): ImportResolution;
  export function parseImports(text: string): { name: string; line: number }[];
  export function fileLabels(src: string): { labels: Map<string, number>; hasAddr: boolean };
  export function fileDefs(src: string): { structText: string; aliases: { name: string; reg: string }[] };
}

type CallNodeKind = "entry" | "local" | "imported" | "external";

interface CallNode {
  id: string;
  label: string;
  kind: CallNodeKind;
  sub?: string;
  line?: number;
}

interface CallEdge {
  id: string;
  from: string;
  to: string;
}

interface CallGraphData {
  nodes: CallNode[];
  edges: CallEdge[];
}

declare module "@/lib/call-graph" {
  export function buildCallGraph(text: string, importedFrom?: Map<string, string>): CallGraphData;
}
