import {
  BUS_HORIZONTAL_GAP,
  BUS_VERTICAL_GAP,
  COUPLE_GAP,
  EDGE_GRID,
  GRID_SIZE,
  MAX_EDGE_LENGTH,
  MIN_EDGE_SEGMENT,
  NODE_EDGE_MARGIN,
  NODE_HEIGHT,
  NODE_WIDTH,
} from './layoutMetrics';

function snapEdge(v, grid = GRID_SIZE || EDGE_GRID) {
  return Math.round(v / grid) * grid;
}

function snapPoint(point, grid = GRID_SIZE || EDGE_GRID) {
  return { x: snapEdge(point.x, grid), y: snapEdge(point.y, grid) };
}

function snapPointsToGrid(points, gridSize = GRID_SIZE || EDGE_GRID) {
  return cleanOrthogonalPoints((points || []).map(p => snapPoint(p, gridSize)), gridSize);
}

function nodeSize(node) {
  return {
    width: node?.width || NODE_WIDTH,
    height: node?.height || NODE_HEIGHT,
  };
}

function nodeCenter(node) {
  const { width, height } = nodeSize(node);
  return {
    x: (node?.x || 0) + width / 2,
    y: (node?.y || 0) + height / 2,
  };
}

function computeNodeAnchors(node) {
  const { width, height } = nodeSize(node);
  const x = node?.x || 0;
  const y = node?.y || 0;
  return {
    topCenter: snapPoint({ x: x + width / 2, y }),
    bottomCenter: snapPoint({ x: x + width / 2, y: y + height }),
    leftCenter: snapPoint({ x, y: y + height / 2 }),
    rightCenter: snapPoint({ x: x + width, y: y + height / 2 }),
  };
}

function cleanOrthogonalPoints(points, gridSize = GRID_SIZE || EDGE_GRID) {
  const cleaned = [];
  (points || []).forEach(pt => {
    if (!pt || pt.x == null || pt.y == null || Number.isNaN(pt.x) || Number.isNaN(pt.y)) return;
    const p = snapPoint(pt, gridSize);
    const last = cleaned[cleaned.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.1 && Math.abs(last.y - p.y) < 0.1) return;
    cleaned.push(p);
  });

  for (let i = 1; i < cleaned.length - 1; i++) {
    const a = cleaned[i - 1], b = cleaned[i], c = cleaned[i + 1];
    const collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    if (collinear) {
      cleaned.splice(i, 1);
      i--;
    }
  }

  return cleaned;
}

function pointsToPath(points) {
  const pts = cleanOrthogonalPoints(points);
  if (!pts.length) return '';
  return `M ${pts[0].x} ${pts[0].y}` + pts.slice(1).map(p => ` L ${p.x} ${p.y}`).join('');
}

function segmentsFromPoints(points, ownerIds = []) {
  const pts = cleanOrthogonalPoints(points);
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 1) continue;
    out.push({
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      ownerIds: new Set(ownerIds.map(String)),
    });
  }
  return out;
}

function routeObjectsToSegments(edges = []) {
  const out = [];
  edges.forEach(edge => {
    if (!edge) return;
    if (Array.isArray(edge.segments) && edge.segments.length) {
      edge.segments.forEach(seg => out.push({
        ...seg,
        ownerIds: new Set([...(seg.ownerIds || []), ...(edge.ownerIds || [])].map(String)),
        kind: seg.kind || edge.kind,
        relationId: seg.relationId || edge.relationId,
        childId: seg.childId || edge.childId,
      }));
      return;
    }
    if (Array.isArray(edge.routePoints) && edge.routePoints.length) {
      out.push(...segmentsFromPoints(edge.routePoints, edge.ownerIds || []).map(seg => ({
        ...seg,
        kind: edge.kind,
        relationId: edge.relationId,
        childId: edge.childId,
      })));
    }
    if (Array.isArray(edge.edges)) {
      out.push(...routeObjectsToSegments(edge.edges));
    }
  });
  return out;
}

function relationIdForParentEdge(edge) {
  return edge?.relation_id != null ? String(edge.relation_id) : `pereche_${String(edge?.source)}`;
}

function relationIdForPartnerEdge(edge) {
  if (edge?.relation_id != null) return String(edge.relation_id);
  const s = String(edge?.source?.id ?? edge?.source);
  const t = String(edge?.target?.id ?? edge?.target);
  return `_anon_${[s, t].sort().join('||')}`;
}

function buildNodeMap(layout = {}) {
  const map = new Map();
  if (layout.pos instanceof Map) {
    layout.pos.forEach((p, id) => map.set(String(id), { id: String(id), ...p, width: NODE_WIDTH, height: NODE_HEIGHT }));
  }
  (layout.positionedNodes || []).forEach(n => {
    if (!n || n.id == null || n.x == null || n.y == null) return;
    map.set(String(n.id), { ...n, id: String(n.id), width: n.width || NODE_WIDTH, height: n.height || NODE_HEIGHT });
  });
  return map;
}

function normalizeRelationship(relationship = {}) {
  const relationId = String(
    relationship.relationId ??
    relationship.relationshipId ??
    relationship.relation_id ??
    relationship.id ??
    ''
  );
  const parentIds = (relationship.parentIds || relationship.parents || [])
    .map(id => String(id));
  const partnerIds = (relationship.partnerIds || relationship.partners || [])
    .map(id => String(id));
  const childIds = (relationship.childIds || relationship.childrenIds || relationship.children || [])
    .map(child => String(child?.id ?? child));
  return {
    ...relationship,
    relationId,
    parentIds,
    partnerIds,
    childIds,
  };
}

function relationshipFromLayout(relationship, layout = {}) {
  const base = normalizeRelationship(relationship);
  if (base.parentIds.length || base.partnerIds.length || base.childIds.length) return base;
  const rid = String(relationship);
  const found = (layout.relationships || []).find(r =>
    String(r.relationId ?? r.relationshipId ?? r.relation_id ?? r.id) === rid
  ) || (layout.brackets || []).find(r => String(r.relationId) === rid);
  return normalizeRelationship(found || { relationId: rid });
}

function groupEdgesByRelationship(graph = {}) {
  const blocks = new Map();
  const ensure = (rid) => {
    const key = String(rid);
    if (!blocks.has(key)) {
      blocks.set(key, {
        relationId: key,
        parentIds: new Set(),
        partnerIds: new Set(),
        childIds: new Set(),
        partnerType: 'married',
      });
    }
    return blocks.get(key);
  };

  (graph.brackets || []).forEach(bracket => {
    const rid = String(bracket.relationId ?? bracket.relationshipId ?? bracket.relation_id ?? '');
    if (!rid) return;
    const block = ensure(rid);
    (bracket.parentIds || []).forEach(id => block.parentIds.add(String(id)));
    (bracket.partnerIds || []).forEach(id => block.partnerIds.add(String(id)));
    (bracket.childIds || []).forEach(id => block.childIds.add(String(id)));
    if (bracket.partnerType) block.partnerType = bracket.partnerType;
  });

  (graph.links || []).forEach(link => {
    if (link.type !== 'PARTNER') return;
    const rid = String(link.relation_id ?? link.relationId ?? relationIdForPartnerEdge(link));
    const sourceId = String(link.source?.id ?? link.source);
    const targetId = String(link.target?.id ?? link.target);
    const block = ensure(rid);
    block.parentIds.add(sourceId);
    block.parentIds.add(targetId);
    block.partnerIds.add(sourceId);
    block.partnerIds.add(targetId);
    block.partnerType = link.partner_type || block.partnerType || 'married';
  });

  (graph.edges || []).forEach(edge => {
    if (edge.type === 'PARTNER') {
      const rid = relationIdForPartnerEdge(edge);
      const block = ensure(rid);
      block.parentIds.add(String(edge.source));
      block.parentIds.add(String(edge.target));
      block.partnerIds.add(String(edge.source));
      block.partnerIds.add(String(edge.target));
      block.partnerType = edge.partner_type || block.partnerType || 'married';
      return;
    }
    if (!['BIRTH_PARENT', 'STEP_PARENT', 'ADOPTIVE_PARENT', 'PARENT_CHILD'].includes(edge.type)) return;
    const rid = relationIdForParentEdge(edge);
    const block = ensure(rid);
    block.parentIds.add(String(edge.source));
    block.childIds.add(String(edge.target));
  });

  return [...blocks.values()].map(block => ({
    ...block,
    parentIds: [...block.parentIds],
    partnerIds: [...block.partnerIds],
    childIds: [...block.childIds],
  }));
}

function computeFamilyBlockBounds(relationshipId, layout = {}) {
  const nodeMap = buildNodeMap(layout);
  const rel = relationshipFromLayout(relationshipId, layout);
  const ids = new Set([
    ...(rel.parentIds || []),
    ...(rel.partnerIds || []),
    ...(rel.childIds || []),
  ].map(String));
  if (!ids.size) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  ids.forEach(id => {
    const node = nodeMap.get(id);
    if (!node) return;
    const { width, height } = nodeSize(node);
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + width);
    maxY = Math.max(maxY, node.y + height);
  });
  if (minX === Infinity) return null;

  const childNodes = (rel.childIds || []).map(id => nodeMap.get(String(id))).filter(Boolean);
  const childCenters = childNodes.map(node => computeNodeAnchors(node).topCenter.x).sort((a, b) => a - b);
  const box = {
    relationId: rel.relationId || String(relationshipId),
    ids,
    childIds: new Set((rel.childIds || []).map(String)),
    parentIds: new Set((rel.parentIds || []).map(String)),
    partnerIds: new Set((rel.partnerIds || []).map(String)),
    minX,
    minY,
    maxX,
    maxY,
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    childBusMinX: childCenters.length ? childCenters[0] : minX,
    childBusMaxX: childCenters.length ? childCenters[childCenters.length - 1] : maxX,
  };
  return box;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function expandBox(box, margin = 0) {
  return {
    ...box,
    x: box.x - margin,
    y: box.y - margin,
    width: box.width + margin * 2,
    height: box.height + margin * 2,
    minX: box.minX - margin,
    minY: box.minY - margin,
    maxX: box.maxX + margin,
    maxY: box.maxY + margin,
  };
}

function boxContainsSegment(box, seg, margin = 0) {
  const b = expandBox(box, margin);
  const minX = Math.min(seg.x1, seg.x2);
  const maxX = Math.max(seg.x1, seg.x2);
  const minY = Math.min(seg.y1, seg.y2);
  const maxY = Math.max(seg.y1, seg.y2);
  return minX >= b.minX && maxX <= b.maxX && minY >= b.minY && maxY <= b.maxY;
}

function computeRelationshipAnchors(relationship, layout = {}) {
  const rel = relationshipFromLayout(relationship, layout);
  const nodeMap = buildNodeMap(layout);
  const parentIds = rel.parentIds.length ? rel.parentIds : rel.partnerIds;
  const partnerIds = rel.partnerIds.length ? rel.partnerIds : (parentIds.length === 2 ? parentIds : []);
  const childIds = rel.childIds;
  const parentNodes = parentIds.map(id => nodeMap.get(String(id))).filter(Boolean);
  const partnerNodes = partnerIds.map(id => nodeMap.get(String(id))).filter(Boolean);
  const childNodes = childIds.map(id => nodeMap.get(String(id))).filter(Boolean);

  const parentAnchors = parentNodes.map(node => ({ id: String(node.id), ...computeNodeAnchors(node) }));
  const childAnchors = childNodes.map(node => ({ id: String(node.id), ...computeNodeAnchors(node) }));
  let relationshipCenter = null;
  let partnerBus = null;

  if (partnerNodes.length >= 2) {
    const ordered = partnerNodes.slice(0, 2).sort((a, b) => nodeCenter(a).x - nodeCenter(b).x);
    const left = computeNodeAnchors(ordered[0]);
    const right = computeNodeAnchors(ordered[1]);
    const y = snapEdge(average([left.rightCenter.y, right.leftCenter.y]));
    const x1 = snapEdge(left.rightCenter.x);
    const x2 = snapEdge(right.leftCenter.x);
    partnerBus = {
      start: { x: x1, y },
      end: { x: x2, y },
      y,
      center: snapPoint({ x: (x1 + x2) / 2, y }),
    };
    relationshipCenter = partnerBus.center;
  } else if (parentAnchors.length) {
    relationshipCenter = snapPoint({
      x: average(parentAnchors.map(a => a.bottomCenter.x)),
      y: Math.max(...parentAnchors.map(a => a.bottomCenter.y)),
    });
  } else if (rel.parentCx != null && rel.parentY != null) {
    relationshipCenter = snapPoint({ x: rel.parentCx, y: rel.parentY });
  }

  const parentBottomY = parentAnchors.length
    ? Math.max(...parentAnchors.map(a => a.bottomCenter.y))
    : (relationshipCenter?.y || 0);
  const childTopY = childAnchors.length
    ? Math.min(...childAnchors.map(a => a.topCenter.y))
    : parentBottomY + BUS_VERTICAL_GAP * 2;

  const parentBus = {
    x: relationshipCenter?.x ?? snapEdge(average(parentAnchors.map(a => a.bottomCenter.x))),
    y: snapEdge(parentBottomY + NODE_EDGE_MARGIN),
  };
  const childBus = {
    x: relationshipCenter?.x ?? parentBus.x,
    y: snapEdge(Math.max(parentBus.y + BUS_VERTICAL_GAP, childTopY - BUS_VERTICAL_GAP)),
  };

  return {
    relationId: rel.relationId,
    partnerBus,
    relationshipCenter: relationshipCenter || snapPoint({ x: 0, y: 0 }),
    parentBus,
    childBus,
    parentAnchors,
    childAnchors,
  };
}

function segmentIntersectsBox(seg, box, margin = 0) {
  const bx0 = box.x - margin, bx1 = box.x + box.width + margin;
  const by0 = box.y - margin, by1 = box.y + box.height + margin;
  if (Math.abs(seg.x1 - seg.x2) < 0.001) {
    const x = seg.x1;
    if (x <= bx0 || x >= bx1) return false;
    const sy0 = Math.min(seg.y1, seg.y2), sy1 = Math.max(seg.y1, seg.y2);
    return sy1 > by0 && sy0 < by1;
  }
  if (Math.abs(seg.y1 - seg.y2) < 0.001) {
    const y = seg.y1;
    if (y <= by0 || y >= by1) return false;
    const sx0 = Math.min(seg.x1, seg.x2), sx1 = Math.max(seg.x1, seg.x2);
    return sx1 > bx0 && sx0 < bx1;
  }
  return false;
}

function hasNodeBetweenPartners(leftNode, rightNode, nodes = []) {
  const leftRight = leftNode.x + (leftNode.width || NODE_WIDTH);
  const rightLeft = rightNode.x;
  if (rightLeft - leftRight <= COUPLE_GAP + NODE_EDGE_MARGIN * 2) return false;
  const y = nodeCenter(leftNode).y;
  return nodes.some(n => {
    if (String(n.id) === String(leftNode.id) || String(n.id) === String(rightNode.id)) return false;
    if (Math.abs(nodeCenter(n).y - y) > Math.max(6, NODE_HEIGHT * 0.2)) return false;
    const cx = nodeCenter(n).x;
    return cx > leftRight && cx < rightLeft;
  });
}

function routePartnerEdge(partnerA, partnerB, layout = {}) {
  const nodeMap = buildNodeMap(layout);
  const aId = typeof partnerA === 'object' ? partnerA.id : partnerA;
  const bId = typeof partnerB === 'object' ? partnerB.id : partnerB;
  const a = nodeMap.get(String(aId)) || (typeof partnerA === 'object' ? partnerA : null);
  const b = nodeMap.get(String(bId)) || (typeof partnerB === 'object' ? partnerB : null);
  if (!a || !b) return null;

  const ordered = [a, b].sort((n1, n2) => nodeCenter(n1).x - nodeCenter(n2).x);
  const left = ordered[0], right = ordered[1];
  const leftAnchors = computeNodeAnchors(left);
  const rightAnchors = computeNodeAnchors(right);
  const start = leftAnchors.rightCenter;
  const end = rightAnchors.leftCenter;
  const sameRow = Math.abs(start.y - end.y) <= GRID_SIZE;
  const blocked = sameRow && hasNodeBetweenPartners(left, right, layout.positionedNodes || []);

  let routePoints;
  if (sameRow && !blocked) {
    const y = snapEdge((start.y + end.y) / 2);
    routePoints = [{ x: start.x, y }, { x: end.x, y }];
  } else {
    const topY = snapEdge(Math.min(left.y, right.y) - BUS_VERTICAL_GAP - NODE_EDGE_MARGIN);
    const sideY = blocked ? topY : snapEdge((start.y + end.y) / 2);
    routePoints = [
      start,
      { x: start.x, y: sideY },
      { x: end.x, y: sideY },
      end,
    ];
  }

  routePoints = snapPointsToGrid(routePoints);
  const ownerIds = [left.id, right.id];
  const pathD = pointsToPath(routePoints);
  const segments = segmentsFromPoints(routePoints, ownerIds).map(seg => ({ ...seg, kind: 'partner-line' }));
  return {
    routePoints,
    pathD,
    segments,
    ownerIds,
    anchors: {
      start,
      end,
      relationshipCenter: snapPoint({
        x: average([start.x, end.x]),
        y: average([start.y, end.y]),
      }),
      partnerBus: {
        start: routePoints[0],
        end: routePoints[routePoints.length - 1],
        center: snapPoint({
          x: average([start.x, end.x]),
          y: routePoints.length > 2 ? routePoints[1].y : start.y,
        }),
      },
    },
    badgePoint: snapPoint({
      x: average([start.x, end.x]),
      y: routePoints.length > 2 ? routePoints[1].y : start.y,
    }),
  };
}

function createLocalChildBus(relationshipId, childrenIds, layout = {}) {
  const rel = relationshipFromLayout(relationshipId, layout);
  const nodeMap = buildNodeMap(layout);
  const childAnchors = (childrenIds || rel.childIds || [])
    .map(id => nodeMap.get(String(id)))
    .filter(Boolean)
    .map(node => ({ id: String(node.id), ...computeNodeAnchors(node) }));
  const anchors = computeRelationshipAnchors(rel, layout);
  if (!childAnchors.length) return null;

  const relationCenter = anchors.relationshipCenter;
  const parentBottomY = anchors.parentAnchors.length
    ? Math.max(...anchors.parentAnchors.map(a => a.bottomCenter.y))
    : relationCenter.y;
  const childTopY = Math.min(...childAnchors.map(a => a.topCenter.y));
  const bandTop = Math.min(parentBottomY + NODE_EDGE_MARGIN, childTopY - NODE_EDGE_MARGIN);
  const bandBottom = Math.max(parentBottomY + NODE_EDGE_MARGIN, childTopY - NODE_EDGE_MARGIN);
  const midBusY = (parentBottomY + childTopY) / 2;
  const lane = rel.busLane || 0;
  const LANE_OFFSETS = [0, 1, -1, 2, -2];
  const laneShift = (LANE_OFFSETS[lane] ?? 0) * BUS_HORIZONTAL_GAP;
  const busY = snapEdge(Math.min(Math.max(midBusY + laneShift, bandTop), bandBottom));

  const childXs = childAnchors.map(a => a.topCenter.x);
  const busLeft = snapEdge(Math.min(...childXs));
  const busRight = snapEdge(Math.max(...childXs));
  const stemX = snapEdge(clamp(relationCenter.x, busLeft, busRight));
  return {
    relationId: String(rel.relationId || relationshipId),
    y: busY,
    x1: busLeft,
    x2: busRight,
    center: snapPoint({ x: average(childXs), y: busY }),
    stemX,
    childAnchors,
    source: relationCenter,
  };
}

function createChildBus(relationshipId, childrenIds, layout = {}) {
  return createLocalChildBus(relationshipId, childrenIds, layout);
}

function routeChildrenFromLocalBus(relationshipId, childrenIds, layout = {}) {
  const rel = relationshipFromLayout(relationshipId, layout);
  const bus = createLocalChildBus(rel, childrenIds, layout);
  if (!bus) return [];
  const owners = [...(rel.parentIds || []), ...(rel.partnerIds || []), ...(childrenIds || rel.childIds || [])];
  const source = bus.source;
  const routeEdges = [];

  if (Math.abs(source.y - bus.y) >= 1) {
    const stemX = bus.stemX ?? clamp(source.x, bus.x1, bus.x2);
    const routePoints = Math.abs(stemX - source.x) < GRID_SIZE
      ? snapPointsToGrid([source, { x: source.x, y: bus.y }])
      : snapPointsToGrid([
          source,
          { x: source.x, y: bus.y },
          { x: stemX, y: bus.y },
        ]);
    routeEdges.push({
      kind: 'relationship-stem',
      relationId: bus.relationId,
      routePoints,
      pathD: pointsToPath(routePoints),
      ownerIds: owners,
    });
  }

  const busPoints = snapPointsToGrid([{ x: bus.x1, y: bus.y }, { x: bus.x2, y: bus.y }]);
  routeEdges.push({
    kind: 'child-bus',
    relationId: bus.relationId,
    routePoints: busPoints,
    pathD: pointsToPath(busPoints),
    ownerIds: owners,
  });

  bus.childAnchors.forEach(child => {
    const routePoints = snapPointsToGrid([
      { x: child.topCenter.x, y: bus.y },
      child.topCenter,
    ]);
    routeEdges.push({
      kind: 'child-drop',
      relationId: bus.relationId,
      childId: child.id,
      routePoints,
      pathD: pointsToPath(routePoints),
      ownerIds: [...owners, child.id],
    });
  });

  return routeEdges.map(edge => ({
    ...edge,
    segments: segmentsFromPoints(edge.routePoints, edge.ownerIds).map(seg => ({
      ...seg,
      kind: edge.kind,
      relationId: edge.relationId,
      childId: edge.childId,
    })),
  }));
}

function routeRelationshipChildrenEdges(relationshipId, childrenIds, layout = {}) {
  return routeChildrenFromLocalBus(relationshipId, childrenIds, layout);
}

function routeParentChildEdge(parentId, childId, layout = {}) {
  const nodeMap = buildNodeMap(layout);
  const parent = nodeMap.get(String(parentId));
  const child = nodeMap.get(String(childId));
  if (!parent || !child) return null;
  const start = computeNodeAnchors(parent).bottomCenter;
  const end = computeNodeAnchors(child).topCenter;
  const busY = snapEdge((start.y + end.y) / 2);
  const routePoints = snapPointsToGrid([
    start,
    { x: start.x, y: busY },
    { x: end.x, y: busY },
    end,
  ]);
  return {
    source: String(parentId),
    target: String(childId),
    type: 'PARENT_CHILD',
    routePoints,
    pathD: pointsToPath(routePoints),
    segments: segmentsFromPoints(routePoints, [parentId, childId]).map(seg => ({ ...seg, kind: 'ancestor-edge' })),
    ownerIds: [String(parentId), String(childId)],
  };
}

function assignBusLanes(blocks, layout) {
  const nodeMap = buildNodeMap(layout);
  const groups = new Map();
  blocks.forEach(block => {
    const parentNodes = [...block.parentIds].map(id => nodeMap.get(String(id))).filter(Boolean);
    const childNodes = [...block.childIds].map(id => nodeMap.get(String(id))).filter(Boolean);
    if (!parentNodes.length || !childNodes.length) return;
    const childTop = Math.min(...childNodes.map(n => computeNodeAnchors(n).topCenter.y));
    const key = `${snapEdge(childTop)}`;
    if (!groups.has(key)) groups.set(key, []);
    const childXs = childNodes.map(n => nodeCenter(n).x);
    groups.get(key).push({
      block,
      lo: Math.min(...childXs),
      hi: Math.max(...childXs),
      cx: average(childXs),
    });
  });

  const MAX_LANES = 3;
  const sep = NODE_WIDTH * 3;
  groups.forEach(group => {
    group.sort((a, b) => a.lo - b.lo || a.cx - b.cx);
    let runningHi = -Infinity;
    let lane = 0;
    group.forEach((item, idx) => {
      if (idx === 0 || item.lo - runningHi > sep) lane = 0;
      else lane = (lane + 1) % MAX_LANES;
      item.block.busLane = lane;
      runningHi = Math.max(runningHi, item.hi);
    });
  });
}

function routeRelationshipBlock(block, layout = {}) {
  const rel = normalizeRelationship({
    ...block,
    parentIds: [...(block.parentIds || [])],
    partnerIds: [...(block.partnerIds || [])],
    childIds: [...(block.childIds || [])],
  });
  const childIds = rel.childIds;
  const routeEdges = routeRelationshipChildrenEdges(rel, childIds, {
    ...layout,
    relationships: [rel, ...(layout.relationships || [])],
  });
  const anchors = computeRelationshipAnchors(rel, { ...layout, relationships: [rel] });
  const segments = routeObjectsToSegments(routeEdges);
  const childCenters = anchors.childAnchors.map(a => ({
    id: a.id,
    x: a.topCenter.x,
    y: a.topCenter.y,
    routeX: a.topCenter.x,
    busY: routeEdges.find(e => e.kind === 'child-bus')?.routePoints?.[0]?.y,
  }));
  const childBus = routeEdges.find(e => e.kind === 'child-bus');
  const familyBlockBounds = computeFamilyBlockBounds(rel, { ...layout, relationships: [rel] });
  return {
    relationId: rel.relationId,
    parentIds: rel.parentIds,
    partnerIds: rel.partnerIds,
    childIds,
    busLane: block.busLane ?? rel.busLane ?? 0,
    partnerType: block.partnerType || rel.partnerType || 'married',
    parentCx: anchors.relationshipCenter.x,
    parentY: anchors.relationshipCenter.y,
    parentRouteX: anchors.relationshipCenter.x,
    busY: childBus?.routePoints?.[0]?.y,
    busTopY: anchors.parentBus.y,
    childCenters,
    edges: routeEdges,
    routePoints: routeEdges.flatMap(e => e.routePoints),
    pathD: routeEdges.map(e => e.pathD).filter(Boolean).join(' '),
    segments,
    anchors,
    familyBlockBounds,
  };
}

function routeRelationshipEdges(relationshipId, layout = {}) {
  const blocks = groupEdgesByRelationship(layout);
  const block = blocks.find(b => String(b.relationId) === String(relationshipId)) ||
    relationshipFromLayout(relationshipId, layout);
  if (!block?.childIds?.length) return null;
  return routeRelationshipBlock({
    ...block,
    parentIds: new Set(block.parentIds || []),
    partnerIds: new Set(block.partnerIds || []),
    childIds: new Set(block.childIds || []),
  }, layout);
}

function routePartnerLine(partnerAId, partnerBId, layout = {}) {
  return routePartnerEdge(partnerAId, partnerBId, layout);
}

function routeAncestorEdges(personId, layout = {}) {
  const id = String(personId);
  return (layout.brackets || [])
    .filter(bracket => (bracket.childIds || []).map(String).includes(id))
    .flatMap(bracket => bracket.edges || []);
}

function construiesteConsoleDinMuchii(pos, parentEdges, partnerEdges) {
  const blocks = new Map();
  const ensure = (rid) => {
    const key = String(rid);
    if (!blocks.has(key)) {
      blocks.set(key, {
        relationId: key,
        parentIds: new Set(),
        partnerIds: new Set(),
        childIds: new Set(),
        partnerType: 'married',
      });
    }
    return blocks.get(key);
  };

  (parentEdges || []).forEach(edge => {
    const parentId = String(edge.source);
    const childId = String(edge.target);
    if (!pos.has(parentId) || !pos.has(childId)) return;
    const block = ensure(relationIdForParentEdge(edge));
    block.parentIds.add(parentId);
    block.childIds.add(childId);
  });

  (partnerEdges || []).forEach(edge => {
    const sourceId = String(edge.source);
    const targetId = String(edge.target);
    if (!pos.has(sourceId) || !pos.has(targetId)) return;
    const block = ensure(relationIdForPartnerEdge(edge));
    block.parentIds.add(sourceId);
    block.parentIds.add(targetId);
    block.partnerIds.add(sourceId);
    block.partnerIds.add(targetId);
    block.partnerType = edge.partner_type || block.partnerType || 'married';
  });

  const layout = {
    pos,
    positionedNodes: [...pos.entries()].map(([id, p]) => ({
      id,
      x: p.x,
      y: p.y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
  };
  const relationBlocks = [...blocks.values()].filter(block => block.childIds.size > 0);
  assignBusLanes(relationBlocks, layout);
  return relationBlocks.map(block => routeRelationshipBlock(block, layout));
}

function rectForNode(node) {
  const { width, height } = nodeSize(node);
  return { id: String(node.id), x: node.x, y: node.y, width, height };
}

function detectEdgeNodeIntersections(edges, nodes) {
  const segments = routeObjectsToSegments(edges);
  const boxes = (nodes || [])
    .filter(n => n?.x != null && n?.y != null)
    .map(rectForNode);
  const hits = [];
  segments.forEach((seg, segmentIndex) => {
    boxes.forEach(box => {
      if (seg.ownerIds?.has(String(box.id))) return;
      if (!segmentIntersectsBox(seg, box, NODE_EDGE_MARGIN * 0.5)) return;
      hits.push({ segmentIndex, nodeId: box.id, segment: seg });
    });
  });
  return hits;
}

function detectEdgeBadgeIntersections(edges, badges) {
  const segments = routeObjectsToSegments(edges);
  const boxes = (badges || []).filter(b => b?.x != null && b?.y != null).map((b, i) => ({
    id: String(b.id ?? i),
    x: b.x,
    y: b.y,
    width: b.width || b.w || 0,
    height: b.height || b.h || 0,
  }));
  const hits = [];
  segments.forEach((seg, segmentIndex) => {
    boxes.forEach(box => {
      if (!segmentIntersectsBox(seg, box, NODE_EDGE_MARGIN * 0.5)) return;
      hits.push({ segmentIndex, badgeId: box.id, segment: seg });
    });
  });
  return hits;
}

function segmentLength(seg) {
  return Math.abs(seg.x1 - seg.x2) + Math.abs(seg.y1 - seg.y2);
}

function detectBadEdgeSegments(edges) {
  const bad = [];
  routeObjectsToSegments(edges).forEach((seg, index) => {
    const vertical = Math.abs(seg.x1 - seg.x2) < 0.001;
    const horizontal = Math.abs(seg.y1 - seg.y2) < 0.001;
    if (!vertical && !horizontal) {
      bad.push({ index, kind: 'non-orthogonal', segment: seg });
      return;
    }
    const len = segmentLength(seg);
    if (len > 0 && len < MIN_EDGE_SEGMENT) {
      bad.push({ index, kind: 'too-short', segment: seg });
    }
  });
  return bad;
}

function detectLongEdges(edges, maxLength = MAX_EDGE_LENGTH) {
  const longEdges = [];
  (edges || []).forEach((edge, index) => {
    if (Array.isArray(edge?.edges) && edge.edges.length) {
      edge.edges.forEach((childEdge, childIndex) => {
        const segments = Array.isArray(childEdge.segments) && childEdge.segments.length
          ? childEdge.segments
          : routeObjectsToSegments([childEdge]);
        const length = segments.reduce((sum, seg) => sum + segmentLength(seg), 0);
        if (length > maxLength) {
          longEdges.push({ index, childIndex, edge: childEdge, length, maxLength });
        }
      });
      return;
    }
    const segments = Array.isArray(edge.segments) && edge.segments.length
      ? edge.segments
      : routeObjectsToSegments([edge]);
    const length = segments.reduce((sum, seg) => sum + segmentLength(seg), 0);
    if (length > maxLength) longEdges.push({ index, edge, length, maxLength });
  });
  return longEdges;
}

function scoreEdgeAesthetics(edges, layout = {}) {
  const nodes = layout.positionedNodes || [];
  const badges = layout.badges || [];
  const nodeHits = detectEdgeNodeIntersections(edges, nodes);
  const badgeHits = detectEdgeBadgeIntersections(edges, badges);
  const badSegments = detectBadEdgeSegments(edges);
  const longEdges = detectLongEdges(edges, layout.maxEdgeLength || MAX_EDGE_LENGTH);
  const segments = routeObjectsToSegments(edges);
  const bends = (edges || []).reduce((sum, edge) => {
    const pts = edge.routePoints || [];
    return sum + Math.max(0, pts.length - 2);
  }, 0);
  const totalLength = segments.reduce((sum, seg) => sum + segmentLength(seg), 0);
  const score =
    nodeHits.length * 1000 +
    badgeHits.length * 700 +
    badSegments.length * 120 +
    longEdges.length * 90 +
    bends * 8 +
    totalLength * 0.05;
  return {
    score,
    nodeHits,
    badgeHits,
    badSegments,
    longEdges,
    totalLength,
    bends,
  };
}

function familyBlocksForValidation(layout = {}) {
  const relationships = groupEdgesByRelationship(layout).filter(block => block.childIds.length);
  return relationships
    .map(block => {
      const bounds = computeFamilyBlockBounds(block, {
        ...layout,
        relationships: [block, ...(layout.relationships || [])],
      });
      if (!bounds) return null;
      return {
        ...block,
        bounds,
      };
    })
    .filter(Boolean);
}

function detectGlobalBusMistakes(edges, familyBlocks, margin = BUS_HORIZONTAL_GAP) {
  const byRelation = new Map((familyBlocks || []).map(block => [String(block.relationId), block]));
  const mistakes = [];
  routeObjectsToSegments(edges).forEach((seg, segmentIndex) => {
    const horizontal = Math.abs(seg.y1 - seg.y2) < 0.001;
    if (!horizontal) return;
    const len = Math.abs(seg.x2 - seg.x1);
    const relationId = String(seg.relationId ?? '');
    const block = byRelation.get(relationId);

    if (seg.kind === 'child-bus') {
      if (!block) {
        mistakes.push({ segmentIndex, kind: 'child-bus-without-family-block', segment: seg });
        return;
      }
      const busMin = Math.min(seg.x1, seg.x2);
      const busMax = Math.max(seg.x1, seg.x2);
      const allowedMin = block.bounds.childBusMinX - margin;
      const allowedMax = block.bounds.childBusMaxX + margin;
      const allowedLength = Math.max(0, block.bounds.childBusMaxX - block.bounds.childBusMinX) + margin * 2;
      if (busMin < allowedMin || busMax > allowedMax || len > allowedLength) {
        mistakes.push({
          segmentIndex,
          kind: 'child-bus-outside-local-children',
          relationId,
          segment: seg,
          allowedMin,
          allowedMax,
        });
      }
      return;
    }

    if (len > MAX_EDGE_LENGTH) {
      mistakes.push({ segmentIndex, kind: 'long-horizontal-nonlocal-segment', relationId, segment: seg });
    }
  });
  return mistakes;
}

function detectEdgesCrossingUnrelatedFamilyBlocks(edges, familyBlocks) {
  const crossings = [];
  const blocks = familyBlocks || [];
  routeObjectsToSegments(edges).forEach((seg, segmentIndex) => {
    blocks.forEach(block => {
      if (String(seg.relationId ?? '') === String(block.relationId)) return;
      const owners = seg.ownerIds || new Set();
      const sharesOwner = [...owners].some(id => block.bounds.ids.has(String(id)));
      if (sharesOwner) return;
      if (!segmentIntersectsBox(seg, block.bounds, NODE_EDGE_MARGIN)) return;
      crossings.push({
        segmentIndex,
        relationId: seg.relationId,
        crossedRelationId: block.relationId,
        segment: seg,
      });
    });
  });
  return crossings;
}

function validateLocalEdgeRouting(layout = {}) {
  const familyBlocks = familyBlocksForValidation(layout);
  const edges = [
    ...(layout.links || []).filter(link => link.type === 'PARTNER'),
    ...(layout.brackets || []),
  ];
  const globalBusMistakes = detectGlobalBusMistakes(edges, familyBlocks);
  const unrelatedBlockCrossings = detectEdgesCrossingUnrelatedFamilyBlocks(edges, familyBlocks);
  const nodeHits = detectEdgeNodeIntersections(edges, layout.positionedNodes || []);
  const badgeHits = detectEdgeBadgeIntersections(edges, layout.badges || []);
  const badSegments = detectBadEdgeSegments(edges);
  const longEdges = detectLongEdges(edges, layout.maxEdgeLength || MAX_EDGE_LENGTH);
  const valid = !globalBusMistakes.length &&
    !unrelatedBlockCrossings.length &&
    !nodeHits.length &&
    !badgeHits.length &&
    !badSegments.some(item => item.kind === 'non-orthogonal') &&
    !longEdges.length;
  return {
    valid,
    familyBlocks,
    globalBusMistakes,
    unrelatedBlockCrossings,
    nodeHits,
    badgeHits,
    badSegments,
    longEdges,
  };
}

function rerouteInvalidEdges(layout = {}) {
  const validation = layout.localRoutingValidation || validateLocalEdgeRouting(layout);
  const invalidRelationIds = new Set([
    ...validation.globalBusMistakes.map(item => String(item.relationId || item.segment?.relationId || '')),
    ...validation.unrelatedBlockCrossings.map(item => String(item.relationId || '')),
    ...validation.longEdges.map(item => String(item.edge?.relationId || item.edge?.relation_id || '')),
  ].filter(Boolean));
  if (!invalidRelationIds.size) return layout;

  const shiftedBrackets = (layout.brackets || []).map((bracket, index) => {
    const rid = String(bracket.relationId ?? '');
    if (!invalidRelationIds.has(rid)) return bracket;
    const direction = index % 2 === 0 ? 1 : -1;
    return {
      ...bracket,
      busLane: (bracket.busLane || 0) + direction,
      routingRecovery: [
        ...(bracket.routingRecovery || []),
        'move-local-child-bus',
        'local-subtree-reposition-requested',
        'branch-compact-requested',
        'local-proxy-requested',
        'adaptive-collapse-last-resort',
      ],
    };
  });

  return routeAllEdges({
    ...layout,
    brackets: shiftedBrackets,
    _skipInvalidReroute: true,
  });
}

function routeAllEdges(layout = {}) {
  const nodeMap = buildNodeMap(layout);
  const positionedNodes = layout.positionedNodes || [...nodeMap.values()];
  const links = (layout.links || []).map(link => {
    if (link.type !== 'PARTNER') return link;
    const routed = routePartnerEdge(link.source, link.target, { ...layout, positionedNodes });
    return routed ? { ...link, ...routed } : link;
  });

  const brackets = (layout.brackets || []).map(bracket => {
    const block = {
      ...bracket,
      parentIds: new Set((bracket.parentIds || []).map(String)),
      partnerIds: new Set((bracket.partnerIds || []).map(String)),
      childIds: new Set((bracket.childIds || []).map(String)),
    };
    if (!block.childIds.size) return bracket;
    const routed = routeRelationshipBlock(block, {
      ...layout,
      positionedNodes,
      relationships: [normalizeRelationship({
        ...bracket,
        parentIds: [...block.parentIds],
        partnerIds: [...block.partnerIds],
        childIds: [...block.childIds],
      })],
    });
    return routed.pathD ? { ...bracket, ...routed } : bracket;
  });

  const allRouteEdges = [
    ...links.filter(l => l.type === 'PARTNER'),
    ...brackets,
  ];
  const routedLayout = {
    ...layout,
    links,
    brackets,
    positionedNodes,
  };
  const localRoutingValidation = validateLocalEdgeRouting(routedLayout);
  const diagnostics = scoreEdgeAesthetics(allRouteEdges, { ...layout, positionedNodes });
  const recoveryActions = [];
  if (diagnostics.longEdges.length || !localRoutingValidation.valid) {
    recoveryActions.push('move-local-child-bus');
    recoveryActions.push('local-subtree-reposition-requested');
    recoveryActions.push('branch-compact-requested');
    recoveryActions.push('local-proxy-requested');
    recoveryActions.push('adaptive-collapse-last-resort');
  }

  const nextLayout = {
    ...layout,
    links,
    brackets,
    localRoutingValidation,
    edgeDiagnostics: {
      ...diagnostics,
      localRoutingValidation,
      recoveryActions,
      problematic: diagnostics.nodeHits.length > 0 ||
        diagnostics.badgeHits.length > 0 ||
        diagnostics.badSegments.length > 0 ||
        diagnostics.longEdges.length > 0 ||
        !localRoutingValidation.valid,
    },
    layoutProblematic: diagnostics.longEdges.length > 0 || !localRoutingValidation.valid,
  };
  if (!layout._skipInvalidReroute && !localRoutingValidation.valid) {
    const rerouted = rerouteInvalidEdges(nextLayout);
    const reroutedScore = rerouted.edgeDiagnostics?.score ?? Infinity;
    const currentScore = nextLayout.edgeDiagnostics?.score ?? Infinity;
    return reroutedScore <= currentScore ? rerouted : nextLayout;
  }
  return nextLayout;
}

function optimizeEdgeRoutes(layout = {}) {
  const first = routeAllEdges(layout);
  if (!first.edgeDiagnostics?.problematic) return first;

  const shiftedBrackets = (first.brackets || []).map((bracket, index) => {
    if (!bracket.childIds?.length) return bracket;
    const laneShift = index % 2 === 0 ? 1 : -1;
    return {
      ...bracket,
      busLane: (bracket.busLane || 0) + laneShift,
    };
  });
  const second = routeAllEdges({ ...first, brackets: shiftedBrackets });
  return second.edgeDiagnostics.score < first.edgeDiagnostics.score ? second : first;
}

function rerouteEdgesAfterLayoutChange(layout = {}) {
  return optimizeEdgeRoutes({
    ...layout,
    links: (layout.links || []).map(link => ({ ...link, routePoints: undefined, pathD: undefined, segments: undefined })),
    brackets: (layout.brackets || []).map(bracket => ({ ...bracket })),
  });
}

function ruteazaConsoleOrtogonale(brackets, pos) {
  const layout = {
    pos,
    positionedNodes: [...pos.entries()].map(([id, p]) => ({
      id,
      x: p.x,
      y: p.y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    brackets,
  };
  return routeAllEdges(layout).brackets;
}

export {
  computeNodeAnchors,
  computeRelationshipAnchors,
  computeFamilyBlockBounds,
  construiesteConsoleDinMuchii,
  construiesteConsoleDinMuchii as buildBracketsFromEdges,
  createChildBus,
  createLocalChildBus,
  cleanOrthogonalPoints,
  detectBadEdgeSegments,
  detectEdgeBadgeIntersections,
  detectEdgeNodeIntersections,
  detectEdgesCrossingUnrelatedFamilyBlocks,
  detectGlobalBusMistakes,
  detectLongEdges,
  groupEdgesByRelationship,
  optimizeEdgeRoutes,
  pointsToPath,
  rerouteInvalidEdges,
  rerouteEdgesAfterLayoutChange,
  routeAncestorEdges,
  routeAllEdges,
  routeChildrenFromLocalBus,
  routeParentChildEdge,
  routePartnerEdge,
  routePartnerLine,
  routeRelationshipEdges,
  routeRelationshipChildrenEdges,
  ruteazaConsoleOrtogonale,
  ruteazaConsoleOrtogonale as routeOrthogonalBrackets,
  scoreEdgeAesthetics,
  segmentsFromPoints,
  snapEdge,
  snapPointsToGrid,
  validateLocalEdgeRouting,
};
