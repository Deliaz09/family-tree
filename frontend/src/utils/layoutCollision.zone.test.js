import { describe, it, expect } from 'vitest';
import { detectLayoutCollisions } from './layoutCollision';

const hBracket = (x1, x2, y, ownerIds = []) => ({
  relationId: Math.random().toString(36),
  segments: [{ x1, y1: y, x2, y2: y, ownerIds }],
});

const zone = (rootId, ids, minX, maxX, minY, maxY) => ({ rootId, ids, minX, maxX, minY, maxY });

function detect(brackets, subtrees) {
  const layout = { positionedNodes: [], links: [], brackets };
  return detectLayoutCollisions(layout, { nodeWidth: 160, nodeHeight: 200, subtrees });
}

describe('detectLayoutCollisions — linie lungă peste zona altui subarbore', () => {
  const zonaSot = zone('SOT', ['SOT', 'c1', 'c2', 'nepot'], 200, 500, 80, 400);

  it('linie lungă străină care traversează zona → coliziune raportată cu subarborele', () => {
    const r = detect([hBracket(0, 600, 100, ['SOTIE', 'copilSotie'])], [zonaSot]);
    expect(r.lineZoneCollisions.length).toBeGreaterThan(0);
    expect(r.lineZoneCollisions[0].subtree).toBe('SOT');
    expect(r.hasMajorCollisions).toBe(true);
    expect(r.byNodeId.get('SOT')?.has('line-over-subtree')).toBe(true);
  });

  it('linia care APARȚINE subarborelui (toți owner-ii sunt în el) → ignorată', () => {
    const r = detect([hBracket(200, 500, 100, ['SOT', 'c1'])], [zonaSot]);
    expect(r.lineZoneCollisions.length).toBe(0);
  });

  it('linie SCURTĂ (segment intern, nu magistrală) → ignorată', () => {
    const r = detect([hBracket(300, 380, 100, ['SOTIE'])], [zonaSot]);
    expect(r.lineZoneCollisions.length).toBe(0);
  });

  it('linie lungă pe altă generație (y în afara benzii verticale a zonei) → ignorată', () => {
    const r = detect([hBracket(0, 600, 600, ['SOTIE'])], [zonaSot]);
    expect(r.lineZoneCollisions.length).toBe(0);
  });

  it('linie lungă dar disjunctă pe x (doar atinge marginea) → ignorată', () => {
    const r = detect([hBracket(520, 1000, 100, ['SOTIE'])], [zonaSot]);
    expect(r.lineZoneCollisions.length).toBe(0);
  });

  it('fără `subtrees` furnizat → lineZoneCollisions gol (compatibilitate înapoi)', () => {
    const layout = { positionedNodes: [], links: [], brackets: [hBracket(0, 600, 100, ['SOTIE'])] };
    const r = detectLayoutCollisions(layout, { nodeWidth: 160, nodeHeight: 200 });
    expect(r.lineZoneCollisions.length).toBe(0);
  });
});
