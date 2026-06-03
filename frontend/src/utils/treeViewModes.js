function buildIndexes(nodes, edges) {
  const nodeMap = new Map();
  nodes.forEach(n => nodeMap.set(String(n.id), n));

  const partnerEdges = edges.filter(e => e.type === 'PARTNER');
  const parentEdges = edges.filter(e =>
    ['BIRTH_PARENT', 'STEP_PARENT', 'ADOPTIVE_PARENT'].includes(e.type)
  );

  const partnersOf = new Map();
  partnerEdges.forEach(e => {
    const s = String(e.source), t = String(e.target);
    if (!partnersOf.has(s)) partnersOf.set(s, new Set());
    if (!partnersOf.has(t)) partnersOf.set(t, new Set());
    partnersOf.get(s).add(t);
    partnersOf.get(t).add(s);
  });

  const parentsOf = new Map();
  const childrenOf = new Map();
  parentEdges.forEach(e => {
    const p = String(e.source), c = String(e.target);
    if (!parentsOf.has(c)) parentsOf.set(c, new Set());
    if (!childrenOf.has(p)) childrenOf.set(p, new Set());
    parentsOf.get(c).add(p);
    childrenOf.get(p).add(c);
  });

  return { nodeMap, partnersOf, parentsOf, childrenOf };
}

function filterByVisibleIds(nodes, edges, visibleIds) {
  const filteredNodes = nodes.filter(n => visibleIds.has(String(n.id)));
  const filteredEdges = edges.filter(e =>
    visibleIds.has(String(e.source)) && visibleIds.has(String(e.target))
  );
  return { nodes: filteredNodes, edges: filteredEdges };
}

export function filterConnectedComponent(nodes, edges, focusId) {
  if (!focusId) return { nodes, edges };
  const start = String(focusId);
  if (!nodes.some(n => String(n.id) === start)) return { nodes, edges };

  const { partnersOf, parentsOf, childrenOf } = buildIndexes(nodes, edges);
  const visible = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    const neighbors = [
      ...(partnersOf.get(cur) || []),
      ...(parentsOf.get(cur) || []),
      ...(childrenOf.get(cur) || []),
    ];
    neighbors.forEach(n => {
      if (!visible.has(n)) {
        visible.add(n);
        queue.push(n);
      }
    });
  }

  return filterByVisibleIds(nodes, edges, visible);
}

export function filterFocusTree(nodes, edges, focusId) {
  if (!focusId) return { nodes, edges };
  const start = String(focusId);
  if (!nodes.some(n => String(n.id) === start)) return { nodes, edges };

  const { partnersOf, parentsOf, childrenOf } = buildIndexes(nodes, edges);
  const climbUp = (seeds, set) => {
    const q = [...seeds];
    while (q.length) {
      const c = q.shift();
      (parentsOf.get(c) || []).forEach(p => { if (!set.has(p)) { set.add(p); q.push(p); } });
    }
  };
  const climbDown = (seeds, set) => {
    const q = [...seeds];
    while (q.length) {
      const c = q.shift();
      (childrenOf.get(c) || []).forEach(k => { if (!set.has(k)) { set.add(k); q.push(k); } });
    }
  };

  const visible = new Set([start]);
  climbUp([start], visible);

  climbDown([...visible], visible);
  const blood = new Set(visible);

  blood.forEach(id => (partnersOf.get(id) || []).forEach(p => visible.add(p)));

  const inlawAnc = new Set();
  climbUp([...visible].filter(id => !blood.has(id)), inlawAnc);
  inlawAnc.forEach(id => {
    visible.add(id);
    (partnersOf.get(id) || []).forEach(p => visible.add(p));
  });

  return filterByVisibleIds(nodes, edges, visible);
}

export function filterAncestors(nodes, edges, focusId, options = {}) {
  const { includeSpouse = true, maxGenerations = 99, expandedFrontier = null } = options;
  if (!focusId) return { nodes, edges };

  const { partnersOf, parentsOf } = buildIndexes(nodes, edges);
  const visible = new Set([String(focusId)]);
  const expanded = expandedFrontier instanceof Set
    ? expandedFrontier
    : new Set((expandedFrontier || []).map(String));

  if (includeSpouse) {
    (partnersOf.get(String(focusId)) || []).forEach(p => visible.add(p));
  }

  let frontier = new Set([String(focusId)]);
  let g = 0;
  while (frontier.size) {
    const next = new Set();
    frontier.forEach(id => {
      if (g >= maxGenerations && !expanded.has(id)) return;
      (parentsOf.get(id) || []).forEach(p => {
        if (!visible.has(p)) {
          visible.add(p);
          next.add(p);
        }
      });
    });
    if (!next.size) break;
    frontier = next;
    g++;
  }

  const frontierHidden = [];
  visible.forEach(id => {
    const parents = parentsOf.get(id);
    if (!parents) return;
    const hidden = [...parents].filter(p => !visible.has(p)).length;
    if (hidden) frontierHidden.push({ id, count: hidden });
  });

  const out = filterByVisibleIds(nodes, edges, visible);
  out.frontier = frontierHidden;
  return out;
}

export function filterDescendants(nodes, edges, focusId, options = {}) {
  const { includePartners = true, maxGenerations = 99, expandedFrontier = null } = options;
  if (!focusId) return { nodes, edges };

  const { partnersOf, childrenOf } = buildIndexes(nodes, edges);
  const visible = new Set([String(focusId)]);
  const bloodline = new Set([String(focusId)]);
  const expanded = expandedFrontier instanceof Set
    ? expandedFrontier
    : new Set((expandedFrontier || []).map(String));

  if (includePartners) {
    (partnersOf.get(String(focusId)) || []).forEach(p => visible.add(p));
  }

  let frontier = new Set([String(focusId)]);
  let g = 0;
  while (frontier.size) {
    const next = new Set();
    frontier.forEach(id => {
      if (g >= maxGenerations && !expanded.has(id)) return;
      (childrenOf.get(id) || []).forEach(c => {
        if (!visible.has(c)) {
          visible.add(c);
          bloodline.add(c);
          next.add(c);
          if (includePartners) {
            (partnersOf.get(c) || []).forEach(pp => visible.add(pp));
          }
        }
      });
    });
    if (!next.size) break;
    frontier = next;
    g++;
  }

  const frontierHidden = [];
  bloodline.forEach(id => {
    const kids = childrenOf.get(id);
    if (!kids) return;
    const hidden = [...kids].filter(c => !visible.has(c)).length;
    if (hidden) frontierHidden.push({ id, count: hidden });
  });

  const out = filterByVisibleIds(nodes, edges, visible);
  out.frontier = frontierHidden;
  return out;
}

export function filterHourglass(nodes, edges, focusId, options = {}) {
  const {
    includeSpouse = true,
    maxGenerations = 99,
    maxAncestorGen = maxGenerations,
    maxDescendantGen = maxGenerations,
    expandedFrontier = null,
    lineage = 'self',
  } = options;
  if (!focusId) return { nodes, edges };

  if (lineage && lineage !== 'self') {
    return filterDualTree(nodes, edges, focusId, { lineage, includeSpouses: includeSpouse });
  }

  const ancestors = filterAncestors(nodes, edges, focusId, {
    includeSpouse, maxGenerations: maxAncestorGen, expandedFrontier,
  });
  const descendants = filterDescendants(nodes, edges, focusId, {
    includePartners: true, maxGenerations: maxDescendantGen, expandedFrontier,
  });

  const visible = new Set();
  ancestors.nodes.forEach(n => visible.add(String(n.id)));
  descendants.nodes.forEach(n => visible.add(String(n.id)));

  const out = filterByVisibleIds(nodes, edges, visible);

  out.frontier = [
    ...(ancestors.frontier || []).map(f => ({ ...f, dir: 'up' })),
    ...(descendants.frontier || []).map(f => ({ ...f, dir: 'down' })),
  ];
  return out;
}

export function filterDualTree(nodes, edges, focusId, options = {}) {
  const { lineage = 'paternal', includeSpouses = true } = options;
  if (!focusId) return { nodes, edges };

  const { nodeMap, partnersOf, parentsOf, childrenOf } = buildIndexes(nodes, edges);
  const x = String(focusId);
  const genderOf = id => (nodeMap.get(id)?.gender || '').toUpperCase();
  const targetGender = lineage === 'maternal' ? 'F' : 'M';

  function walkLineage() {
    let cur = x;
    const seen = new Set([cur]);
    while (true) {
      const parents = [...(parentsOf.get(cur) || [])];
      if (!parents.length) break;
      let next = parents.find(p => genderOf(p) === targetGender && !seen.has(p));
      if (!next) next = parents.find(p => !seen.has(p));
      if (!next) break;
      seen.add(next);
      cur = next;
    }
    return cur;
  }
  function rootAncestors() {
    const anc = new Set(), stack = [x], seen = new Set([x]);
    while (stack.length) {
      const c = stack.pop();
      (parentsOf.get(c) || []).forEach(p => { if (!seen.has(p)) { seen.add(p); stack.push(p); } });
      if (c !== x && (parentsOf.get(c)?.size || 0) === 0) anc.add(c);
    }
    return anc;
  }
  function descCount(id) {
    let n = 0; const stack = [...(childrenOf.get(id) || [])], seen = new Set();
    while (stack.length) {
      const c = stack.pop(); if (seen.has(c)) continue; seen.add(c); n++;
      (childrenOf.get(c) || []).forEach(cc => { if (!seen.has(cc)) stack.push(cc); });
    }
    return n;
  }

  let y;
  if (lineage === 'longest') {
    const roots = [...rootAncestors()];
    y = roots.length ? roots.reduce((b, r) => (descCount(r) > descCount(b) ? r : b), roots[0]) : x;
  } else {
    y = walkLineage();
  }

  const visible = new Set([x]);
  { const stack = [x]; while (stack.length) { const c = stack.pop();
      (parentsOf.get(c) || []).forEach(p => { if (!visible.has(p)) { visible.add(p); stack.push(p); } }); } }

  visible.add(y);
  { const stack = [y], seen = new Set([y]);
    while (stack.length) { const c = stack.pop();
      (childrenOf.get(c) || []).forEach(ch => {
        visible.add(ch);
        if (!seen.has(ch)) { seen.add(ch); stack.push(ch); }
      }); } }

  if (includeSpouses) {
    [...visible].forEach(v => (partnersOf.get(v) || []).forEach(p => visible.add(p)));
  }

  const out = filterByVisibleIds(nodes, edges, visible);
  out.axisRootId = y;
  out.axisFocusId = x;
  return out;
}

export function filterBowtie(nodes, edges, focusId) {
  if (!focusId) return { nodes, edges };
  const { partnersOf, parentsOf, childrenOf } = buildIndexes(nodes, edges);
  const x = String(focusId);
  const visible = new Set([x]);

  const xKids = childrenOf.get(x) || new Set();
  let spouse = null;
  for (const p of (partnersOf.get(x) || [])) {
    const pk = childrenOf.get(p) || new Set();
    if ([...pk].some(c => xKids.has(c))) { spouse = p; break; }
  }
  if (!spouse) { const ps = [...(partnersOf.get(x) || [])]; spouse = ps[0] || null; }

  (partnersOf.get(x) || new Set()).forEach(p => visible.add(p));

  const urca = (start) => {
    const st = [start], seen = new Set([start]);
    while (st.length) {
      const c = st.pop();
      (parentsOf.get(c) || new Set()).forEach(p => {
        if (!seen.has(p)) { seen.add(p); visible.add(p); st.push(p); }
      });
    }
  };
  urca(x);
  (partnersOf.get(x) || new Set()).forEach(p => urca(p));

  const st = [...(childrenOf.get(x) || new Set())], seen = new Set();
  while (st.length) {
    const c = st.pop();
    if (seen.has(c)) continue;
    seen.add(c); visible.add(c);
    (partnersOf.get(c) || new Set()).forEach(sp => visible.add(sp));
    (childrenOf.get(c) || new Set()).forEach(ch => st.push(ch));
  }

  const out = filterByVisibleIds(nodes, edges, visible);
  out.bowtieFocus = x;
  out.bowtieSpouse = spouse;
  return out;
}

export function applyViewMode(nodes, edges, focusId, mode = 'all', options = {}) {

  if (!focusId) {
    return { nodes, edges };
  }

  if (mode === 'all' || !mode) {
    return filterConnectedComponent(nodes, edges, focusId);
  }

  switch (mode) {
    case 'ancestors':   return filterAncestors(nodes, edges, focusId, options);
    case 'descendants': return filterDescendants(nodes, edges, focusId, options);
    case 'hourglass':   return filterHourglass(nodes, edges, focusId, options);
    case 'dualtree':    return filterDualTree(nodes, edges, focusId, options);
    case 'bowtie':      return filterBowtie(nodes, edges, focusId);
    default:            return { nodes, edges };
  }
}

export const VIEW_MODES = [
  {
    id: 'all',
    label: 'Tot arborele',
    icon: '🌳',
    description: 'Afișează arborele conectat de persoana centrală, cu auto-colaps local doar pentru ramurile problematice.',
  },
  {
    id: 'ancestors',
    label: 'Ascendenți',
    icon: '⬆️',
    description: 'Doar strămoșii direcți ai persoanei centrale. Fără frați, veri sau alte rude colaterale.',
  },
  {
    id: 'descendants',
    label: 'Descendenți',
    icon: '⬇️',
    description: 'Doar urmașii direcți (copii, nepoți, strănepoți) din toate căsătoriile.',
  },
  {
    id: 'hourglass',
    label: 'Clepsidră',
    icon: '⧖',
    description: 'Strămoșii persoanei centrale deasupra (în evantai, tată-stânga / mamă-dreapta) și descendenții dedesubt — formă simetrică de clepsidră.',
  },
  {
    id: 'bowtie',
    label: 'Papion',
    icon: '🎀',
    description: 'Cuplul central în mijloc: strămoșii persoanei pe o latură, ai soțului pe cealaltă, copiii dedesubt. Format simetric, ideal de pus pe perete.',
  },
];
