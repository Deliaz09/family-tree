import { describe, it, expect } from 'vitest';
import { computeTreeLayout, NODE_WIDTH, NODE_HEIGHT } from './treeLayout';

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

function bowtieCase() {
  const nodes = [
    person('ggf', 'Strabunic', 'M', 1900),
    person('ggm', 'Strabunica', 'F', 1903),
    person('gf', 'Bunic patern', 'M', 1925),
    person('gm', 'Bunica paterna', 'F', 1928),
    person('gf2', 'Bunic matern', 'M', 1926),
    person('gm2', 'Bunica materna', 'F', 1930),
    person('dad', 'Tata', 'M', 1950),
    person('mom', 'Mama', 'F', 1953),
    person('focus', 'Zaharia Lacramioara', 'F', 1978),
    person('sp', 'Sot', 'M', 1976),
    person('k1', 'Copil 1', 'F', 2002),
    person('k2', 'Copil 2', 'M', 2005),
    person('k1sp', 'Ginere', 'M', 2000),
    person('gk1', 'Nepot', 'M', 2025),
  ];
  const edges = [
    ...couple('r_gg', 'ggf', 'ggm', ['gf']),
    ...couple('r_gp', 'gf', 'gm', ['dad']),
    ...couple('r_gp2', 'gf2', 'gm2', ['mom']),
    ...couple('r_par', 'dad', 'mom', ['focus']),
    ...couple('r_focus', 'sp', 'focus', ['k1', 'k2']),
    ...couple('r_k1', 'k1sp', 'k1', ['gk1']),
  ];
  return { nodes, edges, focus: 'focus' };
}

function pathSubPaths(d) {
  const tokens = (d || '').match(/[MHVL]|-?\d+(?:\.\d+)?/g) || [];
  let x = 0, y = 0; const subs = []; let cur = null;
  for (let i = 0; i < tokens.length;) {
    const c = tokens[i++];
    if (c === 'M') { x = Number(tokens[i++]); y = Number(tokens[i++]); cur = [{ x, y }]; subs.push(cur); }
    else if (c === 'L') { x = Number(tokens[i++]); y = Number(tokens[i++]); cur.push({ x, y }); }
    else if (c === 'H') { x = Number(tokens[i++]); cur.push({ x, y }); }
    else if (c === 'V') { y = Number(tokens[i++]); cur.push({ x, y }); }
  }
  return subs;
}

function analyze(focusId) {
  const t = bowtieCase();
  const layout = computeTreeLayout(t.nodes, t.edges, { focusId, viewMode: 'bowtie' });
  const cards = layout.positionedNodes.map(n => ({
    id: String(n.id), L: n.x, R: n.x + NODE_WIDTH, T: n.y, B: n.y + NODE_HEIGHT,
  }));
  const TOL = 2;
  const touchesCard = (p) => cards.some(c =>
    p.x >= c.L - TOL && p.x <= c.R + TOL && p.y >= c.T - TOL && p.y <= c.B + TOL &&
    (Math.abs(p.x - c.L) <= TOL || Math.abs(p.x - c.R) <= TOL ||
     Math.abs(p.y - c.T) <= TOL || Math.abs(p.y - c.B) <= TOL));
  const insideForeignCard = (p, owners) => cards.some(c =>
    !owners.includes(c.id) &&
    p.x > c.L + TOL && p.x < c.R - TOL && p.y > c.T + TOL && p.y < c.B - TOL);

  const problems = [];

  layout.links.filter(l => l.type === 'PARTNER').forEach(l => {
    const pts = pathSubPaths(l.pathD).flat();
    if (pts.length < 2) { problems.push(`partner ${l.source.id}-${l.target.id}: fără traseu`); return; }
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (Math.abs(a.x - b.x) > 0.5 && Math.abs(a.y - b.y) > 0.5)
        problems.push(`partner ${l.source.id}-${l.target.id}: segment ne-ortogonal`);
    }
    if (!touchesCard(pts[0])) problems.push(`partner ${l.source.id}-${l.target.id}: START suspendat`);
    if (!touchesCard(pts[pts.length - 1])) problems.push(`partner ${l.source.id}-${l.target.id}: END suspendat`);
  });

  (layout.brackets || []).forEach(b => {
    const childId = (b.childCenters || [])[0]?.id;
    const owners = cards.map(c => c.id).filter(id =>
      id === childId || String(b.relationId).includes(id));
    const subs = pathSubPaths(b.pathD);
    subs.forEach(sub => {
      for (let i = 1; i < sub.length; i++) {
        const a = sub[i - 1], c = sub[i];
        if (Math.abs(a.x - c.x) > 0.5 && Math.abs(a.y - c.y) > 0.5)
          problems.push(`bracket ${b.relationId}: segment ne-ortogonal`);
      }
    });
    (b.segments || []).forEach(s => {
      const mid = { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
      if (insideForeignCard(mid, [childId, ...owners].filter(Boolean)))
        problems.push(`bracket ${b.relationId}: trece printr-un card străin`);
    });
    if (String(b.relationId).startsWith('anc_')) {
      const lastSub = subs[subs.length - 1] || [];
      const tip = lastSub[lastSub.length - 1];
      if (!tip || !touchesCard(tip))
        problems.push(`bracket ${b.relationId}: tija nu atinge cardul copil ${childId}`);
    }
  });

  let overlaps = 0;
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i], c = cards[j];
    if (a.L < c.R - 1 && a.R > c.L + 1 && a.T < c.B - 1 && a.B > c.T + 1) overlaps++;
  }

  return { problems, overlaps, layout };
}

describe('computeTreeLayout — modul papion (bowtie) rutat prin motorul comun', () => {
  it('ascendenți + descendenți pe mai multe generații: ortogonal, fără capete suspendate, fără carduri suprapuse', () => {
    const { problems, overlaps } = analyze('focus');
    expect(problems, problems.join('\n')).toHaveLength(0);
    expect(overlaps, 'carduri suprapuse').toBe(0);
  });

  it('focus pe persoana intrată prin alianță (ginere): aceleași garanții', () => {
    const { problems, overlaps } = analyze('k1sp');
    expect(problems, problems.join('\n')).toHaveLength(0);
    expect(overlaps, 'carduri suprapuse').toBe(0);
  });
});
