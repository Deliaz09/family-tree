import { describe, it, expect } from 'vitest';
import { computeTreeLayout, NODE_WIDTH, NODE_HEIGHT } from './treeLayout';
import { detectLayoutCollisions } from './layoutCollision';
import { applyViewMode } from './treeViewModes';
import { buildLocalIndexes, computeSubtreeZones } from './layoutGraph';

function person(id, full_name, gender, birth) { return { id, full_name, gender, birth }; }
function pe(relId, p, c) { return { source: p, target: c, type: 'BIRTH_PARENT', relation_id: relId }; }
function pa(relId, a, b) { return { source: a, target: b, type: 'PARTNER', relation_id: relId, partner_type: 'married' }; }
function couple(relId, m, f, kids) {
  const e = [pa(relId, m, f)];
  kids.forEach(k => { e.push(pe(relId, m, k)); e.push(pe(relId, f, k)); });
  return e;
}

function deepBranch(nodes, edges, rootId, tag, gen) {
  const sp = `${tag}_sp`;
  nodes.push(person(sp, `Sot ${tag}`, 'F', gen + 22));
  const kids = [`${tag}_a`, `${tag}_b`];
  nodes.push(person(kids[0], `Nepot ${tag}A`, 'M', gen + 45));
  nodes.push(person(kids[1], `Nepot ${tag}B`, 'F', gen + 48));
  edges.push(...couple(`r_${tag}`, rootId, sp, kids));
  kids.forEach((k, i) => {
    const ks = `${k}_sp`;
    const gk = [`${k}_x`, `${k}_y`];
    nodes.push(person(ks, `Sot ${k}`, i % 2 ? 'M' : 'F', gen + 68));
    nodes.push(person(gk[0], `Stranepot ${k}X`, 'M', gen + 90));
    nodes.push(person(gk[1], `Stranepot ${k}Y`, 'F', gen + 92));
    edges.push(...couple(`r_${k}`, i % 2 ? ks : k, i % 2 ? k : ks, gk));
  });
}

function twoPartnersBigSubtrees() {
  const nodes = [
    person('P', 'Sosa Petrica', 'M', 1930),
    person('W', 'Sotie Petrica', 'F', 1933),
    person('X', 'Fost Sot', 'M', 1928),
  ];
  const edges = [];
  const shared = ['sk1', 'sk2', 'sk3'];
  shared.forEach((k, i) => nodes.push(person(k, `Copil comun ${i + 1}`, i % 2 ? 'F' : 'M', 1958 + i)));
  edges.push(...couple('r_PW', 'P', 'W', shared));
  shared.forEach((k, i) => deepBranch(nodes, edges, k, `s${i}`, 1958));
  const other = ['ok1', 'ok2'];
  other.forEach((k, i) => nodes.push(person(k, `Copil W ${i + 1}`, i % 2 ? 'M' : 'F', 1953 + i)));
  edges.push(...couple('r_WX', 'X', 'W', other));
  other.forEach((k, i) => deepBranch(nodes, edges, k, `o${i}`, 1953));
  return { nodes, edges, focus: 'sk1' };
}

function finalReportWithZones(layout, visibleEdges, focusId) {
  const pos = new Map();
  layout.positionedNodes.filter(n => !n.isGhost && n.x != null).forEach(n => pos.set(String(n.id), { x: n.x, y: n.y }));
  const parentEdges = visibleEdges.filter(e => ['BIRTH_PARENT', 'STEP_PARENT', 'ADOPTIVE_PARENT'].includes(e.type));
  const partnerEdges = visibleEdges.filter(e => e.type === 'PARTNER');
  const idx = buildLocalIndexes(parentEdges, partnerEdges);
  const region = new Set();
  const q = [String(focusId)];
  while (q.length) {
    const id = String(q.shift());
    if (region.has(id)) continue;
    region.add(id);
    (idx.childrenOf.get(id) || new Set()).forEach(c => q.push(String(c)));
    (idx.partnersOf.get(id) || new Set()).forEach(p => q.push(String(p)));
  }
  const roots = [];
  const blockedPerRoot = new Map();
  idx.childrenOf.forEach((children, rootId) => {
    const root = String(rootId);
    if (!children?.size || !pos.has(root) || root === String(focusId) || !region.has(root)) return;
    roots.push(root);
    blockedPerRoot.set(root, new Set([...(idx.parentsOf.get(root) || new Set())].map(String)));
  });
  const zones = computeSubtreeZones(roots, idx.childrenOf, idx.partnersOf, pos, blockedPerRoot);
  return detectLayoutCollisions(
    { positionedNodes: layout.positionedNodes.filter(n => !n.isGhost), links: layout.links, brackets: layout.brackets },
    { nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT, subtrees: zones },
  );
}

describe('computeTreeLayout — linie lungă peste zona altui subarbore (doi parteneri cu subarbori mari)', () => {
  it('dispunerea finală nu conține nicio linie lungă care traversează zona altui subarbore', () => {
    const { nodes, edges, focus } = twoPartnersBigSubtrees();
    const filtered = applyViewMode(nodes, edges, focus, 'all', { lineage: 'self' });
    const layout = computeTreeLayout(filtered.nodes, filtered.edges, { focusId: focus, viewMode: 'all', hideUnknowns: true });

    expect(layout.collisionReport.nodeOverlaps, 'carduri suprapuse').toHaveLength(0);
    expect(layout.collisionReport.lineNodeCollisions, 'linii prin carduri').toHaveLength(0);

    const visIds = new Set(layout.positionedNodes.filter(n => !n.isGhost).map(n => String(n.id)));
    const visibleEdges = filtered.edges.filter(e => visIds.has(String(e.source)) && visIds.has(String(e.target)));
    const r = finalReportWithZones(layout, visibleEdges, focus);
    expect(
      r.lineZoneCollisions,
      `linii lungi peste zona altui subarbore în final: ${JSON.stringify(r.lineZoneCollisions)}`,
    ).toHaveLength(0);
  });
});
