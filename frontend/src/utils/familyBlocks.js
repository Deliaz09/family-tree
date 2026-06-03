import { detectLayoutCollisions } from './layoutCollision';
import {
  COUPLE_GAP,
  DEFAULT_MAX_EDGE_LENGTH,
  H_GAP,
  NODE_HEIGHT,
  NODE_WIDTH,
} from './layoutMetrics';
import { buildBracketsFromEdges } from './edgeRouting';
import {
  buildLocalIndexes,
  detectLongEdges,
  getSubtreeBoundingBox,
} from './layoutGraph';
function relationIdForParentEdge(e) {
  return e.relation_id != null ? String(e.relation_id) : `pereche_${String(e.source)}`;
}

function relationIdForPartnerEdge(e) {
  if (e.relation_id != null) return String(e.relation_id);
  const s = String(e.source), t = String(e.target);
  return `_anon_${[s, t].sort().join('||')}`;
}

function clonePos(pos) {
  const out = new Map();
  pos.forEach((p, id) => out.set(String(id), { x: p.x, y: p.y }));
  return out;
}

function buildFamilyBlocks(pos, parentEdges, partnerEdges) {
  const blocks = new Map();
  const ensure = (rid) => {
    const key = String(rid);
    if (!blocks.has(key)) {
      blocks.set(key, {
        relationId: key,
        parentIds: new Set(),
        partnerIds: new Set(),
        childIds: new Set(),
      });
    }
    return blocks.get(key);
  };

  parentEdges.forEach(e => {
    const p = String(e.source), c = String(e.target);
    if (!pos.has(p) || !pos.has(c)) return;
    const b = ensure(relationIdForParentEdge(e));
    b.parentIds.add(p);
    b.childIds.add(c);
  });

  partnerEdges.forEach(e => {
    const s = String(e.source), t = String(e.target);
    if (!pos.has(s) || !pos.has(t)) return;
    const b = ensure(relationIdForPartnerEdge(e));
    b.parentIds.add(s);
    b.parentIds.add(t);
    b.partnerIds.add(s);
    b.partnerIds.add(t);
  });

  blocks.forEach(b => {
    const ids = new Set([...b.parentIds, ...b.childIds]);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ids.forEach(id => {
      const p = pos.get(String(id));
      if (!p) return;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + NODE_WIDTH);
      maxY = Math.max(maxY, p.y + NODE_HEIGHT);
    });
    b.box = minX < Infinity ? { minX, minY, maxX, maxY } : null;
  });

  return [...blocks.values()].filter(b => b.childIds.size && b.box);
}

function buildCollisionLinks(pos, nodeMap, partnerEdges) {
  return partnerEdges
    .filter(e => pos.has(String(e.source)) && pos.has(String(e.target)))
    .map(e => {
      const s = String(e.source), t = String(e.target);
      return {
        source: { ...(nodeMap.get(s) || { id: s }), ...pos.get(s), width: NODE_WIDTH, height: NODE_HEIGHT },
        target: { ...(nodeMap.get(t) || { id: t }), ...pos.get(t), width: NODE_WIDTH, height: NODE_HEIGHT },
        type: 'PARTNER',
        relation_id: e.relation_id,
        partner_type: e.partner_type,
      };
    });
}

function childRelationConflicts(pos, parentEdges, partnerEdges, pad = Math.max(H_GAP, 10), indexes = null) {
  const blocks = buildFamilyBlocks(pos, parentEdges, partnerEdges);
  const byParent = new Map();
  blocks.forEach(b => {
    b.parentIds.forEach(pid => {
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(b);
    });
  });

  const conflicts = [];
  byParent.forEach((list, sharedParent) => {
    if (list.length < 2) return;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        let severity = 0;
        a.childIds.forEach(ca => {
          const pa = pos.get(String(ca));
          if (!pa) return;
          b.childIds.forEach(cb => {
            const pb = pos.get(String(cb));
            if (!pb) return;
            let boxA = { minX: pa.x, maxX: pa.x + NODE_WIDTH, minY: pa.y, maxY: pa.y + NODE_HEIGHT };
            let boxB = { minX: pb.x, maxX: pb.x + NODE_WIDTH, minY: pb.y, maxY: pb.y + NODE_HEIGHT };
            if (indexes) {
              const blockedA = new Set([...a.parentIds, ...b.parentIds]);
              const blockedB = new Set([...b.parentIds, ...a.parentIds]);
              const subA = getSubtreeBoundingBox(ca, indexes.childrenOf, indexes.partnersOf, pos, blockedA);
              const subB = getSubtreeBoundingBox(cb, indexes.childrenOf, indexes.partnersOf, pos, blockedB);
              if (subA) boxA = subA;
              if (subB) boxB = subB;
            }
            const yOverlap = Math.min(boxA.maxY, boxB.maxY) - Math.max(boxA.minY, boxB.minY);
            if (yOverlap <= -NODE_HEIGHT * 0.25) return;
            const gap = Math.max(boxA.minX, boxB.minX) - Math.min(boxA.maxX, boxB.maxX);
            if (gap < pad) severity += pad - gap;
          });
        });
        if (severity > 0) conflicts.push({ sharedParent, a, b, severity });
      }
    }
  });

  return conflicts.sort((x, y) => y.severity - x.severity);
}

function axisKind(seg) {
  if (Math.abs(seg.x1 - seg.x2) < 0.001) return 'v';
  if (Math.abs(seg.y1 - seg.y2) < 0.001) return 'h';
  return 'other';
}

function rangeHits(a0, a1, b0, b1, eps = 1) {
  const loA = Math.min(a0, a1), hiA = Math.max(a0, a1);
  const loB = Math.min(b0, b1), hiB = Math.max(b0, b1);
  return Math.min(hiA, hiB) - Math.max(loA, loB) > eps;
}

function axisSegmentsCollide(a, b, eps = 1) {
  const ak = axisKind(a), bk = axisKind(b);
  if (ak === 'v' && bk === 'v') {
    return Math.abs(a.x1 - b.x1) <= eps && rangeHits(a.y1, a.y2, b.y1, b.y2, eps);
  }
  if ((ak === 'v' && bk === 'h') || (ak === 'h' && bk === 'v')) {
    const v = ak === 'v' ? a : b;
    const h = ak === 'h' ? a : b;
    const vx = v.x1, hy = h.y1;
    const vY0 = Math.min(v.y1, v.y2), vY1 = Math.max(v.y1, v.y2);
    const hX0 = Math.min(h.x1, h.x2), hX1 = Math.max(h.x1, h.x2);
    return vx > hX0 + eps && vx < hX1 - eps && hy > vY0 + eps && hy < vY1 - eps;
  }
  return false;
}

function addFamilySegment(out, b, x1, y1, x2, y2) {
  if ([x1, y1, x2, y2].some(v => v == null || Number.isNaN(v))) return;
  if (Math.abs(x1 - x2) < 0.001 && Math.abs(y1 - y2) < 0.001) return;
  out.push({
    relationId: String(b.relationId),
    parentIds: new Set((b.parentIds || []).map(String)),
    childIds: new Set((b.childIds || []).map(String)),
    x1, y1, x2, y2,
  });
}

function relationBracketSegments(brackets) {
  const out = [];
  brackets.forEach(b => {
    if (Array.isArray(b.segments) && b.segments.length) {
      b.segments.forEach(seg => {
        out.push({
          relationId: String(b.relationId),
          parentIds: new Set((b.parentIds || []).map(String)),
          childIds: new Set((b.childIds || []).map(String)),
          x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2,
        });
      });
      return;
    }
    const children = b.childCenters || [];
    if (!children.length || !b.relationId) return;
    const parentX = b.parentRouteX ?? b.parentCx;
    const xs = [parentX, ...children.map(c => c.routeX ?? c.x)];
    const leftX = Math.min(...xs);
    const rightX = Math.max(...xs);
    const busTopY = b.busTopY ?? b.parentY;
    const firstChildY = children[0].y;
    const midY = Math.abs(b.parentCx - children[0].x) < 3 && children.length === 1
      ? null
      : busTopY + (firstChildY - busTopY) * (b.busFrac ?? 0.5);

    if (midY == null) {
      const child = children[0];
      const childX = child.routeX ?? child.x;
      addFamilySegment(out, b, parentX, b.parentY, childX, b.parentY);
      addFamilySegment(out, b, childX, b.parentY, childX, firstChildY);
      addFamilySegment(out, b, childX, firstChildY, child.x, firstChildY);
      return;
    }

    addFamilySegment(out, b, b.parentCx, b.parentY, parentX, b.parentY);
    addFamilySegment(out, b, parentX, b.parentY, parentX, midY);
    addFamilySegment(out, b, leftX, midY, rightX, midY);
    children.forEach(c => {
      const childX = c.routeX ?? c.x;
      addFamilySegment(out, b, childX, midY, childX, c.y);
      addFamilySegment(out, b, childX, c.y, c.x, c.y);
    });
  });
  return out;
}

function relationLineConflicts(pos, parentEdges, partnerEdges) {
  const blocksById = new Map(buildFamilyBlocks(pos, parentEdges, partnerEdges)
    .map(b => [String(b.relationId), b]));
  const segments = relationBracketSegments(buildBracketsFromEdges(pos, parentEdges, partnerEdges));
  const conflicts = new Map();
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i], b = segments[j];
      if (a.relationId === b.relationId) continue;
      const sharedParents = [...a.parentIds].filter(id => b.parentIds.has(id));
      if (!sharedParents.length) continue;
      if ([...a.childIds].some(id => b.childIds.has(id))) continue;
      if (!axisSegmentsCollide(a, b)) continue;
      const key = [a.relationId, b.relationId, sharedParents[0]].sort().join('|');
      const prev = conflicts.get(key) || {
        sharedParent: sharedParents[0],
        a: blocksById.get(a.relationId),
        b: blocksById.get(b.relationId),
        severity: 0,
        kind: 'line-order',
      };
      prev.severity += axisKind(a) === axisKind(b) ? 80 : 45;
      conflicts.set(key, prev);
    }
  }
  return [...conflicts.values()]
    .filter(c => c.a && c.b)
    .sort((a, b) => b.severity - a.severity);
}

function buildValidationLayout(pos, nodeMap, parentEdges, partnerEdges) {
  const brackets = buildBracketsFromEdges(pos, parentEdges, partnerEdges);
  const positionedNodes = [...nodeMap.values()].map(n => {
    const p = pos.get(String(n.id));
    return { ...n, x: p?.x, y: p?.y, width: NODE_WIDTH, height: NODE_HEIGHT };
  });
  return {
    pos,
    nodeMap,
    parentEdges,
    partnerEdges,
    positionedNodes,
    links: buildCollisionLinks(pos, nodeMap, partnerEdges),
    brackets,
  };
}

function ancestorSideViolations(pos, partnerEdges, indexes) {
  const out = [];
  partnerEdges.forEach(e => {
    const a = String(e.source), b = String(e.target);
    const pa = pos.get(a), pb = pos.get(b);
    if (!pa || !pb) return;
    const ax = pa.x + NODE_WIDTH / 2;
    const bx = pb.x + NODE_WIDTH / 2;
    const mid = (ax + bx) / 2;
    const check = (id, otherId, ownX, otherX) => {
      const ids = collectAncestorBranchIds(id, indexes, pos, new Set([otherId]));
      const box = boxForIds(pos, ids);
      if (!box) return;
      const cx = (box.minX + box.maxX) / 2;
      const crossesMid = ownX < otherX ? box.maxX > mid + H_GAP : box.minX < mid - H_GAP;
      const closerToOther = Math.abs(cx - otherX) + H_GAP < Math.abs(cx - ownX);
      if (!crossesMid && !closerToOther) return;
      out.push({
        id,
        otherId,
        relationId: relationIdForPartnerEdge(e),
        severity: (crossesMid ? NODE_WIDTH : NODE_WIDTH * 0.5) +
          Math.max(0, Math.abs(cx - ownX) - Math.abs(cx - otherX)),
      });
    };
    check(a, b, ax, bx);
    check(b, a, bx, ax);
  });
  return out.sort((x, y) => y.severity - x.severity);
}

function relationLongHorizontalPenalty(brackets) {
  let penalty = 0;
  relationBracketSegments(brackets).forEach(seg => {
    if (axisKind(seg) !== 'h') return;
    const len = Math.abs(seg.x2 - seg.x1);
    const limit = NODE_WIDTH * 2.4;
    if (len > limit) penalty += len - limit;
  });
  return penalty;
}

function validateFamilyBlockArrangement(layout, familyBlockId) {
  const pos = layout.pos;
  const parentEdges = layout.parentEdges || [];
  const partnerEdges = layout.partnerEdges || [];
  const indexes = buildLocalIndexes(parentEdges, partnerEdges);
  const report = detectLayoutCollisions(
    { positionedNodes: layout.positionedNodes || [], links: layout.links || [], brackets: layout.brackets || [] },
    { nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT },
  );
  const familyPenalty = childRelationConflicts(pos, parentEdges, partnerEdges)
    .reduce((sum, c) => sum + c.severity, 0);
  const subtreePenalty = childRelationConflicts(pos, parentEdges, partnerEdges, Math.max(NODE_WIDTH * 0.18, H_GAP), indexes)
    .reduce((sum, c) => sum + c.severity, 0);
  const relationLinePenalty = relationLineConflicts(pos, parentEdges, partnerEdges)
    .reduce((sum, c) => sum + c.severity, 0);
  const ancestorConflicts = ancestorBranchConflicts(pos, partnerEdges, indexes);
  const ancestorPenalty = ancestorConflicts
    .reduce((sum, c) => sum + c.severity, 0);
  const sidePenalty = ancestorSideViolations(pos, partnerEdges, indexes)
    .reduce((sum, c) => sum + c.severity, 0);
  const longEdges = detectLongEdges(parentEdges, pos, Math.max(DEFAULT_MAX_EDGE_LENGTH, NODE_WIDTH * 3.2));
  const ancestorEdgeLengths = [];
  parentEdges.forEach(e => {
    const child = String(e.target);
    const parent = String(e.source);
    const childHasPartner = (indexes.partnersOf.get(child) || new Set()).size > 0;
    if (!childHasPartner) return;
    const sp = pos.get(parent), tp = pos.get(child);
    if (!sp || !tp) return;
    ancestorEdgeLengths.push(Math.abs((sp.x + NODE_WIDTH / 2) - (tp.x + NODE_WIDTH / 2)));
  });
  const maxAncestorEdgeLength = ancestorEdgeLengths.length ? Math.max(...ancestorEdgeLengths) : 0;
  const longHorizontalPenalty = relationLongHorizontalPenalty(layout.brackets || []);
  const collapseBadgePenalty = 0;
  const score = familyPenalty * 20 +
    subtreePenalty * 8 +
    relationLinePenalty * 12 +
    ancestorPenalty * 18 +
    sidePenalty * 22 +
    longEdges.length * 30 +
    longHorizontalPenalty * 4 +
    collapseBadgePenalty +
    report.nodeOverlaps.length * 80 +
    report.lineNodeCollisions.length * 12 +
    (report.lineLineCollisions?.length || 0) * 4;
  const hardFailures = report.nodeOverlaps.length +
    report.lineNodeCollisions.length +
    ancestorConflicts.length +
    ancestorSideViolations(pos, partnerEdges, indexes).length +
    longEdges.length;
  return {
    familyBlockId,
    score,
    hardFailures,
    maxAncestorEdgeLength,
    report,
    longEdges,
    ancestorConflicts,
    issues: {
      nodeOverlaps: report.nodeOverlaps.length,
      lineNodeCollisions: report.lineNodeCollisions.length,
      lineLineCollisions: report.lineLineCollisions?.length || 0,
      relationLinePenalty,
      familyPenalty,
      subtreePenalty,
      ancestorPenalty,
      sidePenalty,
      longHorizontalPenalty,
      collapseBadgePenalty,
    },
  };
}

function scoreFamilyPosition(pos, nodeMap, parentEdges, partnerEdges) {
  return validateFamilyBlockArrangement(
    buildValidationLayout(pos, nodeMap, parentEdges, partnerEdges),
    null,
  ).score;
}

function collectAncestorBranchIds(rootId, indexes, pos, blockedIds = new Set()) {
  const root = String(rootId);
  const blocked = new Set([...blockedIds].map(String));
  const ids = new Set();
  const q = [...(indexes.parentsOf.get(root) || [])].map(String);
  while (q.length && ids.size < 300) {
    const id = String(q.shift());
    if (ids.has(id) || blocked.has(id) || !pos.has(id)) continue;
    ids.add(id);
    (indexes.partnersOf.get(id) || new Set()).forEach(p => {
      const pid = String(p);
      if (!ids.has(pid) && !blocked.has(pid) && pos.has(pid)) q.push(pid);
    });
    (indexes.parentsOf.get(id) || new Set()).forEach(p => {
      const pid = String(p);
      if (!ids.has(pid) && !blocked.has(pid) && pos.has(pid)) q.push(pid);
    });
  }
  return ids;
}

function boxForIds(pos, ids) {
  if (!ids?.size) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  ids.forEach(id => {
    const p = pos.get(String(id));
    if (!p) return;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + NODE_WIDTH);
    maxY = Math.max(maxY, p.y + NODE_HEIGHT);
  });
  if (minX === Infinity) return null;
  return { ids, minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function ancestorBranchConflicts(pos, partnerEdges, indexes, pad = Math.max(NODE_WIDTH * 0.2, H_GAP * 2)) {
  const out = [];
  partnerEdges.forEach(e => {
    const a = String(e.source), b = String(e.target);
    if (!pos.has(a) || !pos.has(b)) return;
    const aIds = collectAncestorBranchIds(a, indexes, pos, new Set([b]));
    const bIds = collectAncestorBranchIds(b, indexes, pos, new Set([a]));
    const aBox = boxForIds(pos, aIds);
    const bBox = boxForIds(pos, bIds);
    if (!aBox || !bBox) return;
    const yOverlap = Math.min(aBox.maxY, bBox.maxY) - Math.max(aBox.minY, bBox.minY);
    if (yOverlap <= -NODE_HEIGHT * 0.4) return;
    const gap = Math.max(aBox.minX, bBox.minX) - Math.min(aBox.maxX, bBox.maxX);
    if (gap >= pad) return;
    out.push({
      relationId: relationIdForPartnerEdge(e),
      a,
      b,
      severity: pad - gap + Math.max(0, yOverlap) * 0.25,
    });
  });
  return out.sort((x, y) => y.severity - x.severity);
}

function ancestorPenaltyValue(pos, partnerEdges, indexes) {
  return ancestorBranchConflicts(pos, partnerEdges, indexes)
    .reduce((sum, c) => sum + c.severity, 0);
}

function swapPartnersInBlock(pos, block, sharedParent, indexes) {
  const partners = [...block.partnerIds].filter(id => pos.has(id));
  if (partners.length !== 2 || !partners.includes(String(sharedParent))) return null;
  const [a, b] = partners;
  const pa = pos.get(a), pb = pos.get(b);
  if (!pa || !pb || Math.abs(pa.y - pb.y) > 2) return null;
  const aAnc = collectAncestorBranchIds(a, indexes, pos, new Set([b]));
  const bAnc = collectAncestorBranchIds(b, indexes, pos, new Set([a]));
  for (const id of aAnc) {
    if (bAnc.has(id)) return null;
  }
  const groups = [
    { ids: new Set([a, ...aAnc]), dx: pb.x - pa.x, relationId: block.relationId },
    { ids: new Set([b, ...bAnc]), dx: pa.x - pb.x, relationId: block.relationId },
  ].filter(g => Math.abs(g.dx) > 1);
  if (!groups.length || !canApplyShiftGroups(pos, groups, Math.max(6, H_GAP * 0.5))) return null;
  return applyShiftGroups(pos, groups);
}

function intervalFreeSpace(pos, movingIds, y, fromX, dir, limit = NODE_WIDTH * 8) {
  const moving = new Set([...movingIds].map(String));
  const blockers = [];
  pos.forEach((p, id) => {
    if (moving.has(String(id))) return;
    if (Math.abs(p.y - y) > NODE_HEIGHT * 0.4) return;
    blockers.push({ l: p.x - H_GAP, r: p.x + NODE_WIDTH + H_GAP });
  });
  if (dir < 0) {
    const left = blockers
      .filter(b => b.r <= fromX)
      .sort((a, b) => b.r - a.r)[0];
    return left ? Math.max(0, fromX - left.r) : limit;
  }
  const right = blockers
    .filter(b => b.l >= fromX)
    .sort((a, b) => a.l - b.l)[0];
  return right ? Math.max(0, right.l - fromX) : limit;
}

function canShiftIds(pos, ids, dx, pad = 8) {
  if (!dx || Math.abs(dx) < 1) return false;
  const moving = new Set([...ids].map(String));
  for (const id of moving) {
    const a = pos.get(id);
    if (!a) continue;
    const ax0 = a.x + dx - pad;
    const ax1 = a.x + dx + NODE_WIDTH + pad;
    const ay0 = a.y - pad;
    const ay1 = a.y + NODE_HEIGHT + pad;
    for (const [oid, b] of pos) {
      if (moving.has(String(oid))) continue;
      if (Math.abs((b.y || 0) - (a.y || 0)) > NODE_HEIGHT) continue;
      const bx0 = b.x - pad;
      const bx1 = b.x + NODE_WIDTH + pad;
      const by0 = b.y - pad;
      const by1 = b.y + NODE_HEIGHT + pad;
      if (ax0 < bx1 && ax1 > bx0 && ay0 < by1 && ay1 > by0) return false;
    }
  }
  return true;
}

function shiftedPos(pos, ids, dx) {
  const next = clonePos(pos);
  ids.forEach(id => {
    const p = next.get(String(id));
    if (p) p.x += dx;
  });
  return next;
}

function canApplyShiftGroups(pos, groups, pad = 8) {
  const groupOf = new Map();
  groups.forEach((g, idx) => g.ids.forEach(id => groupOf.set(String(id), idx)));
  for (const [id, p] of pos) {
    const gi = groupOf.get(String(id));
    const dx = gi == null ? 0 : groups[gi].dx;
    const ax0 = p.x + dx - pad;
    const ax1 = p.x + dx + NODE_WIDTH + pad;
    const ay0 = p.y - pad;
    const ay1 = p.y + NODE_HEIGHT + pad;
    for (const [oid, op] of pos) {
      if (String(oid) <= String(id)) continue;
      const gj = groupOf.get(String(oid));
      if (gi != null && gi === gj) continue;
      const odx = gj == null ? 0 : groups[gj].dx;
      if (Math.abs((op.y || 0) - (p.y || 0)) > NODE_HEIGHT) continue;
      const bx0 = op.x + odx - pad;
      const bx1 = op.x + odx + NODE_WIDTH + pad;
      const by0 = op.y - pad;
      const by1 = op.y + NODE_HEIGHT + pad;
      if (ax0 < bx1 && ax1 > bx0 && ay0 < by1 && ay1 > by0) return false;
    }
  }
  return true;
}

function applyShiftGroups(pos, groups) {
  const next = clonePos(pos);
  groups.forEach(g => {
    g.ids.forEach(id => {
      const p = next.get(String(id));
      if (p) p.x += g.dx;
    });
  });
  return next;
}

function relationChildSubtreeBox(pos, block, indexes, extraBlocked = new Set()) {
  const ids = new Set();
  const blocked = new Set([...block.parentIds, ...extraBlocked].map(String));
  block.childIds.forEach(childId => {
    const box = getSubtreeBoundingBox(childId, indexes.childrenOf, indexes.partnersOf, pos, blocked);
    if (box?.ids?.size) box.ids.forEach(id => ids.add(String(id)));
    else ids.add(String(childId));
  });
  if (!ids.size) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  ids.forEach(id => {
    const p = pos.get(String(id));
    if (!p) return;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x + NODE_WIDTH);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y + NODE_HEIGHT);
  });
  if (minX === Infinity) return null;
  return { ids, minX, maxX, minY, maxY, width: maxX - minX };
}

function trySwapFamilyBlockSubtrees(pos, blockA, blockB, indexes) {
  const blocked = new Set([...blockA.parentIds, ...blockB.parentIds]);
  const boxA = relationChildSubtreeBox(pos, blockA, indexes, blocked);
  const boxB = relationChildSubtreeBox(pos, blockB, indexes, blocked);
  if (!boxA || !boxB) return [];
  const overlapY = Math.min(boxA.maxY, boxB.maxY) - Math.max(boxA.minY, boxB.minY);
  if (overlapY <= -NODE_HEIGHT * 0.5) return [];

  const gap = Math.max(H_GAP * 2, COUPLE_GAP);
  const aLeft = boxA.minX <= boxB.minX;
  const leftBox = aLeft ? boxA : boxB;
  const rightBox = aLeft ? boxB : boxA;
  const leftBlock = aLeft ? blockA : blockB;
  const rightBlock = aLeft ? blockB : blockA;
  const baseLeft = Math.min(leftBox.minX, rightBox.minX);

  const rightNewLeft = baseLeft;
  const leftNewLeft = rightNewLeft + rightBox.width + gap;
  const groups = [
    { ids: rightBox.ids, dx: rightNewLeft - rightBox.minX, relationId: rightBlock.relationId },
    { ids: leftBox.ids, dx: leftNewLeft - leftBox.minX, relationId: leftBlock.relationId },
  ].filter(g => Math.abs(g.dx) > 1);

  if (!groups.length || !canApplyShiftGroups(pos, groups)) return [];
  return [applyShiftGroups(pos, groups)];
}

function smallPermutations(items, limit = 24) {
  const out = [];
  const used = new Array(items.length).fill(false);
  const cur = [];
  const rec = () => {
    if (out.length >= limit) return;
    if (cur.length === items.length) {
      out.push([...cur]);
      return;
    }
    for (let i = 0; i < items.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      cur.push(items[i]);
      rec();
      cur.pop();
      used[i] = false;
      if (out.length >= limit) return;
    }
  };
  rec();
  return out;
}

function tryPackSharedParentRelationSubtrees(pos, sharedParent, parentEdges, partnerEdges, indexes) {
  const parentPos = pos.get(String(sharedParent));
  if (!parentPos) return [];
  const blocks = buildFamilyBlocks(pos, parentEdges, partnerEdges)
    .filter(b => b.parentIds.has(String(sharedParent)));
  if (blocks.length < 2 || blocks.length > 4) return [];

  const allParents = new Set();
  blocks.forEach(b => b.parentIds.forEach(p => allParents.add(String(p))));
  const data = blocks.map(block => ({
    block,
    box: relationChildSubtreeBox(pos, block, indexes, allParents),
  })).filter(d => d.box && d.box.ids.size);
  if (data.length < 2) return [];

  const gap = Math.max(H_GAP * 2, COUPLE_GAP);
  const currentMin = Math.min(...data.map(d => d.box.minX));
  const currentMax = Math.max(...data.map(d => d.box.maxX));
  const currentCenter = (currentMin + currentMax) / 2;
  const parentCenter = parentPos.x + NODE_WIDTH / 2;
  const currentOrder = [...data].sort((a, b) => a.box.minX - b.box.minX);
  const orders = smallPermutations(data, 6)
    .filter(order => order.some((d, i) => d !== currentOrder[i]));
  const candidates = [];
  const seen = new Set();

  orders.forEach(order => {
    const totalW = order.reduce((sum, d) => sum + d.box.width, 0) + gap * (order.length - 1);
    [currentCenter, parentCenter].forEach(center => {
      let cursor = center - totalW / 2;
      const groups = order.map(d => {
        const dx = cursor - d.box.minX;
        cursor += d.box.width + gap;
        return { ids: d.box.ids, dx, relationId: d.block.relationId };
      }).filter(g => Math.abs(g.dx) > 1);
      if (!groups.length) return;
      const key = groups.map(g => `${g.relationId}:${Math.round(g.dx)}`).join('|');
      if (seen.has(key)) return;
      seen.add(key);
      if (!canApplyShiftGroups(pos, groups)) return;
      candidates.push(applyShiftGroups(pos, groups));
    });
  });

  return candidates;
}

function blockChildrenCenter(pos, block) {
  const xs = [...block.childIds]
    .map(id => pos.get(String(id)))
    .filter(Boolean)
    .map(p => p.x + NODE_WIDTH / 2);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function tryPlaceSeparateChildren(pos, conflict, soloBlock, otherBlock, indexes) {
  if (soloBlock.parentIds.size !== 1) return [];
  const parentId = [...soloBlock.parentIds][0];
  const parentPos = pos.get(parentId);
  if (!parentPos) return [];

  const parentCx = parentPos.x + NODE_WIDTH / 2;
  const otherCx = blockChildrenCenter(pos, otherBlock);
  const preferred = otherCx == null || otherCx >= parentCx ? -1 : 1;
  const sides = [preferred, -preferred];
  const candidates = [];

  soloBlock.childIds.forEach(childId => {
    const childPos = pos.get(String(childId));
    if (!childPos) return;
    const blocked = new Set([parentId, ...otherBlock.parentIds]);
    const box = getSubtreeBoundingBox(childId, indexes.childrenOf, indexes.partnersOf, pos, blocked);
    if (!box || !box.ids.size) return;
    const currentChildCx = childPos.x + NODE_WIDTH / 2;
    sides.forEach(dir => {
      const free = intervalFreeSpace(pos, box.ids, childPos.y, parentCx, dir);
      const targetGap = Math.min(Math.max(NODE_WIDTH + H_GAP * 3, free * 0.55), NODE_WIDTH * 2.3);
      const targetCx = parentCx + dir * targetGap;
      const dx = targetCx - currentChildCx;
      if (!canShiftIds(pos, box.ids, dx)) return;
      candidates.push(shiftedPos(pos, box.ids, dx));
    });
  });

  return candidates;
}

function tryMoveFamilyBlockChildren(pos, block, awayFromBlock, indexes) {
  const ownCx = blockChildrenCenter(pos, block);
  const otherCx = blockChildrenCenter(pos, awayFromBlock);
  if (ownCx == null || otherCx == null) return [];
  const dir = ownCx <= otherCx ? -1 : 1;
  const ids = new Set();
  block.childIds.forEach(childId => {
    const box = getSubtreeBoundingBox(childId, indexes.childrenOf, indexes.partnersOf, pos, new Set(block.parentIds));
    box?.ids?.forEach(id => ids.add(id));
  });
  if (!ids.size) return [];
  const dxs = [dir * (NODE_WIDTH * 0.75), dir * (NODE_WIDTH + H_GAP * 3), dir * (NODE_WIDTH * 1.5)];
  return dxs.filter(dx => canShiftIds(pos, ids, dx)).map(dx => shiftedPos(pos, ids, dx));
}

function improveFamilyCandidate(basePos, conflict, nodeMap, parentEdges, partnerEdges, indexes) {
  const familyBlockId = conflict?.a?.relationId || conflict?.b?.relationId || null;
  const baseValidation = validateFamilyBlockArrangement(
    buildValidationLayout(basePos, nodeMap, parentEdges, partnerEdges),
    familyBlockId,
  );
  const baseScore = baseValidation.score;
  const baseAncestorPenalty = ancestorPenaltyValue(basePos, partnerEdges, indexes);
  let bestPos = basePos;
  let bestScore = baseScore;
  const seen = new Set();
  const queue = [basePos];
  const push = (candidate) => {
    if (!candidate) return;
    const key = [...candidate.entries()]
      .map(([id, p]) => `${id}:${Math.round(p.x)}`)
      .sort()
      .join('|');
    if (seen.has(key)) return;
    seen.add(key);
    queue.push(candidate);
  };

  push(swapPartnersInBlock(basePos, conflict.a, conflict.sharedParent, indexes));
  push(swapPartnersInBlock(basePos, conflict.b, conflict.sharedParent, indexes));

  const initialCount = queue.length;
  for (let i = 0; i < initialCount; i++) {
    const p = queue[i];
    const blocksById = new Map(buildFamilyBlocks(p, parentEdges, partnerEdges)
      .map(b => [b.relationId, b]));
    const a = blocksById.get(conflict.a.relationId);
    const b = blocksById.get(conflict.b.relationId);
    if (!a || !b) continue;
    tryPackSharedParentRelationSubtrees(p, conflict.sharedParent, parentEdges, partnerEdges, indexes).forEach(push);
    trySwapFamilyBlockSubtrees(p, a, b, indexes).forEach(push);
    tryPlaceSeparateChildren(p, conflict, a, b, indexes).forEach(push);
    tryPlaceSeparateChildren(p, conflict, b, a, indexes).forEach(push);
    tryMoveFamilyBlockChildren(p, a, b, indexes).forEach(push);
    tryMoveFamilyBlockChildren(p, b, a, indexes).forEach(push);
  }

  queue.forEach(candidate => {
    if (candidate === basePos) return;
    const validation = validateFamilyBlockArrangement(
      buildValidationLayout(candidate, nodeMap, parentEdges, partnerEdges),
      familyBlockId,
    );
    if (validation.hardFailures > baseValidation.hardFailures) return;
    if (validation.maxAncestorEdgeLength > baseValidation.maxAncestorEdgeLength + NODE_WIDTH * 0.5) return;
    const candidateAncestorPenalty = ancestorPenaltyValue(candidate, partnerEdges, indexes);
    if (candidateAncestorPenalty > baseAncestorPenalty + 1) return;
    const score = validation.score;
    if (score < bestScore - 1) {
      bestScore = score;
      bestPos = candidate;
    }
  });

  return bestPos === basePos ? null : bestPos;
}

function optimizeFamilyBlocks(layout, nodeMap, parentEdges, partnerEdges) {
  const indexes = buildLocalIndexes(parentEdges, partnerEdges);
  let pos = layout.pos;
  for (let pass = 0; pass < 4; pass++) {
    const conflicts = [
      ...relationLineConflicts(pos, parentEdges, partnerEdges),
      ...childRelationConflicts(pos, parentEdges, partnerEdges, Math.max(H_GAP, 10), indexes),
    ].sort((a, b) => b.severity - a.severity);
    if (!conflicts.length) break;
    let changed = false;
    for (const conflict of conflicts.slice(0, 4)) {
      const improved = improveFamilyCandidate(pos, conflict, nodeMap, parentEdges, partnerEdges, indexes);
      if (!improved) continue;
      pos = improved;
      changed = true;
      break;
    }
    if (!changed) break;
  }
  layout.pos = pos;
  return layout;
}

function familyMirrorCandidateUnits(pos, parentEdges, partnerEdges, personToUnit) {
  const blocks = buildFamilyBlocks(pos, parentEdges, partnerEdges);
  const blocksByParent = new Map();
  blocks.forEach(b => {
    b.parentIds.forEach(pid => {
      if (!blocksByParent.has(pid)) blocksByParent.set(pid, []);
      blocksByParent.get(pid).push(b);
    });
  });

  const out = new Set();
  blocksByParent.forEach((list, pid) => {
    const distinct = new Set(list.map(b => b.relationId));
    if (distinct.size < 2) return;
    const ui = personToUnit.get(String(pid));
    if (ui != null) out.add(ui);
    list.forEach(b => {
      b.partnerIds.forEach(partnerId => {
        const partnerUnit = personToUnit.get(String(partnerId));
        if (partnerUnit != null) out.add(partnerUnit);
      });
    });
  });

  return [...out];
}

function mirrorUnitMembers(unit) {
  unit.members = [...unit.members].reverse();
  if (unit._gaps) unit._gaps = [...unit._gaps].reverse();
}
export {
  ancestorPenaltyValue,
  buildValidationLayout,
  buildFamilyBlocks,
  buildFamilyBlocks as construiesteBlocuriFamilie,
  familyMirrorCandidateUnits,
  familyMirrorCandidateUnits as unitatiCandidateOglindireFamilie,
  mirrorUnitMembers,
  mirrorUnitMembers as oglindesteMembriiUnitate,
  optimizeFamilyBlocks,
  optimizeFamilyBlocks as optimizeazaBlocuriFamilie,
  validateFamilyBlockArrangement,
  validateFamilyBlockArrangement as valideazaAsezareBlocFamilie,
};
