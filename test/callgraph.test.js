'use strict';

// call graph: local/imported/game-func nodes and bl edges. runs with: npm test

const { buildCallGraph } = require('../lib/call-graph.js');

let failed = 0;
function check(cond, msg) {
  if (cond) return;
  console.log(`  FAIL ${msg}`);
  failed++;
}

const id = (n) => `fn:${n}`;

// local calls, dedupe, game-func address, entry detection
{
  const src = [
    'func main:',
    '    bl applyDamage',
    '    bl updateHud',
    '    bl applyDamage',
    '    blr',
    'func applyDamage:',
    '    bl clamp',
    '    bl 0x8134AABC',
    '    blr',
    'func updateHud:',
    '    blr',
    'func clamp:',
    '    blr',
  ].join('\n');
  const g = buildCallGraph(src);
  const has = (from, to) => g.edges.some((e) => e.from === from && e.to === to);
  check(has(id('main'), id('applyDamage')), 'main -> applyDamage');
  check(has(id('main'), id('updateHud')), 'main -> updateHud');
  check(has(id('applyDamage'), id('clamp')), 'applyDamage -> clamp');
  check(g.edges.filter((e) => e.from === id('main') && e.to === id('applyDamage')).length === 1, 'dupe edge collapsed');
  const game = g.nodes.find((n) => n.kind === 'external' && n.label.startsWith('0x'));
  check(game && game.sub === 'game func', 'game func node');
  check(g.nodes.find((n) => n.id === id('main')).kind === 'entry', 'main is entry');
  check(g.nodes.find((n) => n.id === id('clamp')).kind === 'local', 'clamp is local');
  console.log('call graph basics:  ' + (failed ? 'FAIL' : 'ok'));
}

// branches to other funcs are edges; branches to local labels are not
{
  const src = [
    'func entry:',
    '    beq test',
    '    b ammo',
    '    beq .skip',
    '.skip:',
    '    blr',
    'func test @ 0x00200000:',
    '    beq ammo',
    '    blr',
    'func ammo:',
    '    blr',
  ].join('\n');
  const g = buildCallGraph(src);
  const has = (a, b) => g.edges.some((e) => e.from === id(a) && e.to === id(b));
  check(has('entry', 'test'), 'beq test -> edge');
  check(has('entry', 'ammo'), 'b ammo -> edge');
  check(has('test', 'ammo'), 'test beq ammo -> edge');
  check(!g.nodes.some((n) => n.id === 'ext:.skip'), 'branch to local label is not a node');
  check(g.nodes.find((n) => n.id === id('entry')).kind === 'entry', 'entry is entry');
  check(g.nodes.find((n) => n.id === id('ammo')).kind === 'local', 'ammo is local');
  console.log('call graph branches: ' + (failed ? 'FAIL' : 'ok'));
}

// imported func tagged with its file
{
  const g = buildCallGraph('func main:\n    bl sharedHelper\n    blr', new Map([['sharedHelper', 'combat']]));
  const imp = g.nodes.find((n) => n.kind === 'imported');
  check(imp && imp.label === 'sharedHelper' && imp.sub === 'from combat', 'imported node tagged from combat');
  check(g.edges.some((e) => e.to === 'imp:sharedHelper'), 'edge to imported node');
  console.log('call graph imports: ' + (imp ? 'ok' : 'FAIL'));
}

// bl to an inline-address func resolves to that local func
{
  const g = buildCallGraph('func a:\n    bl 0x100\n    blr\nfunc b @ 0x100:\n    blr');
  check(g.edges.some((e) => e.from === 'fn:a' && e.to === 'fn:b'), 'bl 0x100 -> func b');
  console.log('call graph inline addr: ' + (g.edges.some((e) => e.to === 'fn:b') ? 'ok' : 'FAIL'));
}

// no funcs -> empty
{
  const g = buildCallGraph('li r3, 1\nblr');
  check(g.nodes.length === 0 && g.edges.length === 0, 'no funcs -> empty');
  console.log('call graph empty:   ' + (g.nodes.length === 0 ? 'ok' : 'FAIL'));
}

if (failed) process.exit(1);
