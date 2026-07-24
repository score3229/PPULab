"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Search, Cpu, BookOpen, Library, Heart, Keyboard, Zap, Pencil, Terminal, Copy, Check, Compass, Files } from "lucide-react";
import { tokenizeAsmLine } from "@/lib/asm-highlight";
import { MNEMONIC_DOCS } from "@/lib/editor-data";

const CODEWIZARD_REPO = "https://github.com/Dnawrkshp/CodeWizardPS3";
const PORTFOLIO = "https://mackcore.io";
const REPO = "https://github.com/score3229/PPULab";

type TabKey = "guide" | "reference" | "keybinds" | "api" | "planned" | "about";

// syntax-highlighted asm snippet, colored the same as the editor
function Code({ code }: { code: string }) {
  return (
    <pre className="my-3 overflow-x-auto rounded-lg border border-border bg-[#0d1117] p-4 font-mono text-[13px] leading-[1.65] text-text-secondary">
      {code.replace(/\n+$/, "").split("\n").map((line, i) => {
        const spans = tokenizeAsmLine(line);
        return (
          <div key={i}>
            {spans.length
              ? spans.map((s, j) => (
                  <span key={j} style={{ color: s.color }}>
                    {s.text}
                  </span>
                ))
              : " "}
          </div>
        );
      })}
    </pre>
  );
}

function H({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mt-10 mb-3 scroll-mt-[68px] text-lg font-semibold text-text-primary first:mt-0">
      {children}
    </h2>
  );
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-[14px] leading-relaxed text-text-secondary">{children}</p>;
}
function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-input-bg px-1.5 py-0.5 font-mono text-[12.5px] text-accent">{children}</code>;
}

const GUIDE_NAV = [
  ["start", "Getting started"],
  ["address", "Addresses & hooks"],
  ["aliases", "Register aliases"],
  ["structs", "Structs"],
  ["funcs", "Functions"],
  ["imports", "Imports"],
  ["traps", "Debugging with traps"],
  ["disasm", "Disassembler"],
] as const;

function Guide() {
  const [active, setActive] = useState<string>(GUIDE_NAV[0][0]);

  // scroll-spy: highlight the section whose heading sits nearest the top
  useEffect(() => {
    const ids = GUIDE_NAV.map(([id]) => id);
    const onScroll = () => {
      const innerH = window.innerHeight;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerH);
      // reading line ramps down in the last screenful so tail sections still light up
      const rampZone = Math.min(innerH, maxScroll);
      const distFromBottom = maxScroll - window.scrollY;
      const line =
        rampZone > 0 && distFromBottom < rampZone
          ? 90 + (innerH - 90) * (1 - distFromBottom / rampZone)
          : 90;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="flex gap-8">
      <nav className="sticky top-[68px] hidden h-max w-48 shrink-0 flex-col lg:flex">
        <div className="mb-2 pl-4 text-[10px] font-semibold uppercase tracking-[0.09em] text-text-muted">On this page</div>
        <div className="flex flex-col border-l border-border">
          {GUIDE_NAV.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={() => setActive(id)}
              className={`-ml-px border-l-2 py-1.5 pl-4 text-[13px] transition-colors ${
                active === id
                  ? "border-accent font-medium text-accent"
                  : "border-transparent text-text-muted hover:border-border-hover hover:text-text-secondary"
              }`}
            >
              {label}
            </a>
          ))}
        </div>
      </nav>

      <div className="min-w-0 max-w-2xl">
        <div className="mb-5 flex items-center gap-2 text-accent">
          <BookOpen size={16} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.09em]">Guide</span>
        </div>
        {/* narrow screens: a horizontal section strip stands in for the side rail */}
        <div className="sticky top-[52px] z-10 -mx-5 mb-5 flex gap-1.5 overflow-x-auto border-b border-border bg-base-bg/95 px-5 py-2.5 backdrop-blur lg:hidden">
          {GUIDE_NAV.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={() => setActive(id)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-[12px] transition-colors ${
                active === id
                  ? "border-accent/50 bg-accent/15 text-accent"
                  : "border-border text-text-muted hover:text-text-secondary"
              }`}
            >
              {label}
            </a>
          ))}
        </div>

        <H id="start">Getting started</H>
        <P>
          Write PowerPC in the editor and hit <C>Assemble</C> (or <C>Ctrl+Enter</C>). The assembled words show on the right;
          pick a shape from the format dropdown: hex, raw bytes, C#/C arrays, RPCS3 <C>patch.yml</C>, or NetCheat. Save a file
          with <C>Ctrl+S</C>.
        </P>
        <Code code={`li r3, 0x1\nblr`} />

        <H id="address">Addresses & hooks</H>
        <P>
          <C>address</C> sets where the following words live in memory. The address-based output (RPCS3, NetCheat, hex blocks)
          needs it. <C>hook</C> writes a branch at an address into the next block.
        </P>
        <Code code={`address 0x00A5EA30\nli r3, 0\nblr`} />

        <H id="aliases">Register aliases</H>
        <P>
          Name a register so you can read the code instead of the number. <C>set</C> binds a name, <C>unset</C> drops one,{" "}
          <C>clearset</C> clears them all.
        </P>
        <Code code={`set r31, base\nlwz r3, 0x10(base)\nunset base`} />

        <H id="structs">Structs</H>
        <P>
          A <C>struct</C> names a memory layout. Fields lay out by their type size (or an explicit <C>@ offset</C>). Give it an{" "}
          <C>@ address</C> and field values and it also <em>emits</em> that data at the address, zeroing any unset fields.
        </P>
        <Code code={`struct Player @ 0x016C7C30 {\n    name   : string[16]\n    health : f32 = 150\n    ammo   : i32\n}`} />
        <P>
          To read fields in code, get the base into a register. Use <C>loadstruct rX, Type</C> (loads the struct&apos;s address),
          or <C>set rX, name as Type</C> to type a pointer a caller already gave you. Then <C>Type.field</C> resolves to{" "}
          <C>offset(rX)</C>.
        </P>
        <Code code={`loadstruct r3, Player\nlfs  f1, Player.health   // -> lfs f1, 0x10(r3)\nlbz  r4, Player.ammo`} />
        <P>
          Fields <strong>align naturally</strong> by default, matching how a game struct was compiled, so overlaying an
          existing structure lines up for free. Add <C>packed</C> after the name or address to lay fields end to end with
          no padding, for data you own. An explicit <C>@ offset</C> still wins either way.
        </P>
        <Code code={`struct SaveHeader @ 0x100 packed {\n    version : u8    // 0x0\n    flags   : u8    // 0x1\n    score   : i32   // 0x2, not padded to 0x4\n}`} />

        <H id="funcs">Functions</H>
        <P>
          <C>func</C> (or <C>sub</C>) declares a function. Header params bind register names with the same grammar as struct fields,{" "}
          <C>name : Type @ register</C>. So the params double as the function&apos;s contract, and <C>player.field</C> resolves in
          the body. Params can also be written as <C>param</C> lines at the top of the function.
        </P>
        <Code code={`func applyDamage: player: Player @ r3, amount: i32 @ r4\n    lfs   f1, player.health\n    fsubs f1, f1, f2\n.clamp:\n    fcmpu cr0, f1, f2\n    bge   .store\n.store:\n    stfs  f1, player.health\n    blr`} />
        <P>
          A leading dot marks a <strong>local label</strong> (<C>.clamp</C>, <C>.store</C>), scoped to its function, so you can
          reuse <C>.loop</C> in every func. <C>global name: Type @ rX</C> binds a name visible in every function.
        </P>
        <Code code={`global save: SaveData @ r31\n\nfunc a:\n    lwz r3, save.gold\n    blr`} />

        <H id="imports">Imports</H>
        <P>
          <C>import</C> pulls another saved file&apos;s exports (struct types, register aliases, and function addresses) into the
          current one. It&apos;s transitive, and it never copies code bytes.
        </P>
        <Code code={`import combat\n\nbl applyDamage`} />
        <P>
          A file is referenced by its name, not its folder, so <C>import combat</C> works wherever <C>combat</C> sits in the Files
          rail. Start typing after <C>import</C> and your saved files autocomplete.
        </P>

        <H id="traps">Debugging with traps</H>
        <P>
          A trap halts the CPU where it fires, so you can drop one into game code and read the register state when it
          hits (in the RPCS3 debugger, or a crash log). <C>trap</C> (or a bare <C>tw</C>) is unconditional. To fire only
          on a condition, compare two registers with <C>tweq</C> / <C>twne</C> / <C>twlt</C> / <C>twgt</C> / <C>twle</C> /{" "}
          <C>twge</C>, or a register against a constant with the <C>…i</C> forms.
        </P>
        <Code code={`trap                 // stop here, always\ntweq  r3, r4         // stop if r3 == r4\ntweqi r0, 10         // stop if r0 == 10`} />
        <P>
          The reference lists every form. The raw <C>tw TO, rA, rB</C> takes a 5-bit condition mask (16 lt, 8 gt, 4 eq, 2
          ltu, 1 gtu, added together) for a combination the aliases don&apos;t cover.
        </P>

        <H id="disasm">Disassembler</H>
        <P>
          Open <C>Disassemble hex</C> in the Tools list. Paste big-endian words almost any way (plain, <C>0x</C>/<C>\\x</C>/<C>$</C>{" "}
          prefixes, byte streams, objdump or hexdump output, memory dumps with addresses) and it strips the noise. Set a base
          address to get PC-relative branches right, then <C>Promote to file</C> to drop the result into the editor.
        </P>
      </div>
    </div>
  );
}

// language keywords that read as structure, kept together and ahead of the
// plain assembler directives
const LANGUAGE = new Set(["struct", "func", "sub", "param", "global", "import", "loadstruct"]);
const LANG_ORDER = ["struct", "func", "sub", "param", "global", "import", "loadstruct"];
const DIR_ORDER = ["address", "hook", "set", "unset", "clearset", "hexcode", "float", "string"];
const SYSTEM_OPS = new Set(["sc", "sync", "lwsync", "eieio", "isync", "icbi", "dcbz", "dcbf", "dcbst", "dcbt", "dcbtst"]);

// bucket a mnemonic into a browsing category. instructions get a rough
// functional group from the mnemonic name, keywords split language vs directive.
function categoryOf(m: { name: string; kind: string }): string {
  if (m.kind === "pseudo") return "Pseudo-instructions";
  if (m.kind === "directive") return LANGUAGE.has(m.name) ? "Language" : "Directives";
  const n = m.name.toLowerCase();
  if (/^(trap|tw)/.test(n)) return "Trap";
  if (/^(cmp|fcmp)/.test(n)) return "Compare";
  if (/^b/.test(n)) return "Branch";
  if (SYSTEM_OPS.has(n)) return "System & sync";
  if (/^(v|lv|stv)/.test(n) || n === "mfvscr" || n === "mtvscr") return "Vector";
  if (/^(mt|mf)/.test(n)) return "Move special";
  if (/^f/.test(n)) return "Floating point";
  if (/^l/.test(n)) return "Load";
  if (/^st/.test(n)) return "Store";
  if (/^(sl|sr|rl|clr)/.test(n)) return "Shift & rotate";
  if (/^cr/.test(n)) return "Logical"; // crand/cror/crxor... cr-bit logicals
  if (/^(and|x?or|nor|nand|eqv|orc|andc|exts|cntlz)/.test(n)) return "Logical";
  return "Arithmetic";
}

const CATEGORY_ORDER = [
  "Language",
  "Directives",
  "Arithmetic",
  "Logical",
  "Compare",
  "Shift & rotate",
  "Load",
  "Store",
  "Branch",
  "Floating point",
  "Vector",
  "Move special",
  "Trap",
  "System & sync",
  "Pseudo-instructions",
];

// within a category, the language/directive groups keep a curated order, the
// instruction groups fall back to alphabetical
function orderIndex(name: string, cat: string): number {
  if (cat === "Language") return LANG_ORDER.indexOf(name);
  if (cat === "Directives") return DIR_ORDER.indexOf(name);
  return -1;
}

function Reference() {
  const [query, setQuery] = useState("");

  const { sections, total } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? MNEMONIC_DOCS.filter(
          (m) => m.name.toLowerCase().includes(q) || m.title.toLowerCase().includes(q) || m.help.toLowerCase().includes(q)
        )
      : MNEMONIC_DOCS;
    const buckets = new Map<string, typeof list>();
    for (const m of list) {
      const cat = categoryOf(m);
      const arr = buckets.get(cat) ?? [];
      arr.push(m);
      buckets.set(cat, arr);
    }
    const sections = CATEGORY_ORDER.filter((cat) => buckets.has(cat)).map((cat) => ({
      cat,
      items: buckets.get(cat)!.slice().sort((a, b) => {
        const ia = orderIndex(a.name, cat);
        const ib = orderIndex(b.name, cat);
        if (ia !== -1 || ib !== -1) return ia - ib;
        return a.name.localeCompare(b.name);
      }),
    }));
    return { sections, total: list.length };
  }, [query]);

  return (
    <div className="max-w-5xl">
      <div className="mb-5 flex items-center gap-2 text-accent">
        <Library size={16} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.09em]">Reference</span>
      </div>
      <div className="sticky top-[52px] z-10 -mx-1 mb-4 bg-base-bg/95 px-1 py-2 backdrop-blur">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-input-bg px-3 py-2">
          <Search size={15} className="shrink-0 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search mnemonics, pseudos, directives..."
            spellCheck={false}
            autoFocus
            className="w-full bg-transparent font-mono text-[13px] text-text-primary outline-none placeholder:text-text-muted"
          />
          <span className="shrink-0 text-[11px] text-text-muted">{total}</span>
        </div>
      </div>

      {sections.map(({ cat, items }) => (
          <div key={cat} className="mb-8">
            <h3 className="mb-3 flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-text-muted">
              {cat}
              <span className="text-[10px] font-normal tracking-normal text-text-muted/60">{items.length}</span>
            </h3>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {items.map((m) => (
                <div key={`${cat}-${m.name}`} className="rounded-lg border border-border bg-card-bg p-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono text-[13.5px] font-semibold text-[#79c0ff]">{m.name}</span>
                    {m.signature && <span className="font-mono text-[12px] text-text-muted">{m.signature}</span>}
                    {m.title && m.title.toLowerCase() !== m.name.toLowerCase() && (
                      <span className="ml-auto text-[11px] text-text-muted">{m.title}</span>
                    )}
                  </div>
                  {m.help && (
                    <pre className="mt-1.5 whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-text-secondary">
                      {m.help.trim()}
                    </pre>
                  )}
                  {m.example && (
                    <pre className="mt-2 overflow-x-auto rounded border border-border bg-[#0d1117] px-3 py-2 font-mono text-[12px] leading-[1.6]">
                      {m.example.split("\n").map((ln, k) => {
                        const spans = tokenizeAsmLine(ln);
                        return (
                          <div key={k}>
                            {spans.length ? spans.map((s, j) => (
                              <span key={j} style={{ color: s.color }}>
                                {s.text}
                              </span>
                            )) : " "}
                          </div>
                        );
                      })}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
      ))}
      {total === 0 && <p className="text-[13px] text-text-muted">no matches for &ldquo;{query}&rdquo;.</p>}
    </div>
  );
}

const KEYBINDS: { group: string; icon: React.ComponentType<{ size?: number; className?: string }>; items: [string[], string][] }[] = [
  {
    group: "Actions",
    icon: Zap,
    items: [
      [["Ctrl", "Enter"], "Assemble"],
      [["Ctrl", "S"], "Save the current file"],
      [["Ctrl", "Shift", "S"], "Save as a new file"],
    ],
  },
  {
    group: "Editing",
    icon: Pencil,
    items: [
      [["Ctrl", "/"], "Toggle a comment on the line"],
      [["Tab"], "Indent, or accept an autocomplete"],
      [["Shift", "Tab"], "Unindent"],
      [["Ctrl", "Space"], "Open autocomplete"],
      [["Ctrl", "Z"], "Undo"],
      [["Ctrl", "Shift", "Z"], "Redo"],
      [["Ctrl", "F"], "Find in the file"],
      [["Ctrl", "Click"], "Jump to a label definition"],
      [["Alt", "↑ ↓"], "Move the line up or down"],
      [["Shift", "Alt", "↑ ↓"], "Duplicate the line"],
      [["Ctrl", "Alt", "↑ ↓"], "Add a cursor above or below"],
      [["Ctrl", "Shift", "K"], "Delete the line"],
      [["Ctrl", "D"], "Select the next occurrence of the selection"],
      [["Ctrl", "Shift", "L"], "Select every match of the selection"],
    ],
  },
  {
    group: "Navigation",
    icon: Compass,
    items: [
      [["Ctrl", "G"], "Find next (Shift for previous)"],
      [["Ctrl", "Alt", "G"], "Go to a line"],
    ],
  },
  {
    group: "Tabs",
    icon: Files,
    items: [
      [["Ctrl", "Alt", "N"], "New tab"],
      [["Ctrl", "Alt", "W"], "Close the current tab"],
      [["Ctrl", "1-9"], "Jump to a tab (9 is the last)"],
      [["Ctrl", "Tab"], "Cycle tabs (Shift to go back)"],
      [["Ctrl", "PgUp", "PgDn"], "Previous or next tab"],
    ],
  },
];

// a physical-looking key cap
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-[22px] min-w-[24px] items-center justify-center rounded-[6px] border border-border border-b-[2px] border-b-[#0a0e15] bg-input-bg px-1.5 font-mono text-[11px] font-semibold text-text-primary shadow-[0_1px_0_rgba(0,0,0,0.4)]">
      {children}
    </kbd>
  );
}

function Keybinds() {
  return (
    <div className="max-w-2xl">
      <div className="mb-5 flex items-center gap-2 text-accent">
        <Keyboard size={16} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.09em]">Keyboard shortcuts</span>
      </div>
      <P>These work anywhere in the editor. On macOS, use ⌘ in place of Ctrl.</P>

      <div className="mt-6 grid gap-4">
        {KEYBINDS.map(({ group, icon: Icon, items }) => (
          <div key={group} className="overflow-hidden rounded-xl border border-border bg-card-bg/40">
            <div className="flex items-center gap-2 border-b border-border bg-white/[0.02] px-4 py-2.5">
              <Icon size={13} className="text-accent" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-text-secondary">{group}</span>
            </div>
            <div>
              {items.map(([keys, desc], i) => (
                <div
                  key={desc}
                  className={`flex items-center justify-between gap-4 px-4 py-2.5 ${i > 0 ? "border-t border-border/50" : ""}`}
                >
                  <span className="text-[13px] text-text-secondary">{desc}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {keys.map((k, j) => (
                      <span key={j} className="flex items-center gap-1">
                        {j > 0 && <span className="text-[10px] text-text-muted">+</span>}
                        <Kbd>{k}</Kbd>
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function About() {
  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center gap-2 text-[#ff6b81]">
        <Heart size={16} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.09em]">Credits</span>
      </div>

      <H>Inspired by CodeWizardPS3</H>
      <P>
        <strong>CodeWizardPS3</strong>{" "}
        was the original PS3 PPU PowerPC assembler. It&apos;s over a decade old, and it&apos;s how a lot of us first learned to
        write and patch Cell code. PS3 PPU Lab does the same job in the browser.
      </P>
      <P>
        <a href={CODEWIZARD_REPO} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          The original CodeWizard →
        </a>
      </P>

      <H>Built by Mack</H>
      <P>
        I rebuilt it as a web app, keeping what CodeWizard could do and moving it into the browser.
      </P>
      <P>
        <a href={PORTFOLIO} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          Portfolio →
        </a>
        <span className="mx-2 text-text-muted">·</span>
        <a href={REPO} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          Source on GitHub →
        </a>
      </P>
    </div>
  );
}

// plain monospace block for shell / json, no asm coloring, with a copy button
function Pre({ children }: { children: React.ReactNode }) {
  const text = typeof children === "string" ? children : String(children);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  };
  return (
    <div className="relative my-3">
      <pre className="overflow-x-auto whitespace-pre rounded-lg border border-border bg-[#0d1117] p-4 pr-12 font-mono text-[12.5px] leading-[1.6] text-text-secondary">
        {children}
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy to clipboard"}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card-bg/80 text-text-muted transition-colors hover:border-border-hover hover:text-text-secondary"
      >
        {copied ? <Check size={13} className="text-[#7ee787]" /> : <Copy size={13} />}
      </button>
    </div>
  );
}

// one endpoint card: METHOD + path header, then its body
function Endpoint({ method, path, children }: { method: string; path: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card-bg/40">
      <div className="flex items-center gap-2.5 border-b border-border bg-white/[0.02] px-4 py-2.5">
        <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-accent">{method}</span>
        <span className="font-mono text-[13px] text-text-primary">{path}</span>
      </div>
      <div className="px-4 py-1">{children}</div>
    </div>
  );
}

function Api() {
  return (
    <div className="max-w-2xl">
      <div className="mb-5 flex items-center gap-2 text-accent">
        <Terminal size={16} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.09em]">HTTP API</span>
      </div>

      <P>
        Two open endpoints wrap the raw assembler and disassembler. They take JSON, return JSON, and need no key. Call them
        from a script, a tool, or a Discord bot.
      </P>
      <P>
        They are the <em>primitives</em>. The higher-level syntax the editor understands (<C>func</C>, <C>struct</C>,{" "}
        <C>global</C>, <C>set</C> aliases, and <C>import</C>) is preprocessing the web app runs <em>before</em> it calls
        the API, so the endpoints only accept core mnemonics and directives (<C>address</C>, <C>hook</C>, <C>hexcode</C>,{" "}
        <C>float</C>, <C>string</C>). Build your own sugar on top, the same way the client does.
      </P>

      <H id="api-assemble">Assemble</H>
      <P>Turns assembly source into hex words. <C>out</C> is the words joined by newlines.</P>
      <Endpoint method="POST" path="/api/assemble">
        <P>Request body:</P>
        <Pre>{`{ "asm": "li r3, 1\\nblr" }`}</Pre>
        <P>Response:</P>
        <Pre>{`{ "ok": true, "out": "38600001\\n4e800020" }`}</Pre>
      </Endpoint>
      <P>&nbsp;</P>
      <Pre>{`curl -X POST https://ppulab.dev/api/assemble \\
  -H 'content-type: application/json' \\
  -d '{"asm": "li r3, 1\\nblr"}'`}</Pre>

      <H id="api-disassemble">Disassemble</H>
      <P>
        Turns hex into assembly. <C>baseAddress</C> is optional. Give it and branch targets resolve to labels against
        that base.
      </P>
      <Endpoint method="POST" path="/api/disassemble">
        <P>Request body:</P>
        <Pre>{`{ "hex": "38600001", "baseAddress": 0 }`}</Pre>
        <P>Response:</P>
        <Pre>{`{ "ok": true, "out": "li r3, 0x1" }`}</Pre>
      </Endpoint>
      <P>&nbsp;</P>
      <Pre>{`curl -X POST https://ppulab.dev/api/disassemble \\
  -H 'content-type: application/json' \\
  -d '{"hex": "38600001"}'`}</Pre>

      <H id="api-errors">Errors</H>
      <P>
        A failed request returns <C>{'{ ok: false }'}</C> with a status of 400 (bad input), 413 (too large), or 429 (rate
        limited). Assemble errors carry the line, column, and length of the offending token, and an <C>errors</C> array when
        more than one line is bad.
      </P>
      <Pre>{`{
  "ok": false,
  "error": {
    "message": "Unknown mnemonic: foo",
    "line": 2,
    "col": 1,
    "length": 3,
    "errors": [ /* every bad line, when there is more than one */ ]
  }
}`}</Pre>

      <H id="api-limits">Limits</H>
      <div className="mt-4 grid gap-4">
        <div className="overflow-hidden rounded-xl border border-border bg-card-bg/40">
          {[
            ["Rate limit", "100 requests per minute per IP. Over that returns 429 with a Retry-After header."],
            ["Body size", "256 KB per request. Larger returns 413."],
            ["CORS", "Open to any origin, so it works straight from a browser or fetch."],
            ["Auth", "None. The endpoints are anonymous and free to use."],
          ].map(([k, v], i) => (
            <div key={k} className={`flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4 ${i > 0 ? "border-t border-border/50" : ""}`}>
              <span className="shrink-0 text-[12px] font-semibold uppercase tracking-[0.06em] text-text-secondary sm:w-28">{k}</span>
              <span className="text-[13px] leading-relaxed text-text-secondary">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const PLANNED: { icon: React.ComponentType<{ size?: number; className?: string }>; title: string; status: string; body: string }[] = [
  {
    icon: Files,
    title: "ELF patching",
    status: "Groundwork done",
    body: "Load a game ELF, patch instructions in it, and save it back out. The offset math and the assembler are already done, so this one is mostly a UI job.",
  },
  {
    icon: Terminal,
    title: "Syscall reference",
    status: "Groundwork done",
    body: "A lookup for the lv2 syscall numbers, so you can call the kernel from a patch with li r11, N then sc. The table and the call convention are already mapped out.",
  },
  {
    icon: Search,
    title: "Cross-references",
    status: "Undecided",
    body: "Click a func, struct, or global to jump to where it is defined, or see everywhere it is used across files. Still figuring out if it earns its keep.",
  },
];

function Planned() {
  return (
    <div className="max-w-2xl">
      <div className="mb-5 flex items-center gap-2 text-accent">
        <Compass size={16} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.09em]">Roadmap</span>
      </div>
      <P>Stuff I want to add. Roughly ordered by how far along each one is.</P>

      <div className="mt-6 grid gap-4">
        {PLANNED.map(({ icon: Icon, title, status, body }) => (
          <div key={title} className="overflow-hidden rounded-xl border border-border bg-card-bg/40">
            <div className="flex items-center gap-2 border-b border-border bg-white/[0.02] px-4 py-2.5">
              <Icon size={13} className="text-accent" />
              <span className="text-[13px] font-semibold text-text-primary">{title}</span>
              <span
                className={`ml-auto rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                  status === "Groundwork done" ? "bg-accent/15 text-accent" : "bg-white/[0.05] text-text-muted"
                }`}
              >
                {status}
              </span>
            </div>
            <div className="px-4 py-3 text-[13px] leading-[1.6] text-text-secondary">{body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TABS: [TabKey, string, React.ComponentType<{ size?: number }>][] = [
  ["guide", "Guide", BookOpen],
  ["reference", "Mnemonics", Library],
  ["keybinds", "Keybinds", Keyboard],
  ["api", "API", Terminal],
  ["planned", "Planned", Compass],
  ["about", "About", Heart],
];

export default function DocsView() {
  const [tab, setTab] = useState<TabKey>("guide");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [slide, setSlide] = useState(false);
  const activeIndex = TABS.findIndex(([k]) => k === tab);

  // track the active tab's position so the underline can glide to it. skip the
  // transition on the first placement so it doesn't slide in from the corner.
  useEffect(() => {
    const measure = () => {
      const el = tabRefs.current[activeIndex];
      if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    const id = requestAnimationFrame(() => setSlide(true));
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", measure);
    };
  }, [activeIndex]);

  return (
    <div className="flex min-h-screen flex-col bg-base-bg text-text-primary">
      <header className="sticky top-0 z-30 flex h-[52px] shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <Link href="/" className="flex items-center gap-1.5 rounded px-2 py-1 text-[13px] text-text-secondary hover:bg-white/[0.04] hover:text-text-primary">
          <ArrowLeft size={15} /> Editor
        </Link>
        <div className="mx-1 h-4 w-px bg-border" />
        <Cpu size={16} className="text-accent" />
        <span className="font-bold tracking-tight">PS3 PPU Lab</span>
        <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent">Docs</span>
      </header>

      <div className="border-b border-border bg-base-bg">
        <nav className="relative mx-auto flex w-full max-w-5xl gap-1 px-5">
          {TABS.map(([key, label, Icon], i) => (
            <button
              key={key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-3 text-[14px] font-semibold transition-colors duration-200 ${
                tab === key ? "text-text-primary" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
          <span
            aria-hidden
            className={`pointer-events-none absolute -bottom-px h-0.5 rounded-full bg-accent ${
              slide ? "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]" : ""
            }`}
            style={{ left: indicator.left, width: indicator.width }}
          />
        </nav>
      </div>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
        {/* key on tab so the content remounts and the fade-in replays each switch */}
        <div key={tab} className="animate-tab-in">
          {tab === "guide" && <Guide />}
          {tab === "reference" && <Reference />}
          {tab === "keybinds" && <Keybinds />}
          {tab === "api" && <Api />}
          {tab === "planned" && <Planned />}
          {tab === "about" && <About />}
        </div>
      </main>
    </div>
  );
}
