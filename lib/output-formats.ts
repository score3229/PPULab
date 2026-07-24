export type OutputFormat =
  | "hex_lines"
  | "bytes_spaced"
  | "bytes_stream"
  | "cs_byte_array"
  | "cs_uint_array"
  | "c_uint_array"
  | "rpcs3_patch"
  | "netcheat_ps3";

export const OUTPUT_FORMATS: { value: OutputFormat; label: string }[] = [
  { value: "hex_lines", label: "Hex (lines)" },
  { value: "bytes_spaced", label: "Bytes (spaced)" },
  { value: "bytes_stream", label: "Bytes (stream)" },
  { value: "cs_byte_array", label: "C# byte[]" },
  { value: "cs_uint_array", label: "C# uint[]" },
  { value: "c_uint_array", label: "C/C++ uint32_t[]" },
  { value: "rpcs3_patch", label: "RPCS3 patch.yml (be32)" },
  { value: "netcheat_ps3", label: "NetCheat PS3" },
];

function toHex8(v: number): string {
  return "0x" + (v >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

function byteToHex(b: number): string {
  return (b & 0xff).toString(16).toUpperCase().padStart(2, "0");
}

function wordsToBytesBE(words: number[]): number[] {
  const bytes: number[] = [];
  for (const w of words) {
    bytes.push((w >>> 24) & 0xff);
    bytes.push((w >>> 16) & 0xff);
    bytes.push((w >>> 8) & 0xff);
    bytes.push(w & 0xff);
  }
  return bytes;
}

function parseWordsFromText(text: string): number[] {
  const words: number[] = [];
  for (const line of String(text || "").split("\n")) {
    const s = line.trim();
    if (!s) continue;
    const m = s.match(/^(?:0x)?([0-9A-Fa-f]{1,8})$/);
    if (!m) continue;
    words.push(parseInt(m[1], 16) >>> 0);
  }
  return words;
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

function isLabelOnly(line: string): boolean {
  return /^\s*[A-Za-z_.$][\w.$]*:\s*$/.test(line);
}

function parseAddressValue(s: string): number | null {
  const t = s.trim();
  if (/^0x[0-9a-fA-F]+$/.test(t)) return parseInt(t, 16) >>> 0;
  if (/^\d+$/.test(t)) return parseInt(t, 10) >>> 0;
  return null;
}

function getEmittedWordCountForLine(line: string): number {
  const parts = line.trim().split(/\s+/);
  const op = (parts[0] || "").toLowerCase();
  if (op === "load32") return 2;
  if (op === "call" || op === "jmp") return 4;
  return 1;
}

interface Block {
  addr: number | null;
  words: number[];
  kind?: string;
  name?: string; // func / struct / label the block came from
}

function mapWordsToBlocks(asmText: string, words: number[]): Block[] {
  const lines = String(asmText || "").split("\n");
  let curAddr: number | null = null;
  let wi = 0;
  const blocks: Block[] = [];
  let block: Block | null = null;
  let expectedNext: number | null = null;
  let pendingName: string | undefined; // label / data marker for the next block

  for (const rawLine of lines) {
    // struct data blocks are tagged with a `# data: Name` marker
    const dataM = rawLine.match(/^\s*#\s*data:\s*([A-Za-z_]\w*)/i);
    if (dataM) {
      pendingName = dataM[1];
      continue;
    }
    const noComment = stripLineComment(rawLine);
    const line = noComment.trim();
    if (!line) continue;
    if (isLabelOnly(line)) {
      const nm = line.replace(/:.*$/, "").trim();
      if (!/^__loc\d+__$/.test(nm)) pendingName = nm; // skip internal local labels
      continue;
    }

    const mAddr = line.match(/^\s*address\s+(.+)\s*$/i);
    if (mAddr) {
      const v = parseAddressValue(mAddr[1]);
      if (v !== null) {
        curAddr = v >>> 0;
        block = null;
        expectedNext = null;
      }
      continue;
    }

    const mHook = line.match(/^\s*hook\s+(.+)\s*$/i);
    if (mHook) {
      const v = parseAddressValue(mHook[1]);
      if (v !== null) {
        curAddr = v >>> 0;
        block = null;
        expectedNext = null;
      }
      if (wi >= words.length) break;
      if (curAddr === null) {
        blocks.push({ addr: null, words: [words[wi++] >>> 0], name: pendingName });
        pendingName = undefined;
        continue;
      }
      block = { addr: curAddr >>> 0, words: [], kind: "hook", name: pendingName };
      pendingName = undefined;
      blocks.push(block);
      block.words.push(words[wi++] >>> 0);
      curAddr = (curAddr + 4) >>> 0;
      block = null;
      expectedNext = null;
      continue;
    }

    if (wi >= words.length) break;
    const n = getEmittedWordCountForLine(line);
    const take = Math.min(n, words.length - wi);

    if (curAddr === null) {
      const arr: number[] = [];
      for (let i = 0; i < take; i++) arr.push(words[wi++] >>> 0);
      blocks.push({ addr: null, words: arr, name: pendingName });
      pendingName = undefined;
      continue;
    }

    if (!block || expectedNext === null || curAddr !== expectedNext) {
      block = { addr: curAddr >>> 0, words: [], kind: "code", name: pendingName };
      pendingName = undefined;
      blocks.push(block);
    }
    for (let i = 0; i < take; i++) {
      block.words.push(words[wi++] >>> 0);
      curAddr = (curAddr + 4) >>> 0;
    }
    expectedNext = curAddr;
  }
  return blocks;
}

interface MappedWord {
  addr: number | null;
  word: number;
}

function mapWordsToAddresses(
  asmText: string,
  words: number[]
): MappedWord[] {
  const lines = String(asmText || "").split("\n");
  let curAddr: number | null = null;
  let wi = 0;
  const mapped: MappedWord[] = [];

  for (const rawLine of lines) {
    const noComment = stripLineComment(rawLine);
    const line = noComment.trim();
    if (!line) continue;
    if (isLabelOnly(line)) continue;

    const mAddr = line.match(/^\s*address\s+(.+)\s*$/i);
    if (mAddr) {
      const v = parseAddressValue(mAddr[1]);
      if (v !== null) curAddr = v >>> 0;
      continue;
    }

    const mHook = line.match(/^\s*hook\s+(.+)\s*$/i);
    if (mHook) {
      const v = parseAddressValue(mHook[1]);
      if (v !== null) curAddr = v >>> 0;
      if (wi >= words.length) break;
      if (curAddr === null) {
        mapped.push({ addr: null, word: words[wi++] >>> 0 });
      } else {
        mapped.push({ addr: curAddr >>> 0, word: words[wi++] >>> 0 });
        curAddr = (curAddr + 4) >>> 0;
      }
      continue;
    }

    if (wi >= words.length) break;
    const n = getEmittedWordCountForLine(line);
    const take = Math.min(n, words.length - wi);

    if (curAddr === null) {
      for (let i = 0; i < take; i++)
        mapped.push({ addr: null, word: words[wi++] >>> 0 });
    } else {
      for (let i = 0; i < take; i++) {
        mapped.push({ addr: curAddr >>> 0, word: words[wi++] >>> 0 });
        curAddr = (curAddr + 4) >>> 0;
      }
    }
  }
  return mapped;
}

function blockVarName(block: Block): string {
  if (block.name) return block.name; // func / struct / label name
  if (block.addr == null) return "code";
  const a = toHex8(block.addr).slice(2).toUpperCase();
  if (block.kind === "hook") return `hook_${a}`;
  return `code_${a}`;
}

// var name per block, with _2, _3 suffixes on any repeats
function uniqueVarNames(blocks: Block[]): string[] {
  const used = new Map<string, number>();
  return blocks.map((b) => {
    const base = blockVarName(b);
    const n = used.get(base) || 0;
    used.set(base, n + 1);
    return n === 0 ? base : `${base}_${n + 1}`;
  });
}

function normalizeBlocksForVarOutput(blocks: Block[]): Block[] {
  const out: Block[] = [];
  let nullBlock: Block | null = null;
  for (const b of blocks) {
    if (b.addr == null) {
      if (!nullBlock) {
        nullBlock = { addr: null, kind: "code", words: [] };
        out.push(nullBlock);
      }
      nullBlock.words.push(...b.words);
    } else {
      out.push(b);
    }
  }
  return out;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function formatOutput(
  rawText: string,
  fmt: OutputFormat,
  asmSource: string
): string {
  const words = parseWordsFromText(rawText);
  if (!words.length) return String(rawText || "").toUpperCase();

  if (fmt === "hex_lines") {
    const blocks = mapWordsToBlocks(asmSource, words);
    let out = "";
    for (const b of blocks) {
      if (b.addr != null) out += `# ${toHex8(b.addr)}\n`;
      for (const w of b.words) out += `${toHex8(w)}\n`;
      if (b.addr != null) out += "\n";
    }
    return out.trimEnd();
  }

  if (fmt === "bytes_spaced") {
    return wordsToBytesBE(words).map(byteToHex).join(" ");
  }

  if (fmt === "bytes_stream") {
    return wordsToBytesBE(words).map(byteToHex).join("");
  }

  if (fmt === "cs_byte_array") {
    let blocks = mapWordsToBlocks(asmSource, words);
    blocks = normalizeBlocksForVarOutput(blocks);
    const names = uniqueVarNames(blocks);
    let out = "";
    blocks.forEach((b, i) => {
      const bytes = wordsToBytesBE(b.words);
      out += `byte[] ${names[i]} = new byte[] {\n`;
      for (let j = 0; j < bytes.length; j += 16) {
        const line = bytes
          .slice(j, j + 16)
          .map((x) => "0x" + byteToHex(x))
          .join(", ");
        out += `    ${line},\n`;
      }
      out += `};\n\n`;
    });
    return out.trimEnd();
  }

  if (fmt === "cs_uint_array") {
    let blocks = mapWordsToBlocks(asmSource, words);
    blocks = normalizeBlocksForVarOutput(blocks);
    const names = uniqueVarNames(blocks);
    let out = "";
    blocks.forEach((b, i) => {
      out += `uint[] ${names[i]} = new uint[] {\n`;
      for (const w of b.words) out += `    ${toHex8(w)},\n`;
      out += `};\n\n`;
    });
    return out.trimEnd();
  }

  if (fmt === "c_uint_array") {
    let blocks = mapWordsToBlocks(asmSource, words);
    blocks = normalizeBlocksForVarOutput(blocks);
    const names = uniqueVarNames(blocks);
    let out = "";
    blocks.forEach((b, i) => {
      out += `uint32_t ${names[i]}[] = {\n`;
      for (const w of b.words) out += `    ${toHex8(w)},\n`;
      out += `};\n\n`;
    });
    return out.trimEnd();
  }

  if (fmt === "rpcs3_patch") {
    const mapped = mapWordsToAddresses(asmSource, words);
    if (mapped.some((x) => x.addr === null)) {
      return [
        "# ERROR: No address set before one or more instructions.",
        "# Add a line like:",
        "#   address 0x00A5EA30",
        "",
        "# (RPCS3 expects addresses for be32 writes)",
      ].join("\n");
    }
    const lines = mapped.map(
      (x) => "- [ be32, " + toHex8(x.addr!) + ", " + toHex8(x.word) + " ]"
    );
    return ["# RPCS3 patch.yml snippet (paste under \"Patch:\")", ...lines].join(
      "\n"
    );
  }

  if (fmt === "netcheat_ps3") {
    const blocks = mapWordsToBlocks(asmSource, words);
    if (blocks.some((b) => b.addr === null)) {
      return [
        "# ERROR: NetCheat output requires an address before instructions.",
        "# Add a line like:",
        "#   address 0x00A5EA30",
      ].join("\n");
    }
    return blocks
      .map((b) => {
        const stream = wordsToBytesBE(b.words).map(byteToHex).join("");
        return "0 " + toHex8(b.addr!).slice(2) + " " + stream;
      })
      .join("\n");
  }

  return words.map(toHex8).join("\n");
}

export function getAssembleStats(
  rawText: string,
  asmSource: string
): string {
  const words = parseWordsFromText(rawText);
  if (!words.length) return "";

  const blocks = mapWordsToBlocks(asmSource, words);
  let codeWords = 0;
  let hookWords = 0;

  for (const b of blocks) {
    if (b.kind === "hook") hookWords += b.words.length;
    else codeWords += b.words.length;
  }

  const codeBytes = codeWords * 4;
  // words, not instructions: a pseudo like load32 is one line but two words, so
  // this stays honest next to the source "N instr" count in the status bar
  let note = `Assembled: ${codeWords} ${plural(codeWords, "word", "words")} \u00b7 ${codeBytes} ${plural(codeBytes, "byte", "bytes")}`;
  if (hookWords > 0)
    note += ` \u00b7 ${hookWords} ${plural(hookWords, "hook", "hooks")}`;
  return note;
}
