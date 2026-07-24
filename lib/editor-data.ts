// completion + hover data for the editor, built from the same instruction
// tables the assembler uses. one source of truth for the mnemonics, their
// signatures, and their docs.

import { snippetCompletion, type Completion } from "@codemirror/autocomplete";
import { byName as instByName } from "@/lib/asm/asm_declarations.overrides";
import { PSEUDOS } from "@/lib/asm/asm_pseudos.overrides";

export interface Doc {
  title: string;
  help: string;
  example?: string;
}

// how many operand slots a variant uses
function opCount(order: number[]): number {
  return order.length ? Math.max(...order) + 1 : 0;
}

// a readable operand signature derived from the instruction type
function signatureFor(name: string, type: string, order: number[]): string {
  const n = opCount(order);
  const isVecLoad = /^(l|st)v/.test(name);

  // rotate-and-mask family is register-typed but takes shift/mask immediates
  if (/^rlwnm/.test(name)) return "rA, rS, rB, MB, ME";
  if (/^rlw/.test(name)) return "rA, rS, SH, MB, ME";
  // conditional return / computed branch takes an optional CR field
  if (/^b(eq|ne|lt|le|gt|ge|so|ns)(lr|ctr)l?[+-]?$/.test(name)) return n === 0 ? "" : "crX";

  switch (type) {
    case "typeOFI": return "rD, offset(rA)";
    case "typeFOFI": return "fD, offset(rA)";
    case "typeIMM": return n <= 2 ? "rD, IMM" : "rD, rA, IMM";
    case "typeIMM5": return "rA, rS, SH";
    case "typeCND": return n <= 2 ? "rA, SIMM" : "crfD, rA, SIMM";
    case "typeFCND": return "crfD, fA, fB";
    case "typeSPR": return name === "mtspr" ? "SPR, rS" : "rD, SPR";
    case "typeBNC": return "target";
    case "typeBNCMP": return n <= 1 ? "target" : "crX, target";
    case "typeNOP": return "";
    case "typeFNAN":
    case "typeFONE":
      return ["fD", "fA", "fB", "fC"].slice(0, n).join(", ");
    case "typeVREG3":
    case "typeVREG4":
      if (name === "vmaddfp" || name === "vnmsubfp") return "vD, vA, vC, vB";
      if (name === "mtvscr") return "vB";
      if (n === 2) return "vD, vB"; // unary: vupk*, vrefp, vrfi*, ...
      return ["vD", "vA", "vB", "vC"].slice(0, n).join(", ");
    case "typeVX5":
      if (/^vspltis/.test(name)) return "vD, SIMM";
      if (name === "vsldoi") return "vD, vA, vB, SHB";
      return "vD, vB, UIMM"; // vsplt[bhw], vcfux / vcfsx / vctuxs / vctsxs
    default: {
      if (n === 0) return "";
      if (isVecLoad) return ["vD", "rA", "rB"].slice(0, n).join(", ");
      return ["rD", "rA", "rB", "rC"].slice(0, n).join(", ");
    }
  }
}

// which kind of thing a signature operand slot holds
type OpKind = "gpr" | "fpr" | "vr" | "cr" | "spr" | "imm" | "mem" | "target";

function kindOfSigToken(tok: string): OpKind {
  const t = tok.trim();
  if (/^offset/i.test(t)) return "mem";
  if (/^cr/i.test(t)) return "cr"; // crfD, crX
  if (/^r/i.test(t)) return "gpr"; // rD, rA, rB, rC
  if (/^f/i.test(t)) return "fpr"; // fD, fA, fB, fC
  if (/^v/i.test(t)) return "vr"; // vD, vA, vB, vC
  if (t === "SPR") return "spr";
  if (t === "target") return "target";
  return "imm"; // SH, MB, ME, IMM, SIMM, UIMM
}

// per-operand kinds for every variant of a mnemonic (table op or pseudo)
function variantKinds(mnem: string): OpKind[][] {
  const inst = instByName().get(mnem);
  if (inst && inst.length) {
    return inst.map((v) => {
      const sig = signatureFor(v.name, v.type, v.order);
      return sig === "" ? [] : sig.split(",").map(kindOfSigToken);
    });
  }
  const psMap: Record<string, OpKind> = { reg: "gpr", imm: "imm", imm32: "imm", imm64: "imm", addr: "target" };
  return PSEUDOS.filter((p) => p.name.toLowerCase() === mnem).map((p) => (p.args || []).map((a) => psMap[a] ?? "imm"));
}

// does an already-typed operand token fit an expected kind (to pick the variant)
function tokMatchesKind(tok: string, kind: OpKind): boolean {
  const t = tok.trim();
  if (t === "") return true;
  const isGpr = /^r\d+$/i.test(t), isFpr = /^f\d+$/i.test(t), isVr = /^v\d+$/i.test(t), isCr = /^cr\d+$/i.test(t);
  const isReg = isGpr || isFpr || isVr || isCr;
  const isNum = /^[+-]?(0x[0-9a-fA-F]+|\d+)$/.test(t);
  const isIdent = /^[A-Za-z_]\w*$/.test(t) && !isReg; // a bound name / label / alias
  switch (kind) {
    case "gpr": return isGpr || isIdent;
    case "fpr": return isFpr || isIdent;
    case "vr": return isVr || isIdent;
    case "cr": return isCr;
    case "imm": return isNum || isIdent;
    case "mem": case "target": case "spr": return true;
  }
}

// register bank for operand slot opIdx. "none" = no register here, "any" =
// unknown mnemonic (caller's default)
export function registerBankAt(mnem: string, typedOps: string[], opIdx: number): "r" | "f" | "v" | "cr" | "none" | "any" {
  const variants = variantKinds(mnem.toLowerCase());
  if (!variants.length) return "any";
  let compat = variants.filter((k) => opIdx < k.length && typedOps.every((op, i) => i >= k.length || tokMatchesKind(op, k[i])));
  if (!compat.length) compat = variants.filter((k) => opIdx < k.length);
  if (!compat.length) return "any";
  const banks = new Set<OpKind>(compat.map((k) => k[opIdx]));
  if (banks.has("gpr") || banks.has("spr")) return "r";
  if (banks.has("fpr")) return "f";
  if (banks.has("vr")) return "v";
  if (banks.has("cr")) return "cr";
  return "none";
}

// docs lookup for hover, keyed by lowercased mnemonic/directive
export const DOCS = new Map<string, Doc>();

// build a doc popup node (used by both autocomplete info and hover)
export function buildDocNode(doc: Doc): HTMLElement {
  const dom = document.createElement("div");
  dom.className = "cm-doc";
  const title = document.createElement("div");
  title.className = "cm-doc-title";
  title.textContent = doc.title;
  dom.appendChild(title);
  if (doc.help && doc.help.trim()) {
    const pre = document.createElement("pre");
    pre.className = "cm-doc-help";
    pre.textContent = doc.help.trim();
    dom.appendChild(pre);
  }
  if (doc.example && doc.example.trim()) {
    const label = document.createElement("div");
    label.className = "cm-doc-ex";
    label.textContent = "Example";
    dom.appendChild(label);
    const pre = document.createElement("pre");
    pre.className = "cm-doc-help";
    pre.textContent = doc.example.trim();
    dom.appendChild(pre);
  }
  return dom;
}

// `apply` lets an instruction insert a trailing space so operands come next,
// without trapping the user in an operand template (asm is a free-form stream).
// clean up help text pulled from the source tables
function normalizeHelp(s: string): string {
  return String(s || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s*[—–]\s*/g, " - ")
    .trim();
}

function completion(label: string, type: string, detail: string, doc: Doc, apply?: string): Completion {
  DOCS.set(label.toLowerCase(), doc);
  return {
    label,
    type,
    detail: detail || undefined,
    info: () => buildDocNode(doc),
    ...(apply ? { apply } : {}),
  };
}

// structured mnemonic reference for the /docs page
export interface MnemonicDoc {
  name: string;
  signature: string;
  title: string;
  help: string;
  example: string;
  kind: "instruction" | "pseudo" | "directive";
}
export const MNEMONIC_DOCS: MnemonicDoc[] = [];

// instructions: pick the widest variant for the shown signature. ones that take
// operands insert a trailing space on accept so you can keep writing.
const instructionOptions: Completion[] = [];
{
  const table = instByName();
  for (const [name, variants] of table) {
    const widest = variants.reduce((a, b) => (b.order.length >= a.order.length ? b : a));
    const sig = signatureFor(name, widest.type, widest.order);
    const title = widest.title || name;
    const help = normalizeHelp(widest.help || "");
    const example = (widest.example || "").trim();
    const detail = sig ? `${name} ${sig}` : name;
    const apply = opCount(widest.order) > 0 ? `${name} ` : undefined;
    instructionOptions.push(completion(name, "keyword", detail, { title, help, example }, apply));
    // docs: fold the +/- prediction-hint variants into their base entry
    if (/[+-]$/.test(name)) continue;
    const docHelp = table.has(name + "+") || table.has(name + "-")
      ? `${help} Append + or - to hint the branch as taken or not-taken (e.g. ${name}+).`
      : help;
    MNEMONIC_DOCS.push({ name, signature: sig, title, help: docHelp, example, kind: "instruction" });
  }
}

// pseudo-instructions
const pseudoOptions: Completion[] = PSEUDOS.map((p) => {
  const sig = p.args
    .map((a) => (a === "reg" ? "rN" : a === "addr" ? "addr" : a === "imm32" ? "imm32" : a))
    .join(", ");
  const detail = sig ? `${p.name} ${sig}` : p.name;
  const apply = p.args.length > 0 ? `${p.name} ` : undefined;
  const help = normalizeHelp(p.help || "");
  const example = (p.example || "").trim();
  MNEMONIC_DOCS.push({ name: p.name, signature: sig, title: p.title || p.name, help, example, kind: "pseudo" });
  return completion(p.name, "function", detail, { title: p.title || p.name, help, example }, apply);
});

// directives and alias controls. `snippet` fills in the one obvious shape with
// tab-through placeholders (address value, register + type, etc).
interface Directive { name: string; detail: string; title: string; help: string; snippet?: string; example?: string }
const DIRECTIVES: Directive[] = [
  { name: "address", detail: "address 0xADDR", title: "Set Address", help: "Sets the assembly address for the following instructions.", snippet: "address ${0x00000000}", example: "address 0x00A5EA30" },
  { name: "hook", detail: "hook 0xADDR", title: "Hook", help: "Emits a branch at the address to the next address block.", snippet: "hook ${0x00000000}", example: "hook 0x00A5EA30" },
  { name: "hexcode", detail: "hexcode 0xVALUE", title: "Raw Word", help: "Emits a raw 32-bit word.", snippet: "hexcode ${0x60000000}", example: "hexcode 0x60000000" },
  { name: "float", detail: "float 1.5", title: "Float", help: "Emits a 32-bit float.", snippet: "float ${1.5}", example: "float 1.5" },
  { name: "string", detail: "string text", title: "String", help: "Emits a UTF-8 string padded to 4 bytes.", snippet: "string ${text}", example: "string hello" },
  { name: "set", detail: "set rX, name", title: "Define Alias", help: "Names a register so you can use the alias in place of rX.", snippet: "set ${r3}, ${name}", example: "set r31, base" },
  { name: "unset", detail: "unset name", title: "Remove Alias", help: "Removes a single register alias.", snippet: "unset ${name}", example: "unset base" },
  { name: "clearset", detail: "clearset", title: "Clear Aliases", help: "Removes all register aliases.", example: "clearset" },
  { name: "loadstruct", detail: "loadstruct rX, Type", title: "Load Struct", help: "Loads the struct's base address into rX and binds the type to it, so Type.field resolves to offset(rX). Needs a struct with an @ address.", snippet: "loadstruct ${r3}, ${Type}", example: "loadstruct r3, Player" },
  { name: "global", detail: "global name: Type @ rX", title: "Global Binding", help: "Binds a register name visible in every func (base -> r31), typed so base.field resolves. Shows in the Globals panel.", snippet: "global ${name}: ${Type} @ ${r31}", example: "global save: SaveData @ r31" },
];
const directiveOptions: Completion[] = DIRECTIVES.map((d) => {
  const doc = { title: d.title, help: normalizeHelp(d.help), example: d.example };
  DOCS.set(d.name.toLowerCase(), doc); // keep hover docs even for snippet forms
  MNEMONIC_DOCS.push({ name: d.name, signature: d.detail, title: d.title, help: doc.help, example: d.example || "", kind: "directive" });
  return d.snippet
    ? snippetCompletion(d.snippet, { label: d.name, type: "namespace", detail: d.detail, info: () => buildDocNode(doc) })
    : completion(d.name, "namespace", d.detail, doc);
});

// language keywords not in the instruction tables, for the reference
MNEMONIC_DOCS.push(
  { name: "struct", signature: "struct Name [@ addr] [packed] { field : type = value }", title: "Struct", help: "Defines a typed memory layout. Fields align naturally by size (matching how a game struct is compiled), or use @ to override one offset. Add packed to lay fields end to end with no padding. Give it an @ address and field values to emit data.", example: "struct Player @ 0x016C7C30 {\n    health : f32 = 150\n    ammo   : i32\n}", kind: "directive" },
  { name: "func", signature: "func name [@ addr]: [p: Type @ rX, ...]", title: "Function", help: "Declares a function. An optional @ addr places it at an absolute address, the same as an address directive above it, which also lets bl name resolve from other files that import it. Header params (or param lines) bind register names, and .dotted labels are local to it.", example: "func applyDamage @ 0x016C7C30: player: Player @ r3\n    lfs f1, player.health\n    blr", kind: "directive" },
  { name: "sub", signature: "sub name [@ addr]: [p: Type @ rX, ...]", title: "Subroutine", help: "Defines a function. func and sub are interchangeable keywords. Takes an optional @ addr just like func.", example: "sub main @ 0x016C7000:\n    bl applyDamage\n    blr", kind: "directive" },
  { name: "param", signature: "param name: Type @ rX", title: "Param", help: "The body form of a func header param. Must sit at the top of the func, before any instruction.", example: "func applyDamage:\n    param player: Player @ r3\n    param amount: i32 @ r4", kind: "directive" },
  { name: "import", signature: "import filename", title: "Import", help: "Pulls another saved file's exports (struct types, aliases, function addresses) into this one. Transitive.", example: "import combat\n\nbl applyDamage", kind: "directive" },
);

// struct block scaffold: tab through name -> address -> field -> type
const structSnippet: Completion = snippetCompletion(
  "struct ${Name} @ ${0x00000000} {\n    ${field} : ${type}\n}",
  {
    label: "struct",
    type: "namespace",
    detail: "struct block",
    info: "define a struct: name, base address, typed fields",
  }
);

// function scaffold: name then an address placeholder, since a func is usually
// placed at an absolute address (and only then is it callable across files).
// tab from name to the address; delete the `@ ...` part for a func with none.
const funcSnippet = (kw: string): Completion =>
  snippetCompletion(`${kw} \${name} @ \${0x00000000}:`, {
    label: kw,
    type: "keyword",
    detail: `${kw} name @ addr: [param: Type @ rX, ...]`,
    info: "define a function. @ addr places it (and makes bl name work across files). params bind register names, .dotted labels are local",
  });

// body form of a func param, only valid inside a func/sub
export const PARAM_SNIPPET: Completion = snippetCompletion("param ${name}: ${Type} @ ${r3}", {
  label: "param",
  type: "keyword",
  detail: "param name: Type @ rX",
  info: "bind a register name inside a func, same as a header param",
});

// import keyword: inserts a trailing space so the file-name completion opens
const importOption: Completion = completion(
  "import",
  "keyword",
  "import filename",
  {
    title: "Import",
    help: "Pulls another saved file's exports (struct types, aliases, function addresses) into this one. Transitive.",
    example: "import combat",
  },
  "import "
);

// shown when typing a mnemonic (start of a line)
export const MNEMONIC_OPTIONS: Completion[] = [
  ...instructionOptions,
  ...pseudoOptions,
  ...directiveOptions,
  structSnippet,
  funcSnippet("func"),
  funcSnippet("sub"),
  importOption,
];

// registers, shown in operand position
function registerOptions(): Completion[] {
  const out: Completion[] = [];
  const bank = (prefix: string, count: number, kind: string, desc: string) => {
    for (let i = 0; i < count; i++) {
      out.push({ label: `${prefix}${i}`, type: "variable", detail: kind, info: desc });
    }
  };
  bank("r", 32, "GPR", "general purpose register");
  bank("f", 32, "FPR", "floating-point register");
  bank("v", 32, "VR", "vector (altivec) register");
  bank("cr", 8, "CR", "condition register field");
  out.push({ label: "lr", type: "variable", detail: "SPR", info: "link register" });
  out.push({ label: "ctr", type: "variable", detail: "SPR", info: "count register" });
  out.push({ label: "xer", type: "variable", detail: "SPR", info: "fixed-point exception register" });
  return out;
}

export const REGISTER_OPTIONS: Completion[] = registerOptions();
