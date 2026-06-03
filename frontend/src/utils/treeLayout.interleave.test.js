import { describe, it, expect } from 'vitest';
import { computeTreeLayout } from './treeLayout';
import { applyViewMode } from './treeViewModes';
import { buildLocalIndexes, getSubtreeBoundingBox } from './layoutGraph';

function person(id, n, g, b) { return { id, full_name: n, gender: g, birth: b }; }
function pe(r, p, c) { return { source: p, target: c, type: 'BIRTH_PARENT', relation_id: r }; }
function pa(r, a, b) { return { source: a, target: b, type: 'PARTNER', relation_id: r, partner_type: 'married' }; }
function couple(r, m, f, k) { const e = [pa(r, m, f)]; k.forEach(x => { e.push(pe(r, m, x)); e.push(pe(r, f, x)); }); return e; }

function concaveBranch(nodes, edges, root, tag, depth, gen) {
  const sp = `${tag}_sp`;
  nodes.push(person(sp, `S${tag}`, 'F', gen + 1));
  const g1 = `${tag}_g1`, g2 = `${tag}_g2`;
  nodes.push(person(g1, `${tag}G1`, 'M', gen + 25), person(g2, `${tag}G2`, 'F', gen + 27));
  edges.push(...couple(`r_${tag}`, root, sp, [g1, g2]));
  let cur = g1;
  for (let l = 0; l < depth; l++) {
    const ch = `${tag}_d${l}`, cs = `${tag}_ds${l}`;
    nodes.push(person(ch, `${tag}D${l}`, 'M', gen + 50 + l * 22), person(cs, `${tag}DS${l}`, 'F', gen + 50));
    edges.push(...couple(`r_${tag}_${l}`, cur, cs, [ch]));
    cur = ch;
  }
}

function concaveSiblings(n) {
  const nodes = [person('F', 'Focus', 'M', 1950), person('W', 'Sotie', 'F', 1952)];
  const edges = [];
  const kids = [];
  for (let i = 0; i < n; i++) { const k = `c${i}`; kids.push(k); nodes.push(person(k, `Copil${i}`, i % 2 ? 'F' : 'M', 1975 + i)); }
  edges.push(...couple('r_F', 'F', 'W', kids));
  kids.forEach((k, i) => concaveBranch(nodes, edges, k, `b${i}`, 3, 1975 + i));
  return { nodes, edges, focus: 'F', kids };
}

function focusBranchBoxes(layout, filteredEdges, focusId, kids, partnerIds) {
  const pos = new Map();
  layout.positionedNodes.filter(nn => !nn.isGhost && nn.x != null).forEach(nn => pos.set(String(nn.id), { x: nn.x, y: nn.y }));
  const visIds = new Set([...pos.keys()]);
  const ve = filteredEdges.filter(e => visIds.has(String(e.source)) && visIds.has(String(e.target)));
  const idx = buildLocalIndexes(
    ve.filter(e => ['BIRTH_PARENT', 'STEP_PARENT', 'ADOPTIVE_PARENT'].includes(e.type)),
    ve.filter(e => e.type === 'PARTNER'),
  );
  const blocked = new Set([String(focusId), ...partnerIds.map(String)]);
  return kids
    .filter(k => pos.has(k))
    .map(k => { const b = getSubtreeBoundingBox(k, idx.childrenOf, idx.partnersOf, pos, blocked); return { root: k, minX: b.minX, maxX: b.maxX }; })
    .sort((a, b) => a.minX - b.minX);
}

function expectDisjoint(boxes) {
  for (let i = 0; i < boxes.length - 1; i++) {
    const a = boxes[i], b = boxes[i + 1];
    expect(
      a.maxX <= b.minX + 1,
      `subarborii ${a.root} [${Math.round(a.minX)}..${Math.round(a.maxX)}] și ${b.root} [${Math.round(b.minX)}..${Math.round(b.maxX)}] se întrepătrund`,
    ).toBe(true);
  }
}

describe('subarborii focusului nu se întrepătrund (cutii disjuncte)', () => {
  for (const n of [2, 3, 4]) {
    it(`${n} frați cu ramuri concave adânci: cutii orizontale disjuncte + 0 suprapuneri noduri`, () => {
      const { nodes, edges, focus, kids } = concaveSiblings(n);
      const filtered = applyViewMode(nodes, edges, focus, 'all', { lineage: 'self' });
      const layout = computeTreeLayout(filtered.nodes, filtered.edges, { focusId: focus, viewMode: 'all', hideUnknowns: true });
      expect(layout.collisionReport.nodeOverlaps).toHaveLength(0);
      const boxes = focusBranchBoxes(layout, filtered.edges, focus, kids, ['W']);
      expect(boxes.length).toBe(n);
      expectDisjoint(boxes);
    });
  }

  it('focus cu doi parteneri, subarbori prin grupuri diferite: tot disjuncte', () => {
    const nodes = [person('F', 'Focus', 'M', 1950), person('W1', 'Sotie1', 'F', 1952), person('W2', 'Sotie2', 'F', 1958)];
    const edges = [];
    edges.push(...couple('r_W1', 'F', 'W1', ['a']));
    edges.push(...couple('r_W2', 'F', 'W2', ['b']));
    concaveBranch(nodes, edges, 'a', 'ba', 3, 1975);
    concaveBranch(nodes, edges, 'b', 'bb', 3, 1978);
    nodes.push(person('a', 'Ka', 'M', 1975), person('b', 'Kb', 'F', 1978));
    const filtered = applyViewMode(nodes, edges, 'F', 'all', { lineage: 'self' });
    const layout = computeTreeLayout(filtered.nodes, filtered.edges, { focusId: 'F', viewMode: 'all', hideUnknowns: true });
    expect(layout.collisionReport.nodeOverlaps).toHaveLength(0);
    const boxes = focusBranchBoxes(layout, filtered.edges, 'F', ['a', 'b'], ['W1', 'W2']);
    expectDisjoint(boxes);
  });
});
