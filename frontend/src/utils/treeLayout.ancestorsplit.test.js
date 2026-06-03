import { describe, it, expect } from 'vitest';
import { computeTreeLayout, NODE_WIDTH } from './treeLayout';
import { applyViewMode } from './treeViewModes';

function person(id, n, g, b) { return { id, full_name: n, gender: g, birth: b }; }
function pe(r, p, c) { return { source: p, target: c, type: 'BIRTH_PARENT', relation_id: r }; }
function pa(r, a, b) { return { source: a, target: b, type: 'PARTNER', relation_id: r, partner_type: 'married' }; }
function couple(r, m, f, k) { const e = [pa(r, m, f)]; k.forEach(x => { e.push(pe(r, m, x)); e.push(pe(r, f, x)); }); return e; }

function ancestors(nodes, edges, leaf, tag) {
  let cur = [leaf];
  let an = 1900;
  for (let l = 0; l < 2; l++) {
    const next = [];
    cur.forEach((c, i) => {
      const ff = `${tag}${l}_${i}f`, mm = `${tag}${l}_${i}m`;
      nodes.push(person(ff, `${tag}f${l}.${i}`, 'M', an), person(mm, `${tag}m${l}.${i}`, 'F', an + 1));
      edges.push(...couple(`r${tag}${l}${i}`, ff, mm, [c]));
      next.push(ff, mm);
    });
    cur = next; an -= 28;
  }
}

function coupleTreeBothAncestries() {
  const nodes = [person('mama', 'Mama', 'F', 1955), person('tata', 'Tata', 'M', 1953), person('copil', 'Copil', 'M', 1980)];
  const edges = [...couple('r_cuplu', 'tata', 'mama', ['copil'])];
  nodes.push(person('tataia', 'Tataia', 'M', 1928), person('bunica', 'BunicaM', 'F', 1930));
  edges.push(...couple('r_mp', 'tataia', 'bunica', ['mama']));
  nodes.push(person('bunicP', 'BunicP', 'M', 1926), person('bunicaP', 'BunicaP', 'F', 1929));
  edges.push(...couple('r_tp', 'bunicP', 'bunicaP', ['tata']));
  ancestors(nodes, edges, 'tataia', 'TI');
  ancestors(nodes, edges, 'bunica', 'BM');
  ancestors(nodes, edges, 'bunicP', 'BP');
  ancestors(nodes, edges, 'bunicaP', 'BPa');
  return { nodes, edges };
}

function ancestorIds(startId, parentEdges) {
  const parentsOf = new Map();
  parentEdges.forEach(e => {
    const c = String(e.target), p = String(e.source);
    if (!parentsOf.has(c)) parentsOf.set(c, []);
    parentsOf.get(c).push(p);
  });
  const res = new Set();
  const q = [...(parentsOf.get(String(startId)) || [])];
  while (q.length) {
    const id = String(q.shift());
    if (res.has(id)) continue;
    res.add(id);
    (parentsOf.get(id) || []).forEach(p => q.push(String(p)));
  }
  return res;
}

function xRange(ids, pos) {
  let min = Infinity, max = -Infinity;
  ids.forEach(id => { const p = pos.get(String(id)); if (p != null) { min = Math.min(min, p); max = Math.max(max, p + NODE_WIDTH); } });
  return min === Infinity ? null : [min, max];
}

describe('ascendența focusului-membru-de-cuplu nu se amestecă cu a partenerului', () => {
  it('focus pe mama: ascendența mamei și a tatei ocupă intervale x disjuncte', () => {
    const { nodes, edges } = coupleTreeBothAncestries();
    const filtered = applyViewMode(nodes, edges, 'mama', 'all', { lineage: 'self' });
    const layout = computeTreeLayout(filtered.nodes, filtered.edges, { focusId: 'mama', viewMode: 'all', hideUnknowns: true });
    expect(layout.collisionReport.nodeOverlaps).toHaveLength(0);

    const pos = new Map();
    layout.positionedNodes.filter(n => !n.isGhost && n.x != null).forEach(n => pos.set(String(n.id), n.x));
    const parentEdges = filtered.edges.filter(e => ['BIRTH_PARENT', 'STEP_PARENT', 'ADOPTIVE_PARENT'].includes(e.type));

    const mamaAnc = xRange(ancestorIds('mama', parentEdges), pos);
    const tataAnc = xRange(ancestorIds('tata', parentEdges), pos);
    expect(mamaAnc, 'ascendența mamei e poziționată').toBeTruthy();
    expect(tataAnc, 'ascendența tatei e poziționată').toBeTruthy();

    const disjoint = mamaAnc[1] <= tataAnc[0] + 1 || tataAnc[1] <= mamaAnc[0] + 1;
    expect(
      disjoint,
      `ascendența mamei [${Math.round(mamaAnc[0])}..${Math.round(mamaAnc[1])}] se amestecă cu a tatei [${Math.round(tataAnc[0])}..${Math.round(tataAnc[1])}]`,
    ).toBe(true);

    const d = Math.abs(pos.get('tataia') - pos.get('bunica'));
    expect(d, `tataia și bunica (părinții mamei) sunt rupți: distanță ${Math.round(d)}px`).toBeLessThan(NODE_WIDTH * 3);
  });
});
