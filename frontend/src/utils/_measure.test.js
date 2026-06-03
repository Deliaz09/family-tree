import { describe, it } from 'vitest';
import { computeTreeLayout } from './treeLayout';
import { applyViewMode } from './treeViewModes';

function person(id, full_name, gender, birth) { return { id, full_name, gender, birth }; }
function pEdge(relId, p, c) { return { source: p, target: c, type: 'BIRTH_PARENT', relation_id: relId }; }
function spEdge(relId, a, b) { return { source: a, target: b, type: 'PARTNER', relation_id: relId, partner_type: 'married' }; }
function couple(relId, man, woman, kids) {
  const e = [spEdge(relId, man, woman)];
  kids.forEach(c => { e.push(pEdge(relId, man, c)); e.push(pEdge(relId, woman, c)); });
  return e;
}

function tree() {
  const nodes = [
    person('f', 'Tata', 'M', 1948), person('m', 'Mama', 'F', 1950),
    person('p', 'Focus', 'M', 1975),
    person('sibL', 'Frate Stang', 'M', 1973), person('sibR', 'Frate Drept', 'M', 1977),
    person('sp', 'Sotie', 'F', 1976), person('spL', 'Cumnata Stg', 'F', 1974), person('spR', 'Cumnata Dr', 'F', 1978),
    person('kL', 'Nepot Stg', 'M', 1998), person('kR', 'Nepot Dr', 'F', 2001), person('k1', 'Copil', 'M', 2000),
    person('spf', 'Socru', 'M', 1948), person('spm', 'Soacra', 'F', 1951),
    person('spgf', 'Bunic Sotie', 'M', 1922), person('spgm', 'Bunica Sotie', 'F', 1925),
    person('spLf', 'Socru Stg', 'M', 1946), person('spLm', 'Soacra Stg', 'F', 1949),
    person('spRf', 'Socru Dr', 'M', 1950), person('spRm', 'Soacra Dr', 'F', 1953),
  ];
  const edges = [
    ...couple('r_par', 'f', 'm', ['sibL', 'p', 'sibR']),
    ...couple('r_focus', 'p', 'sp', ['k1']),
    ...couple('r_sibL', 'sibL', 'spL', ['kL']),
    ...couple('r_sibR', 'sibR', 'spR', ['kR']),
    ...couple('r_sp', 'spf', 'spm', ['sp']),
    ...couple('r_spg', 'spgf', 'spgm', ['spf']),
    ...couple('r_spL', 'spLf', 'spLm', ['spL']),
    ...couple('r_spR', 'spRf', 'spRm', ['spR']),
  ];
  return { nodes, edges, focus: 'p' };
}

globalThis.__DBG_CROSS = true;
describe('measure crossings', () => {
  it('all', () => {
    const { nodes, edges, focus } = tree();
    const filtered = applyViewMode(nodes, edges, focus, 'all', { lineage: 'self' });
    const layout = computeTreeLayout(filtered.nodes, filtered.edges, {
      focusId: focus, viewMode: 'all', hideUnknowns: true,
      manuallyExpandedAncestors: new Set(['sp', 'spL', 'spR']),
    });
    const r = layout.collisionReport;
    const nm = new Map(nodes.map(n => [n.id, n.full_name]));
    const lbl = (ids) => (ids || []).map(o => nm.get(o) || o).join('+');
    // eslint-disable-next-line no-console
    console.log(`MEASURE lineLine=${r.lineLineCollisions.length} nodeOv=${r.nodeOverlaps.length} lineNode=${r.lineNodeCollisions.length}`);
    r.lineLineCollisions.forEach(h => console.log(`  X: [${lbl(h.ownersA)}] x [${lbl(h.ownersB)}]`));
  });
});
