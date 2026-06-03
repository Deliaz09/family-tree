import { NODE_HEIGHT, NODE_WIDTH } from './layoutMetrics';
function construiesteIndexuriLocale(parentEdges, partnerEdges) {
  const childrenOf = new Map();
  const parentsOf = new Map();
  const partnersOf = new Map();
  parentEdges.forEach(e => {
    const p = String(e.source), c = String(e.target);
    if (!childrenOf.has(p)) childrenOf.set(p, new Set());
    if (!parentsOf.has(c)) parentsOf.set(c, new Set());
    childrenOf.get(p).add(c);
    parentsOf.get(c).add(p);
  });
  partnerEdges.forEach(e => {
    const s = String(e.source), t = String(e.target);
    if (!partnersOf.has(s)) partnersOf.set(s, new Set());
    if (!partnersOf.has(t)) partnersOf.set(t, new Set());
    partnersOf.get(s).add(t);
    partnersOf.get(t).add(s);
  });
  return { childrenOf, parentsOf, partnersOf };
}

function distanteDinFocus(focusId, childrenOf, parentsOf, partnersOf) {
  const dist = new Map();
  if (focusId == null) return dist;
  const start = String(focusId);
  const q = [start];
  dist.set(start, 0);
  while (q.length) {
    const id = q.shift();
    const d = dist.get(id);
    const next = new Set([
      ...(childrenOf.get(id) || []),
      ...(parentsOf.get(id) || []),
      ...(partnersOf.get(id) || []),
    ]);
    next.forEach(n => {
      if (dist.has(n)) return;
      dist.set(n, d + 1);
      q.push(n);
    });
  }
  return dist;
}

function colecteazaIdSubarbore(rootId, childrenOf, partnersOf, pos, blockedIds = new Set()) {
  const ids = new Set();
  const q = [String(rootId)];
  while (q.length && ids.size < 500) {
    const id = String(q.shift());
    if (ids.has(id) || blockedIds.has(id) || !pos.has(id)) continue;
    ids.add(id);
    (childrenOf.get(id) || []).forEach(c => q.push(c));
    (partnersOf.get(id) || []).forEach(p => {
      if (!blockedIds.has(p)) q.push(p);
    });
  }
  return ids;
}

function calculeazaCasetaSubarbore(nodeId, childrenOf, partnersOf, pos, blockedIds = new Set()) {
  const ids = colecteazaIdSubarbore(nodeId, childrenOf, partnersOf, pos, blockedIds);
  if (!ids.size) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  ids.forEach(id => {
    const p = pos.get(String(id));
    if (!p) return;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + NODE_WIDTH);
    maxY = Math.max(maxY, p.y + NODE_HEIGHT);
  });
  return { ids, minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function detecteazaMuchiiLungi(parentEdges, posOrMaxLength, maxLengthMaybe) {
  const hasPositionMap = posOrMaxLength instanceof Map;
  const pos = hasPositionMap ? posOrMaxLength : null;
  const maxLength = hasPositionMap ? maxLengthMaybe : posOrMaxLength;
  return (parentEdges || [])
    .map(e => {
      const sourceId = String(e.source), targetId = String(e.target);
      const sp = pos ? pos.get(sourceId) : (e.source?.x != null ? e.source : null);
      const tp = pos ? pos.get(targetId) : (e.target?.x != null ? e.target : null);
      if (!sp || !tp) return null;
      const sourceX = sp.x + NODE_WIDTH / 2;
      const targetX = tp.x + NODE_WIDTH / 2;
      const length = Math.abs(targetX - sourceX);
      return { ...e, sourceId, targetId, sourceX, targetX, length };
    })
    .filter(Boolean)
    .filter(e => e.length > maxLength)
    .sort((a, b) => b.length - a.length);
}
export {
  calculeazaCasetaSubarbore,
  colecteazaIdSubarbore,
  construiesteIndexuriLocale,
  detecteazaMuchiiLungi as detectLongEdges,
  distanteDinFocus,
};
export {
  calculeazaCasetaSubarbore as getSubtreeBoundingBox,
  colecteazaIdSubarbore as collectSubtreeIds,
  construiesteIndexuriLocale as buildLocalIndexes,
  distanteDinFocus as graphDistanceFromFocus,
};
