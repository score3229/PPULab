"use client";

import {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import {
  EditorState,
  StateEffect,
  StateField,
  RangeSet,
} from "@codemirror/state";
import {
  EditorView,
  Decoration,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  hoverTooltip,
  gutterLineClass,
  GutterMarker,
  rectangularSelection,
  crosshairCursor,
} from "@codemirror/view";
import type { DecorationSet, Panel } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentMore,
  indentLess,
  toggleComment,
} from "@codemirror/commands";
import { StreamLanguage, HighlightStyle, syntaxHighlighting, indentUnit } from "@codemirror/language";
import {
  search,
  searchKeymap,
  highlightSelectionMatches,
  getSearchQuery,
  setSearchQuery,
  SearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
  closeSearchPanel,
  selectNextOccurrence,
} from "@codemirror/search";
import {
  autocompletion,
  completionKeymap,
  acceptCompletion,
  startCompletion,
} from "@codemirror/autocomplete";
import type { CompletionContext, CompletionResult, Completion } from "@codemirror/autocomplete";
import { oneDarkTheme } from "@codemirror/theme-one-dark";
import { tags } from "@lezer/highlight";
import {
  MNEMONIC_OPTIONS,
  REGISTER_OPTIONS,
  PARAM_SNIPPET,
  DOCS,
  buildDocNode,
  registerBankAt,
} from "@/lib/editor-data";
import { ASM_COLORS } from "@/lib/asm-highlight";
import { parseStructs } from "@/lib/struct-preprocessor";
import { parseFuncs, parseGlobals } from "@/lib/func-preprocessor";
import { listNames, loadFolderState } from "@/lib/file-store";

// ppu asm syntax highlighting
const ppuAsmLanguage = StreamLanguage.define({
  name: "ppu-asm",
  // ctrl+/ line comment toggle uses this (vs code style, via toggleComment)
  languageData: { commentTokens: { line: "//" } },
  // map func-name / local-label token names to highlight tags
  tokenTable: { macroName: tags.macroName, meta: tags.meta },
  startState() {
    return { sawMnemonic: false, funcName: false };
  },
  token(stream, state: { sawMnemonic: boolean; funcName: boolean }) {
    if (stream.sol()) {
      state.sawMnemonic = false;
      state.funcName = false;
      // dotted local label (.loop:) reads muted, before the general label rule
      if (stream.match(/^\s*\.[A-Za-z_]\w*\s*:/)) return "meta";
      // func / sub keyword, the following name gets its own color
      if (stream.match(/^\s*(func|sub)\b/i)) {
        state.sawMnemonic = true;
        state.funcName = true;
        return "keyword";
      }
      if (stream.match(/^\s*[A-Za-z_.$][\w.$]*:/)) return "labelName";
    }
    if (stream.eatSpace()) return null;
    // the identifier right after func/sub is the function name
    if (state.funcName) {
      if (stream.match(/^[A-Za-z_]\w*/)) {
        state.funcName = false;
        return "macroName";
      }
      state.funcName = false;
    }
    if (stream.match("//") || stream.match("#") || stream.match(";")) {
      stream.skipToEnd();
      return "comment";
    }
    if (!state.sawMnemonic) {
      if (stream.match(/^(address|hook|set|unset|clearset)\b/i)) {
        state.sawMnemonic = true;
        return "keyword";
      }
    }
    if (stream.match(/^f([0-9]|[12][0-9]|3[01])\b/i)) return "atom";
    if (stream.match(/^v([0-9]|[12][0-9]|3[01])\b/i)) return "typeName";
    if (stream.match(/^r([0-9]|[12][0-9]|3[01])\b/i)) return "variableName";
    if (stream.match(/^cr([0-7])\b/i)) return "variableName";
    if (
      stream.match(
        /^[+-]?(?:0x[0-9A-Fa-f]+|\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\b/
      )
    )
      return "number";
    if (
      stream.match(
        /^(==|!=|<=|>=|<<|>>|\+=|-=|\*=|\/=|[+\-*/&|^~])/
      )
    )
      return "operator";
    if (stream.match(/^[\[\]\(\),:]/)) return "punctuation";
    if (stream.match(/^[A-Za-z_.][A-Za-z0-9_.]*/)) {
      if (!state.sawMnemonic) {
        state.sawMnemonic = true;
        return "keyword";
      }
      return "name";
    }
    stream.next();
    return null;
  },
});

const ppuAsmHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: ASM_COLORS.keyword },
  { tag: tags.variableName, color: ASM_COLORS.variableName },
  { tag: tags.atom, color: ASM_COLORS.atom },
  { tag: tags.typeName, color: ASM_COLORS.typeName },
  { tag: tags.number, color: ASM_COLORS.number },
  { tag: tags.labelName, color: ASM_COLORS.labelName },
  { tag: tags.macroName, color: ASM_COLORS.funcName },
  { tag: tags.meta, color: ASM_COLORS.localLabel },
  { tag: tags.name, color: ASM_COLORS.name },
  { tag: tags.comment, color: ASM_COLORS.comment },
  { tag: tags.punctuation, color: ASM_COLORS.punctuation },
  { tag: tags.operator, color: ASM_COLORS.operator },
]);

// error decorations. every reported error gets a token squiggle + red gutter
// number, and its message is stashed on the item so hover can show it.
export interface EditorErr {
  line: number;
  col: number | null;
  length: number | null;
  message: string;
}

interface ErrItem {
  from: number;
  to: number;
  message: string;
}

const setErrorsEffect = StateEffect.define<EditorErr[]>();
const clearErrorEffect = StateEffect.define<null>();

const errorGutterMarker = new (class extends GutterMarker {
  elementClass = "cm-errorGutter";
})();

// decorations live in the field so line decorations render
interface ErrState {
  deco: DecorationSet;
  gutter: RangeSet<GutterMarker>;
  items: ErrItem[];
}

function buildErrState(state: EditorState, list: EditorErr[]): ErrState | null {
  const markRanges = [];
  const gutterRanges = [];
  const gutterLines = new Set<number>();
  const items: ErrItem[] = [];
  for (const r of list) {
    if (!r || r.line < 1 || r.line > state.doc.lines) continue;
    const line = state.doc.line(r.line);
    const from = r.col != null ? Math.min(line.to, line.from + Math.max(0, r.col)) : line.from;
    const to = r.col != null ? Math.min(line.to, from + Math.max(1, r.length && r.length > 0 ? r.length : 1)) : line.to;
    if (to > from) markRanges.push(Decoration.mark({ class: "cm-errorTok" }).range(from, to));
    if (!gutterLines.has(line.from)) {
      gutterLines.add(line.from);
      gutterRanges.push(errorGutterMarker.range(line.from));
    }
    items.push({ from, to, message: String(r.message || "") });
  }
  if (!items.length) return null;
  return {
    deco: markRanges.length ? Decoration.set(markRanges, true) : Decoration.none,
    gutter: gutterRanges.length ? RangeSet.of(gutterRanges, true) : RangeSet.empty,
    items,
  };
}

const errorField = StateField.define<ErrState | null>({
  create() {
    return null;
  },
  update(val, tr) {
    for (const ef of tr.effects) {
      if (ef.is(clearErrorEffect)) return null;
      if (ef.is(setErrorsEffect)) return buildErrState(tr.state, ef.value);
    }
    // follow edits so squiggles/dots track their tokens
    if (val && tr.docChanged) {
      return {
        deco: val.deco.map(tr.changes),
        gutter: val.gutter.map(tr.changes),
        items: val.items.map((it) => ({ from: tr.changes.mapPos(it.from), to: tr.changes.mapPos(it.to, 1), message: it.message })),
      };
    }
    return val;
  },
  provide: (f) => [
    EditorView.decorations.from(f, (v) => (v ? v.deco : Decoration.none)),
    gutterLineClass.from(f, (v) => (v ? v.gutter : RangeSet.empty)),
  ],
});

// hover a squiggled token to read its error message
const errorHover = hoverTooltip((view, pos) => {
  const st = view.state.field(errorField, false);
  if (!st) return null;
  const hit = st.items.find((it) => pos >= it.from && pos <= it.to && it.to > it.from);
  if (!hit) return null;
  return {
    pos: hit.from,
    end: hit.to,
    above: true,
    create() {
      const dom = document.createElement("div");
      dom.className = "cm-err-tip";
      dom.textContent = hit.message;
      return { dom };
    },
  };
});

// indentation helpers
const TAB_SIZE = 4;
const INDENT = " ".repeat(TAB_SIZE);

// a line that starts a block whose body should indent: a plain label, a dotted
// local (.loop:), or a func/sub header (which may carry params after the colon).
function isLabelLine(text: string): boolean {
  // func/sub header, with an optional inline `@ addr` before the colon
  if (/^\s*(func|sub)\s+[A-Za-z_]\w*\s*(?:@\s*(?:0[xX][0-9a-fA-F]+|\d+)\s*)?:/i.test(text)) return true;
  return /^\s*\.?[A-Za-z_]\w*:\s*(\/\/.*)?$/.test(text);
}

function isNoFallthroughLine(text: string): boolean {
  const code = text.replace(/\/\/.*$/, "").trim();
  if (!code) return false;
  const m = /^([A-Za-z.]+)\b/.exec(code);
  if (!m) return false;
  const op = m[1].toLowerCase();
  if (op === "blr" || op === "bctr" || op === "bcctr" || op === "b" || op === "ba")
    return true;
  return false;
}

function isAddressLine(text: string): boolean {
  return /^\s*address\s+0x[0-9a-fA-F]+\s*$/.test(text);
}

function leadingWs(s: string): string {
  const m = /^\s*/.exec(s);
  return m ? m[0] : "";
}

function stripLineComment(line: string): string {
  const idxs: number[] = [];
  const a = line.indexOf("//");
  if (a >= 0) idxs.push(a);
  const b = line.indexOf("#");
  if (b >= 0) idxs.push(b);
  const c = line.indexOf(";");
  if (c >= 0) idxs.push(c);
  const i = idxs.length ? Math.min(...idxs) : -1;
  return i >= 0 ? line.slice(0, i) : line;
}

function isCommentOnlyLine(text: string): boolean {
  const t = text.trimStart();
  return t.startsWith("//") || t.startsWith("#") || t.startsWith(";");
}

function isInsideLabelBlock(state: EditorState, pos: number): boolean {
  const doc = state.doc;
  let curLineNum = doc.lineAt(pos).number;
  const curText = doc.line(curLineNum).text;
  if (curText.trim() === "") curLineNum--;
  for (let ln = curLineNum; ln >= 1; ln--) {
    const t = doc.line(ln).text;
    if (isAddressLine(t)) return false;
    if (isNoFallthroughLine(t)) return false;
    if (isLabelLine(t)) return true;
  }
  return false;
}

// column of the first comment marker, or -1
function firstCommentCol(text: string): number {
  const idxs = [text.indexOf("//"), text.indexOf("#"), text.indexOf(";")].filter(
    (i) => i >= 0
  );
  return idxs.length ? Math.min(...idxs) : -1;
}

// collect label names defined in the document, for operand completion
function scanLabels(state: EditorState): string[] {
  const out: string[] = [];
  for (let i = 1; i <= state.doc.lines; i++) {
    const m = state.doc.line(i).text.match(/^\s*([A-Za-z_]\w*):/);
    if (m) out.push(m[1]);
  }
  return out;
}

// which register bank a mnemonic writes to: f* / lfs/lfd/stfs/stfd -> float,
// v* / lvx/stvx -> vector, everything else -> gpr. a base inside (...) is always
// a gpr regardless of the mnemonic.
function regClassForMnemonic(m: string): "r" | "f" | "v" {
  if (!m) return "r";
  if (/^v/.test(m) || /^(lv|stv)/.test(m)) return "v";
  if (/^f/.test(m) || /^(lfs|lfd|stfs|stfd)/.test(m)) return "f";
  return "r";
}

function registersFor(cls: "r" | "f" | "v" | "cr"): Completion[] {
  if (cls === "f") return REGISTER_OPTIONS.filter((o) => o.detail === "FPR");
  if (cls === "v") return REGISTER_OPTIONS.filter((o) => o.detail === "VR");
  if (cls === "cr") return REGISTER_OPTIONS.filter((o) => o.detail === "CR");
  return REGISTER_OPTIONS.filter((o) => o.detail === "GPR" || o.detail === "SPR");
}

// field types offered in a func header / global / param type position
const PRIMITIVE_TYPES = ["i8", "u8", "i16", "u16", "i32", "u32", "i64", "u64", "f32", "f64", "ptr", "bool", "vec", "string", "char", "bytes"];

// short signature for a function, for completion detail / outline
function funcSignature(f: { params: { name: string; type: string; reg: string }[] }): string {
  return `(${f.params.map((p) => `${p.name}: ${p.type}`).join(", ")})`;
}

// the function whose scope contains a given 1-based line (last func at/before it)
function funcAtLine(docText: string, lineNumber: number) {
  const funcs = parseFuncs(docText);
  let cur: (typeof funcs)[number] | null = null;
  for (const f of funcs) {
    if (f.line <= lineNumber) cur = f;
    else break;
  }
  return cur;
}

// param is only valid in the top block of a func: walk up, allowing blanks,
// comments and other param lines, until the func header. anything else ends it.
function inParamRegion(docText: string, lineNumber: number): boolean {
  const lines = docText.split("\n");
  for (let i = lineNumber - 1; i >= 1; i--) {
    const t = stripLineComment(lines[i - 1]).trim();
    if (!t) continue;
    if (/^(func|sub)\s+[A-Za-z_]\w*\s*:/i.test(t)) return true;
    if (/^param\s/i.test(t)) continue;
    return false;
  }
  return false;
}

// inside a multi-line `struct { ... }` block
function inStructBlock(docText: string, lineNumber: number): boolean {
  const lines = docText.split("\n");
  for (let i = lineNumber - 1; i >= 1; i--) {
    const t = lines[i - 1];
    if (t.includes("}")) return false;
    if (/^\s*struct\b/i.test(t) && t.includes("{")) return true;
  }
  return false;
}

// autocomplete: mnemonics at line start, then context-aware operands, struct
// fields after a `.`, struct types after loadstruct, registers by mnemonic bank.
function ppuComplete(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  if (firstCommentCol(before) >= 0) return null;

  // field completion after "Owner." (a struct type or a bound instance)
  const dotm = before.match(/([A-Za-z_]\w*)\.(\w*)$/);
  if (dotm) {
    const owner = dotm[1];
    const { types, instances } = parseStructs(context.state.doc.toString());
    const inst = instances.find((i) => i.name === owner);
    const typeName = inst ? inst.type : types.some((t) => t.name === owner) ? owner : null;
    const t = typeName ? types.find((x) => x.name === typeName) : null;
    if (!t) return null;
    return {
      from: context.pos - dotm[2].length,
      options: t.fields.map((f) => ({
        label: f.name,
        type: "property",
        detail: [f.type, f.offset].filter(Boolean).join(" "),
      })),
      validFor: /^\w*$/,
    };
  }

  // dotted local target (b .clamp) -> this function's locals. not at line start,
  // where a bare ".name" is a label being defined, not referenced.
  const dotLocal = before.match(/[\s,(]\.(\w*)$/);
  if (dotLocal && !/^\s*\.\w*$/.test(before)) {
    const f = funcAtLine(context.state.doc.toString(), line.number);
    const locals = f ? f.locals : [];
    if (!locals.length) return null;
    return {
      from: context.pos - dotLocal[1].length - 1,
      options: locals.map((l) => ({ label: `.${l}`, type: "variable", detail: "local label" })),
      validFor: /^\.\w*$/,
    };
  }

  // "import <name>" -> saved file names (a file's identity is its name, so this
  // is independent of which folder it lives in)
  const imp = before.match(/^\s*import\s+(\S*)$/i);
  if (imp) {
    const names = listNames();
    if (!names.length) return null;
    const assign = loadFolderState().assign;
    return {
      from: context.pos - imp[1].length,
      options: names.map((n) => ({
        label: n,
        type: "file",
        detail: assign[n] || undefined, // show the folder, nothing for root files
        // quote names with spaces, matching the import parser
        apply: /\s/.test(n) ? `"${n}"` : n,
      })),
      validFor: /^\S*$/,
    };
  }

  const word = context.matchBefore(/[\w.]*/);
  if (!word) return null;
  if (word.from === word.to && !context.explicit) return null;

  // still on the first token -> mnemonic / directive / pseudo. `param` only
  // suggests in a func's top region (before any instruction).
  if (/^\s*[\w.]*$/.test(before)) {
    const options = inParamRegion(context.state.doc.toString(), line.number)
      ? [...MNEMONIC_OPTIONS, PARAM_SNIPPET]
      : MNEMONIC_OPTIONS;
    return { from: word.from, options, validFor: /^[\w.]*$/ };
  }

  // inside a func header / global / param (name: Type @ reg) -> types after `:`, regs after `@`
  const header = before.match(/^\s*(func|sub|global|param)\s+[A-Za-z_]\w*\s*:(.*)$/i);
  if (header) {
    const kw = header[1].toLowerCase();
    const rest = header[2];
    const lastAt = rest.lastIndexOf("@");
    const lastColon = rest.lastIndexOf(":");
    const lastComma = rest.lastIndexOf(",");
    // global/param declare a single `type @ reg`, the name is already before the colon
    const single = kw === "global" || kw === "param";
    if (lastAt > lastColon && lastAt > lastComma) {
      return { from: word.from, options: REGISTER_OPTIONS, validFor: /^\w*$/ };
    }
    if (single || (lastColon >= 0 && lastColon > lastComma)) {
      const structTypes = parseStructs(context.state.doc.toString()).types.map((t) => ({
        label: t.name,
        type: "class" as const,
        detail: "struct",
      }));
      const prims = PRIMITIVE_TYPES.map((t) => ({ label: t, type: "type" as const, detail: "scalar" }));
      return { from: word.from, options: [...structTypes, ...prims], validFor: /^\w*$/ };
    }
    return null; // typing a func param name, nothing to suggest
  }

  // struct field type slot: `name : <typing>` inside a struct block
  if (/^\s*[A-Za-z_]\w*\s*:\s*\w*$/.test(before) && inStructBlock(context.state.doc.toString(), line.number)) {
    const structTypes = parseStructs(context.state.doc.toString()).types.map((t) => ({
      label: t.name,
      type: "class" as const,
      detail: "struct",
    }));
    const prims = PRIMITIVE_TYPES.map((t) => ({ label: t, type: "type" as const, detail: "scalar" }));
    return { from: word.from, options: [...structTypes, ...prims], validFor: /^\w*$/ };
  }

  // a bare label being defined (loop:), not an operand slot, so open nothing
  if (/^\s*[.$]?[A-Za-z_][\w.$]*\s*:\s*$/.test(before)) return null;

  const mnem = (before.match(/^\s*([A-Za-z_.]\w*)/)?.[1] || "").toLowerCase();

  // loadstruct's second operand -> struct type names
  if (mnem === "loadstruct") {
    const { types } = parseStructs(context.state.doc.toString());
    return {
      from: word.from,
      options: types.map((t) => ({
        label: t.name,
        type: "class",
        detail: t.address ? `struct @ ${t.address}` : "struct",
      })),
      validFor: /^\w*$/,
    };
  }

  // register inside (...) is always a gpr base. else offer registers only where one goes
  const inParens = before.lastIndexOf("(") > before.lastIndexOf(")");
  let regs: Completion[];
  if (inParens) {
    regs = registersFor("r");
  } else {
    const opText = before.replace(/^\s*[A-Za-z_][\w.]*\s+/, "");
    const opParts = opText.split(",");
    const opIdx = opParts.length - 1;
    const typedOps = opParts.slice(0, -1).map((s) => s.trim());
    const bank = registerBankAt(mnem, typedOps, opIdx);
    regs = bank === "none" ? [] : registersFor(bank === "any" ? regClassForMnemonic(mnem) : bank);
  }

  const labelOpts: Completion[] = scanLabels(context.state).map((l) => ({
    label: l,
    type: "variable",
    detail: "label",
  }));
  // func names are branch/call targets too, but scanLabels misses `func x:`
  const funcOpts: Completion[] = inParens
    ? []
    : parseFuncs(context.state.doc.toString()).map((f) => ({
        label: f.name,
        type: "function",
        detail: funcSignature(f),
      }));
  const typeOpts: Completion[] = inParens
    ? []
    : parseStructs(context.state.doc.toString()).types.map((t) => ({
        label: t.name,
        type: "class",
        detail: "struct",
      }));
  // defined register names: this func's params, globals, and instances
  const varOpts: Completion[] = inParens
    ? []
    : (() => {
        const doc = context.state.doc.toString();
        const seen = new Set<string>();
        const out: Completion[] = [];
        const add = (name: string, detail: string) => {
          if (seen.has(name)) return;
          seen.add(name);
          out.push({ label: name, type: "variable", detail });
        };
        funcAtLine(doc, line.number)?.params.forEach((p) => add(p.name, `${p.type} @ ${p.reg}`));
        parseGlobals(doc).forEach((g) => add(g.name, `${g.type} @ ${g.reg}`));
        parseStructs(doc).instances.forEach((i) => add(i.name, `${i.type} @ ${i.reg}`));
        return out;
      })();
  return {
    from: word.from,
    options: [...varOpts, ...funcOpts, ...typeOpts, ...labelOpts, ...regs],
    validFor: /^[\w.]*$/,
  };
}

// hover metadata: struct layouts, func signatures, bound registers, field
// offsets, and the usual mnemonic / directive docs.
const ppuHover = hoverTooltip((view, pos) => {
  const line = view.state.doc.lineAt(pos);
  const rel = pos - line.from;
  const text = line.text;
  if (firstCommentCol(text.slice(0, rel)) >= 0) return null;

  let s = rel;
  let e = rel;
  while (s > 0 && /[\w.]/.test(text[s - 1])) s--;
  while (e < text.length && /[\w.]/.test(text[e])) e++;
  if (s === e) return null;
  const token = text.slice(s, e);
  const range = { pos: line.from + s, end: line.from + e, above: true as const };
  const show = (title: string, help: string) => ({
    ...range,
    create: () => ({ dom: buildDocNode({ title, help }) }),
  });

  const docText = view.state.doc.toString();
  const { types, instances } = parseStructs(docText);
  const funcs = parseFuncs(docText);
  const globals = parseGlobals(docText);
  let curFunc: (typeof funcs)[number] | null = null;
  for (const f of funcs) {
    if (f.line <= line.number) curFunc = f;
    else break;
  }

  const findType = (name: string) => types.find((t) => t.name === name) || null;
  const resolveOwner = (owner: string) => {
    const p = curFunc?.params.find((x) => x.name === owner);
    if (p) return { type: p.type, reg: p.reg, kind: "param" };
    const g = globals.find((x) => x.name === owner);
    if (g) return { type: g.type, reg: g.reg, kind: "global" };
    const inst = instances.find((x) => x.name === owner);
    if (inst) return { type: inst.type, reg: inst.reg, kind: "instance" };
    if (findType(owner)) return { type: owner, reg: null as string | null, kind: "type" };
    return null;
  };

  // owner.field -> resolved offset + type
  const dot = token.indexOf(".");
  if (dot > 0 && dot === token.lastIndexOf(".")) {
    const owner = token.slice(0, dot);
    const own = resolveOwner(owner);
    const fd = own ? findType(own.type)?.fields.find((f) => f.name === token.slice(dot + 1)) : null;
    if (own && fd) {
      const at = own.reg ? `${fd.offset}(${own.reg})` : fd.offset;
      const lines = [`${fd.type || "field"} @ ${at}`];
      if (own.reg) lines.push(`${owner} = ${own.reg} (${own.type})`);
      return show(token, lines.join("\n"));
    }
  }

  // struct type -> full layout + total size
  const st = findType(token);
  if (st) {
    const size = st.fields.reduce((mx, f) => Math.max(mx, parseInt(f.offset.replace(/^0x/i, ""), 16) + f.size), 0);
    const lines = [`${st.fields.length} field${st.fields.length === 1 ? "" : "s"} · ${size} bytes${st.address ? ` @ ${st.address}` : ""}`];
    for (const f of st.fields) {
      lines.push(`${f.name} : ${f.type || "?"} @ ${f.offset}${f.value ? ` = ${f.value}` : ""}`);
    }
    return show(`struct ${token}`, lines.join("\n"));
  }

  // param / global / bound instance -> type + register
  const own = resolveOwner(token);
  if (own && own.reg) {
    return show(token, `${own.type} @ ${own.reg}\n${own.kind}`);
  }

  // func -> signature + locals
  const fn = funcs.find((f) => f.name === token);
  if (fn) {
    const sig = fn.params.map((p) => `${p.name}: ${p.type} @ ${p.reg}`).join(", ");
    const lines = [`func ${fn.name}(${sig})`];
    if (fn.ret) lines.push(`-> ${fn.ret}`);
    if (fn.locals.length) lines.push(`locals: ${fn.locals.map((l) => `.${l}`).join(", ")}`);
    return show(fn.name, lines.join("\n"));
  }

  // mnemonic / directive docs
  const doc = DOCS.get(token.toLowerCase());
  if (doc) return { ...range, create: () => ({ dom: buildDocNode(doc) }) };

  return null;
}, { hoverTime: 120 });

// custom find/replace panel, vs code style. replaces codemirror's flat one
function makeSearchPanel(view: EditorView): Panel {
  const q0 = getSearchQuery(view.state);

  const wrap = document.createElement("div");
  wrap.className = "cmv-find";

  const mkInput = (placeholder: string, value: string) => {
    const i = document.createElement("input");
    i.className = "cmv-input";
    i.placeholder = placeholder;
    i.value = value;
    i.setAttribute("spellcheck", "false");
    i.setAttribute("autocomplete", "off");
    return i;
  };

  const mkToggle = (glyph: string, title: string, on: boolean) => {
    const b = document.createElement("button");
    b.className = "cmv-toggle" + (on ? " on" : "");
    b.type = "button";
    b.textContent = glyph;
    b.title = title;
    b.tabIndex = -1;
    return b;
  };

  const mkBtn = (label: string, title: string, glyph = false) => {
    const b = document.createElement("button");
    b.className = glyph ? "cmv-icon" : "cmv-btn";
    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.tabIndex = -1;
    return b;
  };

  const findInput = mkInput("Find", q0.search);
  const replaceInput = mkInput("Replace", q0.replace);

  const caseBtn = mkToggle("Aa", "Match Case", q0.caseSensitive);
  const wordBtn = mkToggle("⬜", "Match Whole Word", q0.wholeWord);
  wordBtn.textContent = "ab";
  const reBtn = mkToggle(".*", "Use Regular Expression", q0.regexp);

  const prevBtn = mkBtn("↑", "Previous Match (Shift+Enter)", true);
  const nextBtn = mkBtn("↓", "Next Match (Enter)", true);
  const closeBtn = mkBtn("×", "Close (Esc)", true);
  closeBtn.classList.add("cmv-close");

  const replaceBtn = mkBtn("Replace", "Replace (Enter)");
  const replaceAllBtn = mkBtn("All", "Replace All");

  const commit = () => {
    view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({
          search: findInput.value,
          replace: replaceInput.value,
          caseSensitive: caseBtn.classList.contains("on"),
          wholeWord: wordBtn.classList.contains("on"),
          regexp: reBtn.classList.contains("on"),
        })
      ),
    });
  };

  const toggle = (b: HTMLButtonElement) => {
    b.classList.toggle("on");
    commit();
    findInput.focus();
  };
  caseBtn.onclick = () => toggle(caseBtn);
  wordBtn.onclick = () => toggle(wordBtn);
  reBtn.onclick = () => toggle(reBtn);

  findInput.oninput = commit;
  replaceInput.oninput = commit;

  findInput.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.shiftKey ? findPrevious : findNext)(view);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeSearchPanel(view);
      view.focus();
    }
  };
  replaceInput.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      replaceNext(view);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeSearchPanel(view);
      view.focus();
    }
  };

  prevBtn.onclick = () => findPrevious(view);
  nextBtn.onclick = () => findNext(view);
  replaceBtn.onclick = () => replaceNext(view);
  replaceAllBtn.onclick = () => replaceAll(view);
  closeBtn.onclick = () => {
    closeSearchPanel(view);
    view.focus();
  };

  const toggles = document.createElement("div");
  toggles.className = "cmv-toggles";
  toggles.append(caseBtn, wordBtn, reBtn);

  const findRow = document.createElement("div");
  findRow.className = "cmv-row";
  findRow.append(findInput, toggles, prevBtn, nextBtn);

  const replaceRow = document.createElement("div");
  replaceRow.className = "cmv-row";
  replaceRow.append(replaceInput, replaceBtn, replaceAllBtn);

  wrap.append(findRow, replaceRow, closeBtn);

  return {
    dom: wrap,
    top: true,
    mount() {
      // seed the find field from the current selection, like vs code
      const sel = view.state.selection.main;
      if (!findInput.value && !sel.empty) {
        const text = view.state.sliceDoc(sel.from, sel.to);
        if (text && !text.includes("\n")) {
          findInput.value = text;
          commit();
        }
      }
      findInput.focus();
      findInput.select();
    },
  };
}

export interface EditorHandle {
  getText: () => string;
  setText: (text: string) => void;
  focus: () => void;
  getSelectionRange: () => { start: number; end: number };
  setSelectionRange: (start: number, end: number) => void;
  scrollToLine: (lineNumber: number, col?: number) => void;
  setErrors: (errors: EditorErr[]) => void;
  clearError: () => void;
  getState: () => EditorState | null;
  setState: (state: EditorState) => void;
  createStateFromText: (text: string) => EditorState;
}

type LabelResolver = (
  name: string
) => { line: number; index?: number; length?: number } | null;

interface EditorProps {
  onChange?: (text: string) => void;
  labelResolver?: LabelResolver;
  onCursor?: (line: number, col: number) => void;
  onReady?: () => void;
}

const PPUEditor = forwardRef<EditorHandle, EditorProps>(function PPUEditor(
  { onChange, labelResolver, onCursor, onReady },
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const labelResolverRef = useRef(labelResolver);
  const onCursorRef = useRef(onCursor);
  const onReadyRef = useRef(onReady);

  // keep the latest callbacks without re-creating the editor
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    labelResolverRef.current = labelResolver;
  }, [labelResolver]);
  useEffect(() => {
    onCursorRef.current = onCursor;
  }, [onCursor]);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  const buildExtensions = useCallback(() => {
    const ctrlClickHandler = EditorView.domEventHandlers({
      mousedown(event, v) {
        if (event.button !== 0) return false;
        if (!(event.ctrlKey || event.metaKey)) return false;
        const pos = v.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos == null) return false;
        const w = v.state.wordAt(pos);
        if (!w) return false;
        const raw = v.state.doc.sliceString(w.from, w.to);
        const name = raw.replace(/:$/, "");
        const resolver = labelResolverRef.current;
        if (resolver) {
          const hit = resolver(name);
          if (hit?.line) {
            const ln = hit.line | 0;
            const line = v.state.doc.line(ln);
            v.dispatch({
              selection: { anchor: line.from },
              scrollIntoView: true,
            });
            if (typeof hit.index === "number") {
              const a = hit.index | 0;
              const b = typeof hit.length === "number" ? a + (hit.length | 0) : a;
              v.dispatch({ selection: { anchor: a, head: b }, scrollIntoView: true });
            }
            v.focus();
            event.preventDefault();
            return true;
          }
        }
        return false;
      },
    });

    const notifyChange = EditorView.updateListener.of((u) => {
      if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
      if (u.docChanged || u.selectionSet) {
        const head = u.state.selection.main.head;
        const line = u.state.doc.lineAt(head);
        onCursorRef.current?.(line.number, head - line.from + 1);
      }
    });

    // whenever a user edit leaves the cursor right after `:` or `@` (typed, or a
    // cleared snippet placeholder), open completion so the full list shows
    const autoOpenComplete = EditorView.updateListener.of((u) => {
      if (!u.docChanged) return;
      if (!u.transactions.some((tr) => tr.isUserEvent("input") || tr.isUserEvent("delete"))) return;
      const head = u.state.selection.main.head;
      const line = u.state.doc.lineAt(head);
      const before = line.text.slice(0, head - line.from);
      // open after `@` (header register slot) or right after `import ` (file
      // names). not on a bare `:`, which ends a label or struct field, not an
      // operand slot (type slots still open when you type the first letter)
      if (/@\s*$/.test(before) || /^\s*import\s+\S*$/i.test(before)) {
        setTimeout(() => startCompletion(u.view), 0);
      }
    });

    const tabKeymap = [
      {
        key: "Tab",
        run: (v: EditorView) => {
          // accept an open completion first, vs code style
          if (acceptCompletion(v)) return true;
          const sel = v.state.selection.main;
          const doc = v.state.doc;
          const aLine = doc.lineAt(sel.from).number;
          const bLine = doc.lineAt(sel.to).number;
          if (aLine !== bLine || sel.from !== sel.to) return indentMore(v);
          const line = doc.lineAt(sel.from);
          const col = sel.from - line.from;
          if (col === 0 && isInsideLabelBlock(v.state, sel.from)) {
            v.dispatch(v.state.replaceSelection(INDENT));
            return true;
          }
          const mod = col % TAB_SIZE;
          const spaces = mod === 0 ? TAB_SIZE : TAB_SIZE - mod;
          v.dispatch(v.state.replaceSelection(" ".repeat(spaces)));
          return true;
        },
      },
      { key: "Shift-Tab", run: indentLess },
    ];

    const enterKeymap = [
      {
        key: "Enter",
        run: (v: EditorView) => {
          const sel = v.state.selection.main;
          const doc = v.state.doc;
          const line = doc.lineAt(sel.from);
          const text = line.text;

          if (isNoFallthroughLine(text)) {
            v.dispatch({
              changes: { from: sel.from, to: sel.to, insert: "\n" },
              selection: { anchor: sel.from + 1 },
            });
            return true;
          }

          let indent = leadingWs(text);
          if (isCommentOnlyLine(text)) {
            indent = isInsideLabelBlock(v.state, sel.from) ? INDENT : "";
          } else {
            const codePart = stripLineComment(text);
            indent = leadingWs(codePart);
          }
          // a block opener (struct ... {) indents its body one level in
          if (stripLineComment(text).trimEnd().endsWith("{")) {
            indent = leadingWs(text) + INDENT;
          } else if (isLabelLine(text)) {
            // one level past the label's own indent (a .local inside a func nests)
            indent = leadingWs(text) + INDENT;
          } else if (isInsideLabelBlock(v.state, sel.from)) {
            if (indent.length < INDENT.length) indent = INDENT;
          }

          v.dispatch({
            changes: { from: sel.from, to: sel.to, insert: "\n" + indent },
            selection: { anchor: sel.from + 1 + indent.length },
          });
          return true;
        },
      },
    ];

    return [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      history(),
      // find/replace widget floats at the top like vs code, custom panel
      search({ top: true, createPanel: makeSearchPanel }),
      highlightSelectionMatches(),
      // alt+drag for a vertical column selection, vs code style
      rectangularSelection(),
      crosshairCursor(),
      oneDarkTheme,
      ppuAsmLanguage,
      syntaxHighlighting(ppuAsmHighlightStyle),
      ctrlClickHandler,
      errorField,
      errorHover,
      autocompletion({
        activateOnTyping: true,
        icons: false,
        override: [ppuComplete],
        // right-align the folder tag on import file suggestions only
        optionClass: (c) => (c.type === "file" ? "cm-opt-file" : ""),
      }),
      ppuHover,
      EditorState.tabSize.of(4),
      indentUnit.of("    "),
      keymap.of([
        ...tabKeymap,
        ...completionKeymap,
        ...enterKeymap,
        { key: "Mod-/", run: toggleComment },
        // ahead of defaultKeymap so ctrl+d beats emacs deleteCharForward
        { key: "Mod-d", run: selectNextOccurrence, preventDefault: true },
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
      ]),
      notifyChange,
      autoOpenComplete,
    ];
  }, []);

  useEffect(() => {
    if (!hostRef.current || viewRef.current) return;

    const state = EditorState.create({
      doc: "",
      extensions: buildExtensions(),
    });

    viewRef.current = new EditorView({
      state,
      parent: hostRef.current,
    });

    // view exists and the handle is attached, tell the group to load its tab
    onReadyRef.current?.();

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [buildExtensions]);

  useImperativeHandle(
    ref,
    () => ({
      getText() {
        return viewRef.current?.state.doc.toString() ?? "";
      },
      setText(text: string) {
        if (!viewRef.current) return;
        viewRef.current.setState(
          EditorState.create({
            doc: String(text ?? ""),
            extensions: buildExtensions(),
          })
        );
      },
      focus() {
        viewRef.current?.focus();
      },
      getSelectionRange() {
        if (!viewRef.current) return { start: 0, end: 0 };
        const r = viewRef.current.state.selection.main;
        return { start: r.from, end: r.to };
      },
      setSelectionRange(start: number, end: number) {
        if (!viewRef.current) return;
        viewRef.current.dispatch({
          selection: { anchor: Math.max(0, start | 0), head: Math.max(0, end | 0) },
          scrollIntoView: true,
        });
        viewRef.current.focus();
      },
      scrollToLine(lineNumber: number, col?: number) {
        if (!viewRef.current) return;
        const ln = Math.max(1, lineNumber | 0);
        if (ln > viewRef.current.state.doc.lines) return;
        const line = viewRef.current.state.doc.line(ln);
        // land the cursor on the given column (e.g. an error token) when asked,
        // otherwise at the line start
        const anchor = col != null ? Math.min(line.to, line.from + Math.max(0, col | 0)) : line.from;
        viewRef.current.dispatch({
          selection: { anchor },
          scrollIntoView: true,
        });
      },
      setErrors(errors: EditorErr[]) {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({ effects: setErrorsEffect.of(Array.isArray(errors) ? errors : []) });
      },
      clearError() {
        if (!viewRef.current) return;
        viewRef.current.dispatch({ effects: clearErrorEffect.of(null) });
      },
      getState() {
        return viewRef.current?.state ?? null;
      },
      setState(state: EditorState) {
        if (!viewRef.current || !state) return;
        viewRef.current.setState(state);
        viewRef.current.focus();
      },
      createStateFromText(text: string) {
        return EditorState.create({
          doc: String(text ?? ""),
          extensions: buildExtensions(),
        });
      },
    }),
    [buildExtensions]
  );

  return (
    <div className="relative overflow-hidden h-[clamp(420px,65vh,800px)]">
      <div ref={hostRef} className="cm6-host" />
    </div>
  );
});

export default PPUEditor;
