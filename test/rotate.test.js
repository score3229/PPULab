'use strict';

// assemble-only checks for the md-form rotate sugar (sldi/srdi/clrldi). these
// expand to rldicr/rldicl, which the disassembler does not emit, so they can't
// live in the round-trip fixtures. encodings verified against ProDG.

const { makeAssembler } = require('../lib/ppc_assembler.js');

const cases = [
  ['sldi r3, r27, 2', '7b631764'],
  ['sldi r27, r3, 2', '787b1764'],
  ['sldi r3, r3, 32', '786307c6'],
  ['srdi r3, r27, 2', '7b63f082'],
  ['srdi r27, r3, 2', '787bf082'],
  ['clrldi r3, r4, 16', '78830400'],
  ['clrldi r0, r0, 32', '78000020'],
];

let failed = 0;
for (const [asm, hex] of cases) {
  let got;
  try {
    got = String(makeAssembler().assemble(asm)[0]).toLowerCase();
  } catch (e) {
    got = `error: ${e.message}`;
  }
  if (got !== hex) {
    failed++;
    console.log(`  FAIL ${asm} -> ${got} (want ${hex})`);
  }
}

if (failed) {
  console.log(`rotate sugar: ${failed}/${cases.length} FAILED`);
  process.exit(1);
}
console.log(`rotate sugar: ${cases.length}/${cases.length} passed`);
