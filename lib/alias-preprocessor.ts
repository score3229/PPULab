function findCommentIndex(line: string): number {
  const idxs: number[] = [];
  const a = line.indexOf("//");
  if (a >= 0) idxs.push(a);
  const b = line.indexOf("#");
  if (b >= 0) idxs.push(b);
  const c = line.indexOf(";");
  if (c >= 0) idxs.push(c);
  return idxs.length ? Math.min(...idxs) : -1;
}

function parseSetLine(
  code: string
): { kind: string; a?: string; b?: string } | null {
  const m = code.match(/^\s*(set|unset|clearset)\b(.*)$/i);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const rest = (m[2] || "").trim();

  if (kind === "clearset") return { kind };
  if (kind === "unset") {
    const name = rest.replace(/^[,\s]+|[,\s]+$/g, "").trim();
    if (!name) return null;
    return { kind, a: name };
  }

  const parts = rest
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length !== 2) return null;
  return { kind, a: parts[0], b: parts[1] };
}

function isGpr(tok: string): boolean {
  return /^r([0-9]|[12][0-9]|3[01])$/i.test(tok);
}

function isValidAliasName(tok: string): boolean {
  if (!/^[A-Za-z_.$][\w.$]*$/.test(tok)) return false;
  if (isGpr(tok)) return false;
  return true;
}

export interface AliasError {
  line: number;
  col: number;
  token: string;
  message: string;
}

export interface AliasValidationResult {
  ok: boolean;
  line?: number;
  token?: string;
  message?: string;
  errors?: AliasError[];
}

export interface AliasSeed {
  name: string;
  reg: string;
}

export function validateAliasUsage(fullText: string, seed?: AliasSeed[]): AliasValidationResult {
  const lines = String(fullText || "").split("\n");
  const active = new Map<string, string>();
  const everDefined = new Set<string>();

  // aliases imported from other files start out defined and active
  if (seed) {
    for (const s of seed) {
      if (isValidAliasName(s.name)) {
        active.set(s.name, s.reg.toLowerCase());
        everDefined.add(s.name);
      }
    }
  }

  const errors: AliasError[] = [];
  const flagged = new Set<string>(); // dedupe repeated uses of the same alias

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineNo = lineIdx + 1;
    const line = lines[lineIdx];
    const ci = findCommentIndex(line);
    const codePart = ci >= 0 ? line.slice(0, ci) : line;
    const codeTrim = codePart.trim();
    if (!codeTrim) continue;

    const info = parseSetLine(codeTrim);
    if (info) {
      if (info.kind === "clearset") {
        active.clear();
      } else if (info.kind === "unset") {
        active.delete(info.a!);
      } else if (info.kind === "set") {
        const left = info.a!;
        const right = info.b!;
        if (isGpr(left) && isValidAliasName(right)) {
          active.set(right, left.toLowerCase());
          everDefined.add(right);
        } else if (isValidAliasName(left) && isGpr(right)) {
          active.set(left, right.toLowerCase());
          everDefined.add(left);
        }
      }
      continue;
    }

    const tokens = codePart.split(/(\s+|,|\(|\)|\[|\]|\+|-)/);
    for (const t of tokens) {
      if (!t || /^\s+$/.test(t)) continue;
      if (everDefined.has(t) && !active.has(t)) {
        const key = `${lineNo}:${t}`;
        if (flagged.has(key)) continue;
        flagged.add(key);
        const col = codePart.indexOf(t);
        errors.push({ line: lineNo, col: col >= 0 ? col : 0, token: t, message: `Alias '${t}' is not defined here (was unset earlier).` });
      }
    }
  }

  if (errors.length) {
    return { ok: false, line: errors[0].line, token: errors[0].token, message: errors[0].message, errors };
  }
  return { ok: true };
}

export function preprocessAsmWithAliases(fullText: string, seed?: AliasSeed[]): string {
  const lines = String(fullText || "").split("\n");
  const map = new Map<string, string>();

  // seed imported aliases so they expand from the first line
  if (seed) {
    for (const s of seed) {
      if (isValidAliasName(s.name)) map.set(s.name, s.reg.toLowerCase());
    }
  }

  const out = lines.map((line) => {
    const ci = findCommentIndex(line);
    const codePart = ci >= 0 ? line.slice(0, ci) : line;
    const commentPart = ci >= 0 ? line.slice(ci) : "";
    const codeTrim = codePart.trim();
    const info = parseSetLine(codeTrim);

    if (info) {
      if (info.kind === "clearset") {
        map.clear();
      } else if (info.kind === "unset") {
        map.delete(info.a!);
      } else if (info.kind === "set") {
        const left = info.a!;
        const right = info.b!;
        if (isGpr(left) && isValidAliasName(right)) {
          map.set(right, left.toLowerCase());
        } else if (isValidAliasName(left) && isGpr(right)) {
          map.set(left, right.toLowerCase());
        }
      }
      return `# ${codeTrim}${commentPart ? " " + commentPart : ""}`;
    }

    const tokens = codePart.split(/(\s+|,|\(|\)|\[|\]|\+|-)/);
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (!t || /^\s+$/.test(t)) continue;
      if (map.has(t)) tokens[i] = map.get(t)!;
    }

    return tokens.join("") + commentPart;
  });

  return out.join("\n");
}
