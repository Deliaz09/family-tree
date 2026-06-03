import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { computeTreeLayout, NODE_WIDTH } from './treeLayout';
import { applyViewMode } from './treeViewModes';

const GED = resolve(dirname(fileURLToPath(import.meta.url)), '../../../data/washington_529_persoane.ged');

function parseGedcom(text) {
  const indi = new Map();
  const fams = new Map();
  let cur = null, curType = null, inBirt = false;
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^(\d+)\s+(@[^@]+@\s+)?(\S+)(?:\s+(.*))?$/);
    if (!m) continue;
    const level = +m[1];
    const xref = m[2] ? m[2].trim() : null;
    const tag = m[3];
    const val = m[4] || '';
    if (level === 0) {
      inBirt = false;
      if (tag === 'INDI') { cur = { id: xref, full_name: '', gender: '', birth: null }; curType = 'INDI'; indi.set(xref, cur); }
      else if (tag === 'FAM') { cur = { id: xref, husb: null, wife: null, chil: [] }; curType = 'FAM'; fams.set(xref, cur); }
      else { cur = null; curType = null; }
      continue;
    }
    if (!cur) continue;
    if (curType === 'INDI') {
      if (level === 1) inBirt = (tag === 'BIRT');
      if (tag === 'NAME' && !cur.full_name) cur.full_name = val.replace(/\//g, '').replace(/\s+/g, ' ').trim();
      else if (tag === 'SEX') cur.gender = val.trim().startsWith('F') ? 'F' : 'M';
      else if (tag === 'DATE' && inBirt && cur.birth == null) { const y = val.match(/(\d{3,4})\s*$/); if (y) cur.birth = +y[1]; }
    } else if (curType === 'FAM') {
      if (tag === 'HUSB') cur.husb = val.trim();
      else if (tag === 'WIFE') cur.wife = val.trim();
      else if (tag === 'CHIL') cur.chil.push(val.trim());
    }
  }
  return { indi, fams };
}

function buildGraph({ indi, fams }) {
  const nodes = [...indi.values()].map(p => ({ ...p }));
  const edges = [];
  for (const f of fams.values()) {
    if (f.husb && f.wife) edges.push({ source: f.husb, target: f.wife, type: 'PARTNER', relation_id: f.id, partner_type: 'married' });
    f.chil.forEach(c => {
      if (f.husb) edges.push({ source: f.husb, target: c, type: 'BIRTH_PARENT', relation_id: f.id });
      if (f.wife) edges.push({ source: f.wife, target: c, type: 'BIRTH_PARENT', relation_id: f.id });
    });
  }
  return { nodes, edges };
}

const hasFile = existsSync(GED);
const d = hasFile ? describe : describe.skip;

d('arborele Washington — spațierea ascendenților în clepsidră', () => {
  const { nodes, edges } = buildGraph(parseGedcom(readFileSync(GED, 'utf8')));

  it('Elizabeth Gascoigne / clepsidră: cuplurile-strămoși vecine sunt clar separate (nu lipite)', () => {
    const focus = nodes.find(n => /elizabeth/i.test(n.full_name) && /gascoigne/i.test(n.full_name));
    expect(focus).toBeTruthy();
    const filtered = applyViewMode(nodes, edges, focus.id, 'hourglass', { lineage: 'self' });
    const layout = computeTreeLayout(filtered.nodes, filtered.edges, {
      focusId: focus.id, viewMode: 'hourglass', hideUnknowns: true,
    });
    const f = layout.positionedNodes.find(n => String(n.id) === String(focus.id));
    const partners = new Set();
    (layout.links || []).forEach(l => {
      if (l.type === 'PARTNER' && l.source && l.target) {
        partners.add([String(l.source.id), String(l.target.id)].sort().join('|'));
      }
    });
    const rows = new Map();
    layout.positionedNodes.filter(n => !n.isGhost && n.y < f.y - 1).forEach(n => {
      const k = Math.round(n.y);
      if (!rows.has(k)) rows.set(k, []);
      rows.get(k).push(n);
    });
    let globalMin = Infinity;
    for (const list of rows.values()) {
      list.sort((a, b) => a.x - b.x);
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1], b = list[i];
        if (partners.has([String(a.id), String(b.id)].sort().join('|'))) continue;
        globalMin = Math.min(globalMin, b.x - (a.x + (a.width || NODE_WIDTH)));
      }
    }
    expect(globalMin).toBeLessThan(Infinity);
    expect(globalMin, `gap minim inter-cuplu ascendent = ${Math.round(globalMin)}px`)
      .toBeGreaterThanOrEqual(NODE_WIDTH * 0.5 - 1);
  });
});
