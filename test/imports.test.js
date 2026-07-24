'use strict';

// checks cross-file imports: labels become absolute addresses, struct types
// and aliases carry across, missing/transitive/no-address cases behave.
// runs with: npm test

const { makeAssembler } = require('../lib/ppc_assembler.js');
const { resolveImports } = require('../lib/import-resolver.js');
const { preprocessStructs } = require('../lib/struct-preprocessor.js');

const FILES = {
  combat: 'address 0x016C7C30\napplyDamage:\n  li r3, 0\n  blr',
  shared: 'struct Player {\n  health : i32\n  ammo : i32\n}\nset r31, base',
  wrap: 'import shared',
  util: 'helper:\n  blr', // labels but no address directive
};
const load = (n) => (Object.prototype.hasOwnProperty.call(FILES, n) ? FILES[n] : null);

let failed = 0;
function ok(cond, msg) {
  if (cond) console.log(`  ok   ${msg}`);
  else {
    console.log(`  FAIL ${msg}`);
    failed++;
  }
}

// 1) an imported label becomes its absolute address, in place, and branches
{
  const main = 'address 0x016C7C00\nimport combat\nmain:\n  bl applyDamage';
  const r = resolveImports(main, load);
  ok(/\bbl 0x16c7c30\b/.test(r.text), 'bl applyDamage -> bl 0x16c7c30');
  ok(/^# import combat/m.test(r.text), 'import line commented out');
  ok(r.text.split('\n').length === main.split('\n').length, 'line count preserved');
  const words = makeAssembler().assemble(r.text);
  // caller bl at 0x016C7C00, target 0x016C7C30 -> delta 0x30, LK=1 -> 48000031
  ok(words[words.length - 1] === '48000031', `resolved call assembles to 48000031 (got ${words[words.length - 1]})`);
}

// 2) imported struct type resolves field offsets in the importing file
{
  const main = 'import shared\nset r3, p as Player\nlwz r4, p.health\nstw r5, p.ammo';
  const r = resolveImports(main, load);
  ok(/struct Player/.test(r.structText), 'structText carries imported Player');
  const st = preprocessStructs(r.text, r.structText);
  ok(/0x0\(p\)/.test(st), 'p.health -> 0x0(p)');
  ok(/0x4\(p\)/.test(st), 'p.ammo -> 0x4(p)');
  ok(r.aliasSeed.some((a) => a.name === 'base' && a.reg === 'r31'), 'aliasSeed has base=r31');
}

// 3) missing import is reported with its line
{
  const r = resolveImports('import nope\nnop', load);
  ok(r.missing.length === 1 && r.missing[0].name === 'nope' && r.missing[0].line === 1, 'missing import detected with line');
}

// 4) transitive import pulls a struct through an intermediate file
{
  const r = resolveImports('import wrap\nset r3, p as Player\nlwz r4, p.health', load);
  ok(/struct Player/.test(r.structText), 'transitive import pulls Player through wrap');
}

// 5) importing a file with no address leaves its labels unresolved and flags it
{
  const r = resolveImports('import util\nbl helper', load);
  ok(/\bbl helper\b/.test(r.text) && r.noAddress.includes('util'), 'no-address import: label left as-is + flagged');
}

console.log(`imports: ${failed ? 'FAILED' : 'ok'}`);
if (failed) process.exit(1);
