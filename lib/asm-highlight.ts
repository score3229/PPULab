// ppu asm syntax colors, shared by the editor and the graph so they match.

export const ASM_COLORS = {
  keyword: "#79c0ff", // mnemonic / directive (first token)
  variableName: "#ffa657", // r0-r31, cr0-cr7
  atom: "#d2a8ff", // f0-f31 float regs
  typeName: "#56d4dd", // v0-v31 vector regs
  number: "#7ee787",
  labelName: "#9db2c4",
  funcName: "#e3b341", // func / sub name (prominent, like a symbol)
  localLabel: "#6e7681", // .dotted local labels (muted, recede)
  name: "#9db2c4", // other identifiers (lr, ctr, labels used as operands)
  comment: "#5f8f6b",
  punctuation: "#c9d1d9",
  operator: "#c9d1d9",
  default: "#c9d1d9",
} as const;

export interface AsmSpan {
  text: string;
  color: string;
}

// tokenize one line into colored spans. mirrors Editor.tsx's stream tokenizer
// so the graph colors text the same as the editor.
export function tokenizeAsmLine(line: string): AsmSpan[] {
  const spans: AsmSpan[] = [];
  const push = (text: string, color: string) => {
    if (text) spans.push({ text, color });
  };

  let i = 0;
  let sawMnemonic = false;
  const n = line.length;

  // start-of-line label declaration (does not count as the mnemonic)
  const label = /^(\s*[A-Za-z_.$][\w.$]*:)/.exec(line);
  if (label) {
    push(label[1], ASM_COLORS.labelName);
    i = label[1].length;
  }

  while (i < n) {
    const rest = line.slice(i);
    let m: RegExpExecArray | null;

    if ((m = /^\s+/.exec(rest))) {
      push(m[0], ASM_COLORS.default);
      i += m[0].length;
      continue;
    }
    if (rest[0] === "#" || rest[0] === ";" || rest.startsWith("//")) {
      push(line.slice(i), ASM_COLORS.comment);
      break;
    }
    if (!sawMnemonic && (m = /^(address|hook|set|unset|clearset)\b/i.exec(rest))) {
      push(m[0], ASM_COLORS.keyword);
      sawMnemonic = true;
      i += m[0].length;
      continue;
    }
    if ((m = /^f([0-9]|[12][0-9]|3[01])\b/i.exec(rest))) {
      push(m[0], ASM_COLORS.atom);
      i += m[0].length;
      continue;
    }
    if ((m = /^v([0-9]|[12][0-9]|3[01])\b/i.exec(rest))) {
      push(m[0], ASM_COLORS.typeName);
      i += m[0].length;
      continue;
    }
    if ((m = /^r([0-9]|[12][0-9]|3[01])\b/i.exec(rest))) {
      push(m[0], ASM_COLORS.variableName);
      i += m[0].length;
      continue;
    }
    if ((m = /^cr([0-7])\b/i.exec(rest))) {
      push(m[0], ASM_COLORS.variableName);
      i += m[0].length;
      continue;
    }
    if ((m = /^[+-]?(?:0x[0-9A-Fa-f]+|\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\b/.exec(rest))) {
      push(m[0], ASM_COLORS.number);
      i += m[0].length;
      continue;
    }
    if ((m = /^(==|!=|<=|>=|<<|>>|\+=|-=|\*=|\/=|[+\-*/&|^~])/.exec(rest))) {
      push(m[0], ASM_COLORS.operator);
      i += m[0].length;
      continue;
    }
    if ((m = /^[[\](),:]/.exec(rest))) {
      push(m[0], ASM_COLORS.punctuation);
      i += m[0].length;
      continue;
    }
    if ((m = /^[A-Za-z_.][A-Za-z0-9_.]*/.exec(rest))) {
      if (!sawMnemonic) {
        push(m[0], ASM_COLORS.keyword);
        sawMnemonic = true;
      } else {
        push(m[0], ASM_COLORS.name);
      }
      i += m[0].length;
      continue;
    }
    push(line[i], ASM_COLORS.default);
    i += 1;
  }

  return spans;
}
