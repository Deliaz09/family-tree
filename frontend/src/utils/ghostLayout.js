const PARENT_TYPES = ['BIRTH_PARENT', 'STEP_PARENT', 'ADOPTIVE_PARENT'];

const sanitizeId = s => String(s).replace(/[^A-Za-z0-9_-]/g, '_');
export const edgeRid = e =>
  e.relation_id != null ? String(e.relation_id) : `__pair_${String(e.source)}`;
export const convKey = (relId, childId) => `${relId}|${childId}`;

export function findConvergences(nodes, edges, options = {}) {
  const { preferBirthAsPrimary = true } = options;

  const partnerEdges = edges.filter(e => e.type === 'PARTNER');
  const parentEdges = edges
    .filter(e => PARENT_TYPES.includes(e.type))
    .map(e => ({ ...e, source: String(e.source), target: String(e.target) }));

  const parentsOf = new Map();
  parentEdges.forEach(e => {
    if (!parentsOf.has(e.target)) parentsOf.set(e.target, new Set());
    parentsOf.get(e.target).add(e.source);
  });
  const ancCount = new Map();
  function countAnc(id, seen = new Set()) {
    if (ancCount.has(id)) return ancCount.get(id);
    if (seen.has(id)) return 0;
    seen.add(id);
    let c = 0;
    (parentsOf.get(id) || []).forEach(p => { c += 1 + countAnc(p, seen); });
    ancCount.set(id, c);
    return c;
  }
  nodes.forEach(n => countAnc(String(n.id)));

  const ancMemo = new Map();
  function ancestorsOf(id) {
    if (ancMemo.has(id)) return ancMemo.get(id);
    const res = new Set();
    const stack = [...(parentsOf.get(id) || [])];
    while (stack.length) {
      const p = stack.pop();
      if (res.has(p)) continue;
      res.add(p);
      (parentsOf.get(p) || []).forEach(pp => stack.push(pp));
    }
    ancMemo.set(id, res);
    return res;
  }

  const relations = new Map();
  const ensureRel = rid => {
    if (!relations.has(rid)) relations.set(rid, { parents: new Set(), children: new Map() });
    return relations.get(rid);
  };
  parentEdges.forEach(e => {
    const r = ensureRel(edgeRid(e));
    r.parents.add(e.source);
    r.children.set(e.target, e.type);
  });

  const childRels = new Map();
  relations.forEach((r, rid) => {
    let weight = 0;
    r.parents.forEach(p => { weight += 1 + (ancCount.get(p) || 0); });
    r.children.forEach((etype, cid) => {
      if (!childRels.has(cid)) childRels.set(cid, []);
      childRels.get(cid).push({ rid, type: etype, weight });
    });
  });

  const set = new Set();
  const list = [];
  const addConv = (relationId, childId, relationType, kind) => {
    const k = convKey(relationId, childId);
    if (set.has(k)) return;
    set.add(k);
    list.push({ relationId, childId, relationType, kind });
  };

  childRels.forEach((rels, cid) => {
    if (rels.length <= 1) return;
    const ranked = [...rels].sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      if (preferBirthAsPrimary) {
        const ab = a.type === 'BIRTH_PARENT' ? 0 : 1;
        const bb = b.type === 'BIRTH_PARENT' ? 0 : 1;
        if (ab !== bb) return ab - bb;
      }
      return String(a.rid).localeCompare(String(b.rid));
    });
    for (let i = 1; i < ranked.length; i++) {
      addConv(ranked[i].rid, cid, ranked[i].type, 'child');
    }
  });

  const realParentRelOf = new Map();
  parentEdges.forEach(e => {
    const rid = edgeRid(e);
    if (set.has(convKey(rid, e.target))) return;
    if (!realParentRelOf.has(e.target)) realParentRelOf.set(e.target, new Set());
    realParentRelOf.get(e.target).add(rid);
  });

  const partnerAdj = new Map();
  partnerEdges.forEach(e => {
    const s = String(e.source), t = String(e.target);
    if (!partnerAdj.has(s)) partnerAdj.set(s, new Set());
    if (!partnerAdj.has(t)) partnerAdj.set(t, new Set());
    partnerAdj.get(s).add(t);
    partnerAdj.get(t).add(s);
  });
  const seen = new Set();
  [...partnerAdj.keys()].forEach(start => {
    if (seen.has(start)) return;
    const comp = [], q = [start];
    while (q.length) {
      const cur = q.shift();
      if (seen.has(cur)) continue;
      seen.add(cur);
      comp.push(cur);
      (partnerAdj.get(cur) || []).forEach(p => { if (!seen.has(p)) q.push(p); });
    }
    const withParents = comp.filter(m => (realParentRelOf.get(m) || new Set()).size > 0);
    if (withParents.length <= 1) return;
    withParents.sort((a, b) => {
      const ca = ancCount.get(a) || 0, cb = ancCount.get(b) || 0;
      if (cb !== ca) return cb - ca;
      return String(a).localeCompare(String(b));
    });
    for (let i = 1; i < withParents.length; i++) {
      const m = withParents[i];

      const mAnc = ancestorsOf(m);
      const sharesCommon = withParents.slice(0, i).some(keeper => {
        const kAnc = ancestorsOf(keeper);
        if (kAnc.has(m) || mAnc.has(keeper)) return true;
        for (const a of mAnc) if (kAnc.has(a)) return true;
        return false;
      });
      if (!sharesCommon) continue;
      [...(realParentRelOf.get(m) || [])].forEach(rid => {
        const relType = relations.get(rid)?.children.get(m) || 'BIRTH_PARENT';
        addConv(rid, m, relType, 'spouse');
      });
    }
  });

  return { set, list };
}

export function injectGhosts(nodes, edges, options = {}) {
  const nodeById = new Map();
  nodes.forEach(n => nodeById.set(String(n.id), n));

  const { list } = findConvergences(nodes, edges, options);

  const partnerEdges = edges.filter(e => e.type === 'PARTNER');
  const parentEdges = edges
    .filter(e => PARENT_TYPES.includes(e.type))
    .map(e => ({ ...e, source: String(e.source), target: String(e.target) }));
  const otherEdges = edges.filter(
    e => e.type !== 'PARTNER' && !PARENT_TYPES.includes(e.type)
  );

  const ghostNodes = [];
  const ghostOfReal = new Map();
  const ghostMeta = new Map();
  const rerouteMap = new Map();
  let seq = 0;

  list.forEach(({ relationId, childId, relationType, kind }) => {
    const realNode = nodeById.get(childId) || {};
    const ghostId = `g_${sanitizeId(childId)}_${sanitizeId(relationId)}_${seq++}`;

    ghostNodes.push({
      ...realNode,
      id: ghostId,
      isGhost: true,
      ghostOf: childId,
      ghostKind: kind,
      ghostRelationType: relationType,
    });

    if (!ghostOfReal.has(childId)) ghostOfReal.set(childId, []);
    ghostOfReal.get(childId).push(ghostId);
    ghostMeta.set(ghostId, { ghostOf: childId, kind, relationType });

    rerouteMap.set(convKey(relationId, childId), ghostId);
  });

  const outParentEdges = parentEdges.map(edge => {
    const ghostId = rerouteMap.get(convKey(edgeRid(edge), edge.target));
    return ghostId ? { ...edge, target: ghostId } : edge;
  });

  return {
    nodes: [...nodes, ...ghostNodes],
    edges: [...partnerEdges, ...outParentEdges, ...otherEdges],
    ghostInfo: {
      ghostOfReal, ghostMeta,
      ghostIds: new Set(ghostNodes.map(g => g.id)),
    },
  };
}
