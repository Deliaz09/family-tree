import { describe, it, expect } from 'vitest';
import { computeTreeLayout } from './treeLayout';

function person(id, g) { return { id, full_name: id, gender: g, birth: 1900 }; }
function pe(r, p, c) { return { source: p, target: c, type: 'BIRTH_PARENT', relation_id: r }; }
function pa(r, a, b) { return { source: a, target: b, type: 'PARTNER', relation_id: r, partner_type: 'married' }; }
function couple(r, m, f, kids) { const e = [pa(r, m, f)]; kids.forEach(k => { e.push(pe(r, m, k)); e.push(pe(r, f, k)); }); return e; }

function tree() {
  const nodes = [
    person('DAD', 'M'), person('MOM', 'F'),
    person('F', 'M'), person('SIB', 'M'),
    person('FW', 'F'), person('FWdad', 'M'), person('FWmom', 'F'),
    person('SIBW', 'F'), person('SIBWdad', 'M'), person('SIBWmom', 'F'),
    person('CH', 'M'), person('CHW', 'F'), person('CHWdad', 'M'), person('CHWmom', 'F'),
  ];
  const edges = [
    ...couple('rPar', 'DAD', 'MOM', ['F', 'SIB']),
    ...couple('rF', 'F', 'FW', ['CH']),
    ...couple('rFWp', 'FWdad', 'FWmom', ['FW']),
    ...couple('rSIB', 'SIB', 'SIBW', []),
    ...couple('rSIBWp', 'SIBWdad', 'SIBWmom', ['SIBW']),
    ...couple('rCH', 'CH', 'CHW', []),
    ...couple('rCHWp', 'CHWdad', 'CHWmom', ['CHW']),
  ];
  return { nodes, edges };
}

function layoutFor(focus) {
  const t = tree();
  const layout = computeTreeLayout(t.nodes, t.edges, { focusId: focus, viewMode: 'all', hideUnknowns: true });
  const visible = new Set(layout.positionedNodes.map(n => String(n.id)));
  const byId = new Map(layout.positionedNodes.map(n => [String(n.id), n]));
  return { layout, visible, byId };
}

describe('colaps preventiv al cuscrilor fără legătură directă cu focusul', () => {
  it('focus pe F: socrii fratelui și ai copilului se colapsează; socrii focusului rămân', () => {
    const { visible, byId } = layoutFor('F');

    expect(visible.has('FWdad'), 'socrul focusului (FWdad) vizibil').toBe(true);
    expect(visible.has('FWmom'), 'soacra focusului (FWmom) vizibilă').toBe(true);

    expect(visible.has('SIBWdad'), 'socrul fratelui ascuns').toBe(false);
    expect(visible.has('SIBWmom'), 'soacra fratelui ascunsă').toBe(false);
    expect(visible.has('CHWdad'), 'socrul copilului ascuns').toBe(false);
    expect(visible.has('CHWmom'), 'soacra copilului ascunsă').toBe(false);

    expect(byId.get('SIBW')?.hiddenAncestors || 0, 'SIBW are badge ascendenți').toBeGreaterThan(0);
    expect(byId.get('CHW')?.hiddenAncestors || 0, 'CHW are badge ascendenți').toBeGreaterThan(0);

    expect(visible.has('SIBW') && visible.has('CHW')).toBe(true);
  });

  it('focus pe SIB: acum soția LUI e directă (rămâne), iar soția lui F devine indirectă (colaps)', () => {
    const { visible } = layoutFor('SIB');
    expect(visible.has('SIBWdad'), 'socrul lui SIB vizibil (acum direct)').toBe(true);
    expect(visible.has('SIBWmom')).toBe(true);
    expect(visible.has('FWdad'), 'socrul lui F ascuns (acum indirect)').toBe(false);
    expect(visible.has('FWmom')).toBe(false);
  });
});

function spouseFocusTree() {
  const nodes = [
    person('GPa', 'M'), person('GMa', 'F'),
    person('DAD', 'M'), person('MOM', 'F'),
    person('DSIB', 'M'),
    person('DSIBW', 'F'),
    person('DSIBWdad', 'M'), person('DSIBWmom', 'F'),
    person('KID', 'M'),
  ];
  const edges = [
    ...couple('rGP', 'GPa', 'GMa', ['DAD', 'DSIB']),
    ...couple('rC', 'DAD', 'MOM', ['KID']),
    ...couple('rDSIB', 'DSIB', 'DSIBW', []),
    ...couple('rDSIBWp', 'DSIBWdad', 'DSIBWmom', ['DSIBW']),
  ];
  return { nodes, edges };
}

function spouseLayoutFor(focus) {
  const t = spouseFocusTree();
  const layout = computeTreeLayout(t.nodes, t.edges, { focusId: focus, viewMode: 'all', hideUnknowns: true });
  const visible = new Set(layout.positionedNodes.map(n => String(n.id)));
  const byId = new Map(layout.positionedNodes.map(n => [String(n.id), n]));
  return { visible, byId };
}

describe('simetria colapsului de cuscru pe latura tatălui (focus tată vs mamă)', () => {
  it('focus pe TATĂ: ascendența soției fratelui (DSIBW) e colapsată', () => {
    const { visible, byId } = spouseLayoutFor('DAD');
    expect(visible.has('DSIBW'), 'cuscrul însuși vizibil').toBe(true);
    expect(visible.has('DSIBWdad'), 'socrul colapsat').toBe(false);
    expect(visible.has('DSIBWmom'), 'soacra colapsată').toBe(false);
    expect(byId.get('DSIBW')?.hiddenAncestors || 0, 'badge +N pe DSIBW').toBeGreaterThan(0);
  });

  it('focus pe MAMĂ: aceeași ascendență trebuie colapsată (simetric cu tata)', () => {
    const { visible, byId } = spouseLayoutFor('MOM');
    expect(visible.has('DSIBW'), 'cuscrul însuși vizibil').toBe(true);
    expect(visible.has('DSIBWdad'), 'socrul colapsat și la focus pe mamă').toBe(false);
    expect(visible.has('DSIBWmom'), 'soacra colapsată și la focus pe mamă').toBe(false);
    expect(byId.get('DSIBW')?.hiddenAncestors || 0, 'badge +N pe DSIBW și la focus pe mamă').toBeGreaterThan(0);
    expect(visible.has('GPa') && visible.has('GMa'), 'bunicii paterni rămân vizibili').toBe(true);
  });
});
