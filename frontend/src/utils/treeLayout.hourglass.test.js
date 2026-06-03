import { describe, it, expect } from 'vitest';
import { computeTreeLayout } from './treeLayout';
import { applyViewMode } from './treeViewModes';

function person(id, full_name, gender, birth) { return { id, full_name, gender, birth }; }
function partnerEdge(relId, a, b) { return { source: a, target: b, type: 'PARTNER', relation_id: relId, partner_type: 'married' }; }
function couple(relId, manId, womanId, childIds) {
  const edges = [partnerEdge(relId, manId, womanId)];
  childIds.forEach(c => {
    edges.push({ source: manId, target: c, type: 'BIRTH_PARENT', relation_id: relId });
    edges.push({ source: womanId, target: c, type: 'BIRTH_PARENT', relation_id: relId });
  });
  return edges;
}

function balancedHourglassTree(levels = 3) {
  const nodes = [
    person('FO', 'Focus', 'M', 1980),
    person('SP', 'Sotie', 'F', 1981),
    person('CH', 'Copil', 'F', 2010),
  ];
  const edges = [...couple('rDown', 'FO', 'SP', ['CH'])];
  let frontier = ['FO'];
  let rid = 0;
  for (let lvl = 0; lvl < levels; lvl++) {
    const next = [];
    frontier.forEach((childId, idx) => {
      const fa = `${childId}_F`, mo = `${childId}_M`;
      nodes.push(person(fa, `Tata ${lvl}.${idx}`, 'M', 1950 - lvl * 25));
      nodes.push(person(mo, `Mama ${lvl}.${idx}`, 'F', 1952 - lvl * 25));
      edges.push(...couple(`rUp${rid++}`, fa, mo, [childId]));
      next.push(fa, mo);
    });
    frontier = next;
  }
  return { nodes, edges, focus: 'FO' };
}

function hourglassLayout(tree) {
  const opts = { lineage: 'self', maxGenerations: 8, expandedFrontier: new Set() };
  const f = applyViewMode(tree.nodes, tree.edges, tree.focus, 'hourglass', opts);
  return computeTreeLayout(f.nodes, f.edges, { focusId: tree.focus, viewMode: 'hourglass', hideUnknowns: true });
}

describe('clepsidră — ascendenți simetrici pe axa focusului', () => {
  it('pedigree echilibrat: fiecare rând de strămoși e centrat pe axa focusului', () => {
    const tree = balancedHourglassTree(3);
    const layout = hourglassLayout(tree);
    const focus = layout.positionedNodes.find(n => String(n.id) === 'FO');
    expect(focus).toBeTruthy();
    const axis = focus.x + (focus.width || 0) / 2;
    const focusY = focus.y;

    const rows = new Map();
    layout.positionedNodes.forEach(n => {
      if (n.y == null || n.y >= focusY) return;
      const k = Math.round(n.y);
      if (!rows.has(k)) rows.set(k, []);
      rows.get(k).push(n.x + (n.width || 0) / 2);
    });
    expect(rows.size).toBeGreaterThanOrEqual(3);

    for (const [y, centers] of rows) {
      const mid = (Math.min(...centers) + Math.max(...centers)) / 2;
      expect(Math.abs(mid - axis), `rândul y=${y} nu e centrat pe axă (mid=${mid}, axă=${axis})`).toBeLessThan(3);
    }
  });

  it('clepsidra nu produce suprapuneri reale', () => {
    const layout = hourglassLayout(balancedHourglassTree(3));
    const r = layout.collisionReport;
    expect(r).toBeTruthy();
    expect(r.nodeOverlaps, JSON.stringify(r.nodeOverlaps)).toHaveLength(0);
    expect(r.lineNodeCollisions, JSON.stringify(r.lineNodeCollisions)).toHaveLength(0);
  });

  it('partea descendentă rămâne sub focus, neafectată de simetrizarea ascendenților', () => {
    const layout = hourglassLayout(balancedHourglassTree(2));
    const focus = layout.positionedNodes.find(n => String(n.id) === 'FO');
    const child = layout.positionedNodes.find(n => String(n.id) === 'CH');
    expect(child).toBeTruthy();
    expect(child.y).toBeGreaterThan(focus.y);
  });
});
