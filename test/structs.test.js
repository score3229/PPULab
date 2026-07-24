'use strict';

// checks the struct pass resolves field refs and that the result assembles
// to the same bytes as writing the offsets by hand. runs with: npm test

const { makeAssembler } = require('../lib/ppc_assembler.js');
const { preprocessStructs, parseStructs, emitStructData } = require('../lib/struct-preprocessor.js');

// tiny inline alias pass mirror so the test does not depend on the .ts file:
// after structs resolve, `set r3, player` should bind player -> r3.
function stripSets(text) {
  const map = new Map();
  return text
    .split('\n')
    .map((line) => {
      const m = line.match(/^\s*set\s+(r\d+)\s*,\s*([A-Za-z_]\w*)\s*$/i);
      if (m) {
        map.set(m[2], m[1].toLowerCase());
        return '';
      }
      const toks = line.split(/(\s+|,|\(|\)|\[|\]|\+|-)/);
      for (let i = 0; i < toks.length; i++) if (map.has(toks[i])) toks[i] = map.get(toks[i]);
      return toks.join('');
    })
    .join('\n');
}

const asm = makeAssembler();
let failed = 0;

function firstWord(src) {
  const out = asm.assemble(src.split('\n').filter((l) => l.trim() && !/^\s*#/.test(l)).join('\n'));
  return String(out[out.length - 1]).toLowerCase();
}

const cases = [
  {
    why: 'typed instance -> offset(reg)',
    struct: 'struct Player { health @ 0x10, ammo @ 0x14 }\nset r3, player as Player\nlwz r4, player.health',
    plain: 'lwz r4, 0x10(r3)',
  },
  {
    why: 'typed instance, second field',
    struct: 'struct Player { health @ 0x10, ammo @ 0x14 }\nset r3, player as Player\nstw r5, player.ammo',
    plain: 'stw r5, 0x14(r3)',
  },
  {
    why: 'bare type -> offset constant',
    struct: 'struct Player { health @ 0x10 }\nlwz r4, Player.health(r3)',
    plain: 'lwz r4, 0x10(r3)',
  },
  {
    why: 'decimal offset field',
    struct: 'struct Node { next @ 8 }\nset r9, node as Node\nlwz r10, node.next',
    plain: 'lwz r10, 8(r9)',
  },
  {
    why: 'multi line struct block',
    struct: 'struct Weapon {\n  damage @ 0x20\n  clip @ 0x24\n}\nset r6, gun as Weapon\nlwz r7, gun.clip',
    plain: 'lwz r7, 0x24(r6)',
  },
  {
    why: 'typed field auto-layout (i32 after string[16])',
    struct: 'struct Player {\n  name : string[16]\n  health : i32\n}\nset r3, player as Player\nlwz r4, player.health',
    plain: 'lwz r4, 0x10(r3)',
  },
  {
    why: 'typed field natural alignment (f32 after i16)',
    struct: 'struct P {\n  a : i16\n  b : f32\n}\nset r3, p as P\nlfs f5, p.b',
    plain: 'lfs f5, 0x4(r3)',
  },
  {
    why: 'explicit @ overrides the running cursor',
    struct: 'struct P {\n  a : i32\n  b : i32 @ 0x40\n}\nset r3, p as P\nlwz r4, p.b',
    plain: 'lwz r4, 0x40(r3)',
  },
  {
    why: 'struct base address does not affect field offsets',
    struct: 'struct P @ 0x016C7C30 {\n  hp : i32\n}\nset r3, p as P\nlwz r4, p.hp',
    plain: 'lwz r4, 0x0(r3)',
  },
];

let passed = 0;
for (const c of cases) {
  let got, want;
  try {
    got = firstWord(stripSets(preprocessStructs(c.struct)));
    want = firstWord(c.plain);
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
console.log(`struct resolution:    ${passed}/${cases.length} passed`);

// line count must be preserved so assembler error lines still map to the editor
{
  const src = 'struct Player {\n  health @ 0x10\n}\nset r3, player as Player\nlwz r4, player.health\n; trailing';
  const outLines = preprocessStructs(src).split('\n').length;
  const inLines = src.split('\n').length;
  if (outLines === inLines) console.log('line count preserved: ok');
  else {
    console.log(`  FAIL line count: in ${inLines} out ${outLines}`);
    failed++;
  }
}

// panel parse sees the type, its fields, and the typed instance
{
  const p = parseStructs('struct Player { health @ 0x10, ammo @ 0x14 }\nset r3, player as Player');
  const okType = p.types.length === 1 && p.types[0].name === 'Player' && p.types[0].fields.length === 2;
  const okInst = p.instances.length === 1 && p.instances[0].name === 'player' && p.instances[0].type === 'Player' && p.instances[0].reg === 'r3';
  if (okType && okInst) console.log('panel parse:          ok');
  else {
    console.log(`  FAIL panel parse: ${JSON.stringify(p)}`);
    failed++;
  }
}

// panel parse sees the address, field types, sizes and computed offsets
{
  const p = parseStructs('struct Player @ 0x016C7C30 {\n  name : string[16]\n  health : i32\n}');
  const t = p.types[0];
  const okAddr = t && t.address === '0x16c7c30';
  const f0 = t && t.fields[0];
  const f1 = t && t.fields[1];
  const okFields =
    f0 && f0.type === 'string[16]' && f0.size === 16 && f0.offset === '0x0' &&
    f1 && f1.type === 'i32' && f1.size === 4 && f1.offset === '0x10';
  if (okAddr && okFields) console.log('panel typed parse:    ok');
  else {
    console.log(`  FAIL panel typed parse: ${JSON.stringify(p)}`);
    failed++;
  }
}

// struct data emission: values (and zero-fill) become big-endian words at addr
{
  const hx = (w) => (w >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const blocks = emitStructData(
    'struct Player @ 0x016C7C30 {\n  name : string[16] = "Hero"\n  health : i32 = 100\n  posX : f32 = 1.5\n  ammo : i32\n}'
  );
  const b = blocks[0];
  const got = b ? b.words.map(hx).join(' ') : '';
  const want = '4865726F 00000000 00000000 00000000 00000064 3FC00000 00000000';
  const okData = b && b.address === 0x016c7c30 && got === want && b.byteLen === 28;

  // negative int wraps two's complement; a value-less struct emits nothing
  const neg = emitStructData('struct S @ 0x10 {\n  x : i16 = -1\n}')[0];
  const okNeg = neg && neg.words.length === 1 && hx(neg.words[0]) === 'FFFF0000';
  const silent = emitStructData('struct Q @ 0x20 {\n  a : i32\n}').length === 0;

  if (okData && okNeg && silent) console.log('struct data emit:     ok');
  else {
    console.log(`  FAIL struct data emit: got ${got} want ${want} neg=${neg && hx(neg.words[0])} silent=${silent}`);
    failed++;
  }
}

// loadstruct: expands to load32 and binds the type to the register so field
// refs resolve to offset(reg) directly, on one line (count preserved)
{
  const src = 'struct P @ 0x00B00000 {\n  hp : i32\n  atk : f32\n}\nloadstruct r3, P\nlwz r4, P.hp\nlfs f1, P.atk';
  const out = preprocessStructs(src);
  const body = out.split('\n').filter((l) => l.trim() && !/^\s*#/.test(l)).map((l) => l.trim());
  const okLoad = body.includes('load32 r3, 0xb00000');
  const okHp = body.includes('lwz r4, 0x0(r3)');
  const okAtk = body.includes('lfs f1, 0x4(r3)');
  const okLines = out.split('\n').length === src.split('\n').length;
  const inst = parseStructs(src).instances[0];
  const okInst = inst && inst.name === 'P' && inst.reg === 'r3' && inst.type === 'P';
  if (okLoad && okHp && okAtk && okLines && okInst) console.log('loadstruct:           ok');
  else {
    console.log(`  FAIL loadstruct: ${JSON.stringify(body)} lines=${okLines} inst=${JSON.stringify(inst)}`);
    failed++;
  }
}

// packed lays fields end to end; aligned pads to type size; explicit @ wins
{
  const al = parseStructs('struct A { a : u8\n b : i32\n c : u8\n d : i16 }').types[0];
  const pk = parseStructs('struct B packed { a : u8\n b : i32\n c : u8\n d : i16 }').types[0];
  const ov = parseStructs('struct C packed { a : u8\n b : i32 @ 0x10 }').types[0];
  const off = (t, n) => t.fields.find((f) => f.name === n).offset;
  const okAligned = off(al, 'b') === '0x4' && off(al, 'd') === '0xa' && al.packed === false;
  const okPacked = off(pk, 'b') === '0x1' && off(pk, 'c') === '0x5' && off(pk, 'd') === '0x6' && pk.packed === true;
  const okOverride = off(ov, 'b') === '0x10';
  if (okAligned && okPacked && okOverride) console.log('packed layout:        ok');
  else {
    console.log(`  FAIL packed: aligned=${okAligned} packed=${okPacked} override=${okOverride}`);
    failed++;
  }
}

if (failed) process.exit(1);
