import { describe, it, expect } from 'vitest';
import { computeTreeLayout } from './treeLayout';
import { applyViewMode } from './treeViewModes';

const MODES = ['all', 'ancestors', 'descendants', 'hourglass'];

function person(id, full_name, gender, birth) {
  return { id, full_name, gender, birth };
}
function parentEdge(relId, parentId, childId) {
  return { source: parentId, target: childId, type: 'BIRTH_PARENT', relation_id: relId };
}
function partnerEdge(relId, a, b, partner_type = 'married') {
  return { source: a, target: b, type: 'PARTNER', relation_id: relId, partner_type };
}
function couple(relId, manId, womanId, childIds, partner_type = 'married') {
  const edges = [partnerEdge(relId, manId, womanId, partner_type)];
  childIds.forEach(c => {
    edges.push(parentEdge(relId, manId, c));
    edges.push(parentEdge(relId, womanId, c));
  });
  return edges;
}

function layoutFor(nodes, edges, focusId, mode) {
  const opts = { lineage: 'self' };
  if (mode === 'ancestors' || mode === 'descendants' || mode === 'hourglass') {
    opts.maxGenerations = 4;
    opts.expandedFrontier = new Set();
  }
  const filtered = applyViewMode(nodes, edges, focusId, mode, opts);
  return computeTreeLayout(filtered.nodes, filtered.edges, { focusId, viewMode: mode, hideUnknowns: true });
}

function expectNoRealOverlap(nodes, edges, focusId, mode) {
  const layout = layoutFor(nodes, edges, focusId, mode);
  const r = layout.collisionReport;
  expect(r, `collisionReport lipsește pentru modul ${mode}`).toBeTruthy();
  expect(r.nodeOverlaps, `carduri suprapuse în modul ${mode}: ${JSON.stringify(r.nodeOverlaps)}`).toHaveLength(0);
  expect(r.lineNodeCollisions, `linii prin carduri în modul ${mode}: ${JSON.stringify(r.lineNodeCollisions)}`).toHaveLength(0);
}

function nuclearFamily() {
  const nodes = [
    person('f', 'Ion Popescu', 'M', 1950),
    person('m', 'Maria Popescu', 'F', 1952),
    person('c1', 'Andrei Popescu', 'M', 1978),
    person('c2', 'Elena Popescu', 'F', 1981),
  ];
  const edges = couple('r1', 'f', 'm', ['c1', 'c2']);
  return { nodes, edges, focus: 'c1' };
}

function threeGenWithInLaws() {
  const nodes = [
    person('gp1', 'Bunic Patern', 'M', 1920),
    person('gp2', 'Bunica Paterna', 'F', 1923),
    person('gp3', 'Bunic Matern', 'M', 1921),
    person('gp4', 'Bunica Materna', 'F', 1926),
    person('f', 'Tata', 'M', 1950),
    person('m', 'Mama', 'F', 1953),
    person('focus', 'Persoana Centrala', 'M', 1978),
    person('sib', 'Frate', 'M', 1980),
    person('sp', 'Sotie', 'F', 1979),
    person('spdad', 'Socru', 'M', 1950),
    person('spmom', 'Soacra', 'F', 1954),
    person('k1', 'Copil Unu', 'F', 2005),
    person('k2', 'Copil Doi', 'M', 2009),
  ];
  const edges = [
    ...couple('r_pat', 'gp1', 'gp2', ['f']),
    ...couple('r_mat', 'gp3', 'gp4', ['m']),
    ...couple('r_par', 'f', 'm', ['focus', 'sib']),
    ...couple('r_sp', 'spdad', 'spmom', ['sp']),
    ...couple('r_focus', 'focus', 'sp', ['k1', 'k2']),
  ];
  return { nodes, edges, focus: 'focus' };
}

function wideDescendants() {
  const nodes = [
    person('f', 'Strabunic', 'M', 1930),
    person('m', 'Strabunica', 'F', 1933),
  ];
  const edges = [];
  const kids = [];
  for (let i = 1; i <= 3; i++) {
    const kid = `c${i}`, spouse = `s${i}`;
    nodes.push(person(kid, `Copil ${i}`, i % 2 ? 'M' : 'F', 1955 + i));
    nodes.push(person(spouse, `Partener ${i}`, i % 2 ? 'F' : 'M', 1956 + i));
    kids.push(kid);
    const g1 = `g${i}a`, g2 = `g${i}b`;
    nodes.push(person(g1, `Nepot ${i}A`, 'M', 1980 + i));
    nodes.push(person(g2, `Nepot ${i}B`, 'F', 1983 + i));
    edges.push(...couple(`r_${i}`, i % 2 ? kid : spouse, i % 2 ? spouse : kid, [g1, g2]));
  }
  edges.push(...couple('r_root', 'f', 'm', kids));
  return { nodes, edges, focus: 'f' };
}

const TREES = [
  ['familie nucleară', nuclearFamily()],
  ['trei generații + alianță', threeGenWithInLaws()],
  ['descendenți lați', wideDescendants()],
];

describe('computeTreeLayout — fără suprapuneri reale', () => {
  for (const [name, tree] of TREES) {
    for (const mode of MODES) {
      it(`${name} / mod ${mode}: 0 carduri suprapuse și 0 linii prin carduri`, () => {
        expectNoRealOverlap(tree.nodes, tree.edges, tree.focus, mode);
      });
    }
  }

  it('focus married-in: expandează maxim subarborii partenerului (inclusiv colaterali)', () => {
    const nodes = [
      person('ig1', 'Bunic Iuliana', 'M', 1892),
      person('ig2', 'Bunica Iuliana', 'F', 1895),
      person('ipA', 'Tata Iuliana', 'M', 1922),
      person('iuncle', 'Unchi Iuliana', 'M', 1925),
      person('iunclesp', 'Matusa Iuliana', 'F', 1927),
      person('icousin', 'Var Iuliana', 'M', 1953),
      person('ipB', 'Mama Iuliana', 'F', 1925),
      person('iul', 'Iuliana', 'F', 1955),
      person('is1', 'Frate Iuliana', 'M', 1957),
      person('con', 'Diaconu Constantin', 'M', 1953),
      person('k1', 'Copil Unu', 'M', 1980),
      person('k2', 'Copil Doi', 'F', 1983),
    ];
    const edges = [
      ...couple('rig', 'ig1', 'ig2', ['ipA', 'iuncle']),
      ...couple('runcle', 'iuncle', 'iunclesp', ['icousin']),
      ...couple('rip', 'ipA', 'ipB', ['iul', 'is1']),
      ...couple('rf', 'con', 'iul', ['k1', 'k2']),
    ];
    const layout = layoutFor(nodes, edges, 'con', 'all');
    const r = layout.collisionReport;
    const names = new Set(layout.positionedNodes.filter(n => !n.isGhost).map(n => n.full_name));
    expect(names.has('Tata Iuliana'), 'părinții partenerului vizibili').toBe(true);
    expect(names.has('Frate Iuliana'), 'frații partenerului vizibili').toBe(true);
    expect(names.has('Bunic Iuliana'), 'bunicii partenerului vizibili').toBe(true);
    expect(names.has('Unchi Iuliana'), 'unchiul partenerului (colateral) vizibil').toBe(true);
    expect(names.has('Var Iuliana'), 'vărul partenerului (colateral) vizibil').toBe(true);
    expect(r.nodeOverlaps).toHaveLength(0);
    expect(r.lineNodeCollisions).toHaveLength(0);
  });

  it('validarea finală: 0 suprapuneri noduri/badge-uri și 0 linii prin carduri/badge-uri', () => {
    const { nodes, edges, focus } = threeGenWithInLaws();
    const layout = layoutFor(nodes, edges, focus, 'all');
    const v = layout.finalLayoutValidation;
    expect(v, 'finalLayoutValidation prezent').toBeTruthy();
    expect(v.nodeOverlaps, `noduri suprapuse: ${JSON.stringify(v.nodeOverlaps)}`).toHaveLength(0);
    expect(v.badgeOverlaps, `badge-uri care ating noduri/badge-uri: ${JSON.stringify(v.badgeOverlaps)}`).toHaveLength(0);
    expect(v.edgeNodeIntersections, `linii prin carduri: ${JSON.stringify(v.edgeNodeIntersections)}`).toHaveLength(0);
    expect(v.edgeBadgeIntersections, `linii prin badge-uri: ${JSON.stringify(v.edgeBadgeIntersections)}`).toHaveLength(0);
  });

  it('întoarce un layout valid (noduri poziționate) pe modul all', () => {
    const { nodes, edges, focus } = threeGenWithInLaws();
    const layout = layoutFor(nodes, edges, focus, 'all');
    expect(layout.positionedNodes.length).toBeGreaterThan(0);
    layout.positionedNodes.forEach(n => {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    });
  });
});
