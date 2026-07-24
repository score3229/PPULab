'use strict';

// func/sub headers strip to labels, register params resolve in the body, and
// dotted locals get unique per-function names. checks the result assembles to
// the same bytes as writing it by hand. runs with: npm test

const { makeAssembler } = require('../lib/ppc_assembler.js');
const { preprocessFuncs, parseFuncs, parseGlobals, validateFuncs } = require('../lib/func-preprocessor.js');
const { preprocessStructs } = require('../lib/struct-preprocessor.js');

const asm = makeAssembler();
let failed = 0;

// assemble a source, skipping blanks + comment lines
function words(src) {
  return asm.assemble(src.split('\n').filter((l) => l.trim() && !/^\s*#/.test(l)).join('\n'));
}
const hx = (w) => String(w).toLowerCase();

const STRUCT = 'struct Player @ 0x00B00000 {\n  health : f32\n  rank : u8\n}\n';

const cases = [
  {
    why: 'typed param field -> offset(reg)',
    func: STRUCT + 'func f: player: Player @ r3\n    lfs f1, player.health',
    plain: STRUCT + 'f:\n    lfs f1, 0x0(r3)',
  },
  {
    why: 'second field offset',
    func: STRUCT + 'func f: player: Player @ r3\n    stb r4, player.rank',
    plain: STRUCT + 'f:\n    stb r4, 0x4(r3)',
  },
  {
    why: 'scalar param -> bare register',
    func: STRUCT + 'func f: amount: i32 @ r4\n    add r5, r5, amount',
    plain: STRUCT + 'f:\n    add r5, r5, r4',
  },
  {
    why: 'dotted local branch, renamed + rewritten',
    func: STRUCT + 'func f: n: i32 @ r3\n.top:\n    addi r3, r3, -1\n    bne .top\n    blr',
    plain: STRUCT + 'f:\nspin:\n    addi r3, r3, -1\n    bne spin\n    blr',
  },
  {
    why: 'inline func address == address directive + label',
    func: 'func f @ 0x016C7C30: n: i32 @ r3\n    add r3, r3, n\n    blr',
    plain: 'address 0x016C7C30\nf:\n    add r3, r3, r3\n    blr',
  },
];

let passed = 0;
for (const c of cases) {
  let got, want;
  try {
    got = words(preprocessStructs(preprocessFuncs(c.func))).map(hx).join(',');
    want = words(preprocessStructs(c.plain)).map(hx).join(',');
  } catch (e) {
    console.log(`  FAIL ${c.why}: ${e.message}`);
    failed++;
    continue;
  }
  if (got === want) passed++;
  else {
    console.log(`  FAIL ${c.why}: got ${got} want ${want}`);
    failed++;
  }
}
console.log(`func resolution:      ${passed}/${cases.length} passed`);

// dotted locals are scoped per function: `.loop` in two funcs -> two names
{
  const out = preprocessFuncs(
    'func a: x: i32 @ r3\n.loop:\n    b .loop\n    blr\nfunc b: y: i32 @ r3\n.loop:\n    b .loop\n    blr'
  );
  const names = [...out.matchAll(/^(__loc\d+__):/gm)].map((m) => m[1]);
  const refs = [...out.matchAll(/\bb (__loc\d+__)\b/g)].map((m) => m[1]);
  const okTwo = names.length === 2 && names[0] !== names[1];
  const okRefs = refs.length === 2 && refs[0] === names[0] && refs[1] === names[1];
  if (okTwo && okRefs) console.log('func-local scope:     ok');
  else {
    console.log(`  FAIL func-local scope: names=${JSON.stringify(names)} refs=${JSON.stringify(refs)}`);
    failed++;
  }
}

// line count preserved so assembler error lines still map to the editor
{
  const src = STRUCT + 'func f: p: Player @ r3\n.top:\n    lfs f1, p.health\n    b .top\n    blr';
  if (preprocessFuncs(src).split('\n').length === src.split('\n').length) console.log('line count preserved: ok');
  else {
    console.log('  FAIL func line count');
    failed++;
  }
}

// parseFuncs surfaces the signature for the outline
{
  const fs = parseFuncs('func applyDamage: player: Player @ r3, amount: i32 @ r4 -> r3: i32\n.loop:\n    blr');
  const f = fs[0];
  const ok =
    f && f.name === 'applyDamage' && f.params.length === 2 &&
    f.params[0].name === 'player' && f.params[0].type === 'Player' && f.params[0].reg === 'r3' &&
    f.ret === 'r3: i32' && f.locals.length === 1 && f.locals[0] === 'loop';
  if (ok) console.log('parseFuncs:           ok');
  else {
    console.log(`  FAIL parseFuncs: ${JSON.stringify(fs)}`);
    failed++;
  }
}

// global bindings resolve in every func and get stripped from the output
{
  const src = STRUCT + 'global p: Player @ r31\nfunc a:\n    lfs f1, p.health\n    blr\nfunc b:\n    stfs f2, p.rank';
  const out = preprocessFuncs(src);
  const body = out.split('\n').filter((l) => l.trim() && !/^\s*#/.test(l)).map((l) => l.trim());
  const okA = body.includes('lfs f1, 0x0(r31)');
  const okB = body.includes('stfs f2, 0x4(r31)');
  const okStripped = !/\bglobal\b/.test(out);
  const okLines = out.split('\n').length === src.split('\n').length;
  const g = parseGlobals(src)[0];
  const okParse = g && g.name === 'p' && g.type === 'Player' && g.reg === 'r31';
  if (okA && okB && okStripped && okLines && okParse) console.log('global binding:       ok');
  else {
    console.log(`  FAIL global: ${JSON.stringify(body)} stripped=${okStripped} lines=${okLines} g=${JSON.stringify(g)}`);
    failed++;
  }
}

// body `param` lines bind like header params, and are rejected outside a func
{
  const src = STRUCT + 'func f:\n    param p: Player @ r3\n    lfs f1, p.health\n    blr';
  const body = preprocessFuncs(src).split('\n').filter((l) => l.trim() && !/^\s*#/.test(l)).map((l) => l.trim());
  const okBind = body.includes('lfs f1, 0x0(r3)');
  const okStrip = !/\bparam\b/.test(preprocessFuncs(src));
  const okLines = preprocessFuncs(src).split('\n').length === src.split('\n').length;
  const okInside = validateFuncs(src).ok === true;
  const bad = validateFuncs('param x: i32 @ r3\nfunc f:\n    blr');
  const okReject = bad.ok === false && bad.line === 1; // before any func
  const bad2 = validateFuncs('func f:\n    blr\n    param x: i32 @ r3');
  const okReject2 = bad2.ok === false && bad2.line === 3; // after an instruction
  const f = parseFuncs(src)[0];
  const okParse = f && f.params.length === 1 && f.params[0].name === 'p' && f.params[0].reg === 'r3';
  if (okBind && okStrip && okLines && okInside && okReject && okReject2 && okParse) console.log('param lines:          ok');
  else {
    console.log(`  FAIL param: bind=${okBind} strip=${okStrip} lines=${okLines} inside=${okInside} reject=${JSON.stringify(bad)} reject2=${JSON.stringify(bad2)} parse=${JSON.stringify(f)}`);
    failed++;
  }
}

// inline func address: binds the label, keeps one output line, parses the addr
{
  const src = 'func f @ 0x016C7C30: n: i32 @ r3\n    add r3, r3, n\n    blr';
  const pre = preprocessFuncs(src);
  const okDesugar = pre.split('\n')[0] === 'address 0x016C7C30 f';
  const okLines = pre.split('\n').length === src.split('\n').length;
  const a = makeAssembler();
  a.assemble(pre);
  const okBind = a.labels.get('f') === 0x016c7c30;
  const f = parseFuncs(src)[0];
  const okParse = f && f.addr === '0x016C7C30' && f.params.length === 1;
  const plain = preprocessFuncs('func g:\n    blr').split('\n')[0];
  const okPlain = plain === 'g:'; // no address, unchanged
  if (okDesugar && okLines && okBind && okParse && okPlain) console.log('inline func address:  ok');
  else {
    console.log(`  FAIL inline addr: desugar=${okDesugar} lines=${okLines} bind=${okBind} parse=${JSON.stringify(f)} plain=${okPlain}`);
    failed++;
  }
}

if (failed) process.exit(1);
