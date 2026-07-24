'use strict';

// asserts the assembler encodes a frozen set of known-good ppc instructions.
// the fixtures were verified byte-for-byte against real rpcs3 patch bytes.
// run with: npm test

const fs = require('fs');
const path = require('path');
const { makeAssembler } = require('../lib/ppc_assembler.js');
const { disassemble, decodeWord } = require('../lib/ppc_disassembler.js');

const fixtures = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'known-encodings.json'), 'utf8')
);

let failed = 0;

// 1) assembler: source text encodes to the known-good word
{
  const asm = makeAssembler();
  let passed = 0;
  const failures = [];
  for (const { asm: src, hex } of fixtures) {
    let got;
    try {
      const out = asm.assemble(src);
      got = Array.isArray(out) && out.length === 1 ? String(out[0]).toLowerCase() : `(${out && out.length} words)`;
    } catch (e) {
      got = `error: ${e.message}`;
    }
    if (got === hex.toLowerCase()) passed++;
    else failures.push({ src, expected: hex, got });
  }
  console.log(`assembler encoding:   ${passed}/${fixtures.length} passed`);
  for (const f of failures) console.log(`  FAIL ${f.src.padEnd(30)} expected ${f.expected}  got ${f.got}`);
  failed += failures.length;
}

// 2) disassembler: each word decodes to a real mnemonic (never hexcode)
//    and re-assembles to the exact same bytes
{
  const asm = makeAssembler();
  let passed = 0;
  const failures = [];
  for (const { hex } of fixtures) {
    const word = parseInt(hex, 16) >>> 0;
    const d = decodeWord(word, 0);
    if (d.mnem === 'hexcode') { failures.push({ hex, why: 'decoded to hexcode' }); continue; }
    let re;
    try {
      re = String(asm.assemble(disassemble(hex))[0]).toLowerCase();
    } catch (e) {
      failures.push({ hex, why: `reassemble error: ${e.message}` });
      continue;
    }
    if (re === hex.toLowerCase()) passed++;
    else failures.push({ hex, why: `reassembled to ${re}` });
  }
  console.log(`disassembler round-trip: ${passed}/${fixtures.length} passed`);
  for (const f of failures) console.log(`  FAIL ${f.hex}  ${f.why}`);
  failed += failures.length;
}

// 3) disassembler formatting: exact-string checks for cases the numeric
//    round-trip can't catch. register-form compares once printed rB as an
//    immediate (0x6 instead of r6) yet still re-assembled to the same bytes.
{
  const cases = [
    ['7f833000', 'cmpw cr7, r3, r6'],
    ['7f833040', 'cmplw cr7, r3, r6'],
    ['7eb29800', 'cmpd cr5, r18, r19'],
    ['2f836f70', 'cmpwi cr7, r3, 0x6f70'],
    ['2b841181', 'cmplwi cr7, r4, 0x1181'],
  ];
  let passed = 0;
  const failures = [];
  for (const [hex, want] of cases) {
    const got = String(disassemble(hex)).trim();
    if (got === want) passed++;
    else failures.push({ hex, want, got });
  }
  console.log(`disassembler formatting: ${passed}/${cases.length} passed`);
  for (const f of failures) console.log(`  FAIL ${f.hex}  want "${f.want}"  got "${f.got}"`);
  failed += failures.length;
}

if (failed) process.exit(1);
