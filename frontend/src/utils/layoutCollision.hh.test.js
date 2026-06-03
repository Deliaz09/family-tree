import { describe, it, expect } from 'vitest';
import { detectLayoutCollisions } from './layoutCollision';

const hSeg = (x1, x2, y) => ({ x1, y1: y, x2, y2: y, ownerIds: [] });
const bracket = (seg) => ({ relationId: Math.random().toString(36), segments: [seg] });

function lineLine(segA, segB) {
  const layout = { positionedNodes: [], links: [], brackets: [bracket(segA), bracket(segB)] };
  return detectLayoutCollisions(layout, { nodeWidth: 160, nodeHeight: 200 }).lineLineCollisions.length;
}

describe('detectLayoutCollisions — suprapunere coliniară orizontală', () => {
  it('orizontale pe aceeași generație care se suprapun semnificativ → coliziune', () => {
    expect(lineLine(hSeg(0, 200, 100), hSeg(100, 300, 100))).toBeGreaterThan(0);
  });

  it('orizontale pe aceeași generație dar disjuncte (familii vecine) → fără coliziune', () => {
    expect(lineLine(hSeg(0, 200, 100), hSeg(210, 400, 100))).toBe(0);
  });

  it('orizontale care se suprapun în x dar pe generații diferite → fără coliziune', () => {
    expect(lineLine(hSeg(0, 200, 100), hSeg(100, 300, 140))).toBe(0);
  });

  it('suprapunere mică (sub prag, rotunjire la grilă) → fără coliziune', () => {
    expect(lineLine(hSeg(0, 200, 100), hSeg(190, 400, 100))).toBe(0);
  });

  it('încrucișarea clasică v×h rămâne detectată', () => {
    const v = { x1: 100, y1: 0, x2: 100, y2: 200, ownerIds: [] };
    const h = { x1: 0, y1: 100, x2: 300, y2: 100, ownerIds: [] };
    const layout = { positionedNodes: [], links: [], brackets: [bracket(v), bracket(h)] };
    expect(detectLayoutCollisions(layout, { nodeWidth: 160, nodeHeight: 200 }).lineLineCollisions.length).toBeGreaterThan(0);
  });
});
