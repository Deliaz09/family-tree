function casetaPentruNod(nod, latimeImplicita, inaltimeImplicita) {
  return {
    id: String(nod.id),
    x: nod.x,
    y: nod.y,
    w: nod.width || latimeImplicita,
    h: nod.height || inaltimeImplicita,
  };
}

function seSuprapun(a, b, margine = 0) {
  return a.x - margine < b.x + b.w &&
    a.x + a.w + margine > b.x &&
    a.y - margine < b.y + b.h &&
    a.y + a.h + margine > b.y;
}

function segmentTaieCaseta(segment, caseta, toleranta = 1) {
  const x1 = segment.x1, y1 = segment.y1, x2 = segment.x2, y2 = segment.y2;
  const bx0 = caseta.x + toleranta, bx1 = caseta.x + caseta.w - toleranta;
  const by0 = caseta.y + toleranta, by1 = caseta.y + caseta.h - toleranta;

  if (Math.abs(x1 - x2) < 0.001) {
    const x = x1;
    if (x <= bx0 || x >= bx1) return false;
    const sy0 = Math.min(y1, y2), sy1 = Math.max(y1, y2);
    return sy1 > by0 && sy0 < by1;
  }
  if (Math.abs(y1 - y2) < 0.001) {
    const y = y1;
    if (y <= by0 || y >= by1) return false;
    const sx0 = Math.min(x1, x2), sx1 = Math.max(x1, x2);
    return sx1 > bx0 && sx0 < bx1;
  }

  return false;
}

function adaugaSegment(lista, x1, y1, x2, y2, ownerIds = []) {
  if ([x1, y1, x2, y2].some(v => v == null || Number.isNaN(v))) return;
  if (Math.abs(x1 - x2) < 0.001 && Math.abs(y1 - y2) < 0.001) return;
  lista.push({ x1, y1, x2, y2, ownerIds: new Set(ownerIds.map(String)) });
}

function auAcelasiProprietar(a, b) {
  for (const id of a.ownerIds || []) {
    if (b.ownerIds?.has(id)) return true;
  }
  return false;
}

function tipSegment(segment) {
  if (Math.abs(segment.x1 - segment.x2) < 0.001) return 'v';
  if (Math.abs(segment.y1 - segment.y2) < 0.001) return 'h';
  return 'other';
}

function intervaleSuprapuse(a0, a1, b0, b1, toleranta = 1) {
  const loA = Math.min(a0, a1), hiA = Math.max(a0, a1);
  const loB = Math.min(b0, b1), hiB = Math.max(b0, b1);
  return Math.min(hiA, hiB) - Math.max(loA, loB) > toleranta;
}

function segmenteSeIntersecteaza(a, b, toleranta = 1) {
  const ka = tipSegment(a), kb = tipSegment(b);
  if (ka === 'v' && kb === 'v') {
    return Math.abs(a.x1 - b.x1) <= toleranta &&
      intervaleSuprapuse(a.y1, a.y2, b.y1, b.y2, toleranta);
  }
  if ((ka === 'v' && kb === 'h') || (ka === 'h' && kb === 'v')) {
    const v = ka === 'v' ? a : b;
    const h = ka === 'h' ? a : b;
    const vx = v.x1, hy = h.y1;
    const vY0 = Math.min(v.y1, v.y2), vY1 = Math.max(v.y1, v.y2);
    const hX0 = Math.min(h.x1, h.x2), hX1 = Math.max(h.x1, h.x2);
    return vx > hX0 + toleranta && vx < hX1 - toleranta &&
      hy > vY0 + toleranta && hy < vY1 - toleranta;
  }
  return false;
}

function segmenteConsole(consoleRelatii = []) {
  const segmente = [];
  consoleRelatii.forEach((b, i) => {
    if (Array.isArray(b.segments) && b.segments.length) {
      b.segments.forEach(seg => {
        adaugaSegment(
          segmente,
          seg.x1, seg.y1, seg.x2, seg.y2,
          [...(seg.ownerIds || []), `bracket:${i}`],
        );
      });
      return;
    }
    const children = b.childCenters || [];
    if (!children.length) return;
    const parentX = b.parentRouteX ?? b.parentCx;
    const xs = [parentX, ...children.map(c => c.routeX ?? c.x)];
    const leftX = Math.min(...xs);
    const rightX = Math.max(...xs);
    const busTopY = b.busTopY ?? b.parentY;
    const firstChildY = children[0].y;
    const midY = Math.abs(b.parentCx - children[0].x) < 3 && children.length === 1
      ? null
      : busTopY + (firstChildY - busTopY) * (b.busFrac ?? 0.5);
    const owner = [
      `bracket:${i}`,
      ...(b.parentIds || []),
      ...(b.childIds || []),
    ];

    if (midY == null) {
      const child = children[0];
      const childX = child.routeX ?? child.x;
      adaugaSegment(segmente, parentX, b.parentY, childX, b.parentY, owner);
      adaugaSegment(segmente, childX, b.parentY, childX, firstChildY, owner);
      adaugaSegment(segmente, childX, firstChildY, child.x, firstChildY, owner);
      return;
    }
    adaugaSegment(segmente, b.parentCx, b.parentY, parentX, b.parentY, owner);
    adaugaSegment(segmente, parentX, b.parentY, parentX, midY, owner);
    adaugaSegment(segmente, leftX, midY, rightX, midY, owner);
    children.forEach(c => {
      const childX = c.routeX ?? c.x;
      adaugaSegment(segmente, childX, midY, childX, c.y, owner);
      adaugaSegment(segmente, childX, c.y, c.x, c.y, owner);
    });
  });
  return segmente;
}

function segmenteParteneri(legaturi = []) {
  const segmente = [];
  legaturi.forEach(l => {
    if (l.type !== 'PARTNER') return;
    if (Array.isArray(l.segments) && l.segments.length) {
      l.segments.forEach(seg => {
        adaugaSegment(
          segmente,
          seg.x1, seg.y1, seg.x2, seg.y2,
          [...(seg.ownerIds || []), l.source?.id, l.target?.id].filter(Boolean),
        );
      });
      return;
    }
    const s = l.source, t = l.target;
    if (!s || !t) return;
    const sy = s.y + (s.height || 0) / 2;
    const ty = t.y + (t.height || 0) / 2;
    if (Math.abs(sy - ty) > 1) return;
    const left = s.x < t.x ? s : t;
    const right = s.x < t.x ? t : s;
    adaugaSegment(
      segmente,
      left.x + (left.width || 0),
      left.y + (left.height || 0) / 2,
      right.x,
      right.y + (right.height || 0) / 2,
      [s.id, t.id],
    );
  });
  return segmente;
}

export function detecteazaColiziuniLayout(layout, options = {}) {
  const {
    nodeWidth = 160,
    nodeHeight = 200,
    nodePadding = 2,
  } = options;

  const noduriPozitionate = (layout.positionedNodes || [])
    .filter(n => n && n.x != null && n.y != null);
  const casete = noduriPozitionate.map(n => casetaPentruNod(n, nodeWidth, nodeHeight));
  const nodeOverlaps = [];

  const sortedBoxes = [...casete].sort((a, b) => a.x - b.x);
  for (let i = 0; i < sortedBoxes.length; i++) {
    for (let j = i + 1; j < sortedBoxes.length; j++) {
      if (sortedBoxes[j].x > sortedBoxes[i].x + sortedBoxes[i].w + nodePadding) break;
      if (seSuprapun(sortedBoxes[i], sortedBoxes[j], nodePadding)) {
        nodeOverlaps.push({ a: sortedBoxes[i].id, b: sortedBoxes[j].id });
      }
    }
  }

  const segments = [
    ...segmenteConsole(layout.brackets || []),
    ...segmenteParteneri(layout.links || []),
  ];
  const lineNodeCollisions = [];
  segments.forEach((seg, index) => {
    casete.forEach(box => {
      if (seg.ownerIds.has(box.id)) return;
      if (!segmentTaieCaseta(seg, box)) return;
      lineNodeCollisions.push({ segment: index, node: box.id, owners: [...seg.ownerIds] });
    });
  });

  const lineLineCollisions = [];
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (auAcelasiProprietar(segments[i], segments[j])) continue;
      if (!segmenteSeIntersecteaza(segments[i], segments[j])) continue;
      lineLineCollisions.push({
        a: i,
        b: j,
        ownersA: [...segments[i].ownerIds],
        ownersB: [...segments[j].ownerIds],
      });
    }
  }

  const byNodeId = new Map();
  const add = (id, kind) => {
    if (!byNodeId.has(id)) byNodeId.set(id, new Set());
    byNodeId.get(id).add(kind);
  };
  nodeOverlaps.forEach(c => { add(c.a, 'node-overlap'); add(c.b, 'node-overlap'); });
  lineNodeCollisions.forEach(c => add(c.node, 'line-crossing'));

  return {
    nodeOverlaps,
    lineNodeCollisions,
    lineLineCollisions,
    byNodeId,
    hasMajorCollisions: nodeOverlaps.length > 0 ||
      lineNodeCollisions.length > 0 ||
      lineLineCollisions.length > 0,
  };
}

export { detecteazaColiziuniLayout as detectLayoutCollisions };
