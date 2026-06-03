import { findConvergences, convKey, edgeRid } from './ghostLayout';
import { detectLayoutCollisions } from './layoutCollision';

import {
  applyMetrics,
  BADGE_MARGIN,
  COUPLE_GAP,
  DEFAULT_MAX_EDGE_LENGTH,
  EDGE_BADGE_MARGIN,
  EDGE_NODE_MARGIN,
  H_GAP,
  MIN_GENERATION_GAP,
  MIN_NODE_GAP,
  MIN_SUBTREE_GAP,
  NODE_HEIGHT,
  NODE_WIDTH,
  ROW_HEIGHT,
  ROOT_GAP,
  V_GAP,
} from './layoutMetrics';
import { buildBracketsFromEdges, rerouteEdgesAfterLayoutChange } from './edgeRouting';
import {
  ancestorPenaltyValue,
  buildValidationLayout,
  familyMirrorCandidateUnits,
  mirrorUnitMembers,
  optimizeFamilyBlocks,
  validateFamilyBlockArrangement,
} from './familyBlocks';
import {
  buildLocalIndexes,
  detectLongEdges,
  getSubtreeBoundingBox,
  graphDistanceFromFocus,
} from './layoutGraph';
export { NODE_HEIGHT, NODE_WIDTH } from './layoutMetrics';
export { detectLongEdges } from './layoutGraph';

function hiddenAncestorsLabel(count) {
  if (!count) return '';
  if (count <= 2) return '+ părinți';
  if (count <= 3) return '+ ramură familie';
  return `+ ${count} persoane`;
}

function hiddenDescendantsLabel(count) {
  if (!count) return '';
  if (count <= 3) return '+ ramură familie';
  return `+ ${count} persoane`;
}

function isUnknownPerson(node) {
  const name = (node.full_name || '').trim().toLowerCase();
  const isUnknownName = !name ||
    name === 'necunoscut' || name === 'necunoscută' ||
    name === 'unknown' || name === '?' || name === 'nn';
  const hasNoData = !node.birth && !node.death && !node.photo_url &&
                    !node.photo && !node.note && !node.address &&
                    !node.tel && !node.email && !node.given_name &&
                    !node.surname;
  return isUnknownName && hasNoData;
}

function computeGenerations(nodeMap, partnerEdges, parentEdges) {
  const ids = [...nodeMap.keys()];

  const gen = new Map();
  ids.forEach(id => gen.set(id, 0));

  const coParintiPeCopil = new Map();
  parentEdges.forEach(e => {
    const p = String(e.source), c = String(e.target);
    if (!coParintiPeCopil.has(c)) coParintiPeCopil.set(c, new Set());
    coParintiPeCopil.get(c).add(p);
  });
  const grupuriCoParinti = [...coParintiPeCopil.values()]
    .map(set => [...set])
    .filter(arr => arr.length > 1);

  const copiiPeParinte = new Map();
  parentEdges.forEach(e => {
    const p = String(e.source), c = String(e.target);
    if (!copiiPeParinte.has(p)) copiiPeParinte.set(p, []);
    copiiPeParinte.get(p).push(c);
  });

  const MAX_ITER = ids.length + 50;
  let schimbat = true;
  let iter = 0;
  while (schimbat && iter++ < MAX_ITER) {
    schimbat = false;

    parentEdges.forEach(e => {
      const p = String(e.source), c = String(e.target);
      const necesar = gen.get(p) + 1;
      if (gen.get(c) < necesar) {
        gen.set(c, necesar);
        schimbat = true;
      }
    });

    partnerEdges.forEach(e => {
      const s = String(e.source), t = String(e.target);
      const maxG = Math.max(gen.get(s), gen.get(t));
      if (gen.get(s) < maxG) { gen.set(s, maxG); schimbat = true; }
      if (gen.get(t) < maxG) { gen.set(t, maxG); schimbat = true; }
    });

    grupuriCoParinti.forEach(parinti => {
      const maxG = Math.max(...parinti.map(p => gen.get(p)));
      parinti.forEach(p => {
        if (gen.get(p) < maxG) { gen.set(p, maxG); schimbat = true; }
      });
    });

    copiiPeParinte.forEach(copii => {
      const maxG = Math.max(...copii.map(c => gen.get(c)));
      copii.forEach(c => {
        if (gen.get(c) < maxG) { gen.set(c, maxG); schimbat = true; }
      });
    });

    copiiPeParinte.forEach((copii, parinte) => {
      const minCopil = Math.min(...copii.map(c => gen.get(c)));
      const necesar = minCopil - 1;
      if (gen.get(parinte) < necesar) {
        gen.set(parinte, necesar);
        schimbat = true;
      }
    });
  }

  const minG = Math.min(...gen.values());
  if (minG !== 0) ids.forEach(id => gen.set(id, gen.get(id) - minG));
  return gen;
}

function findChains(nodeMap, partnerEdges, generation, parentEdges = []) {
  const adj = new Map();
  const ridOf = new Map();
  partnerEdges.forEach(e => {
    const s = String(e.source), t = String(e.target);
    if (generation.get(s) !== generation.get(t)) return;
    if (!adj.has(s)) adj.set(s, []);
    if (!adj.has(t)) adj.set(t, []);
    if (!adj.get(s).includes(t)) adj.get(s).push(t);
    if (!adj.get(t).includes(s)) adj.get(t).push(s);
    const key = [s, t].sort().join('|');
    const rid = String(e.relation_id ?? key);
    if (!ridOf.has(key) || rid.localeCompare(ridOf.get(key)) < 0) ridOf.set(key, rid);
  });
  const ridBetween = (a, b) => ridOf.get([a, b].sort().join('|')) ?? '';
  const childrenOf = new Map();
  parentEdges.forEach(e => {
    const p = String(e.source), c = String(e.target);
    if (!childrenOf.has(p)) childrenOf.set(p, new Set());
    childrenOf.get(p).add(c);
  });
  const relationRank = (a, b) => {
    const rid = ridBetween(a, b);
    const n = Number(rid);
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  };
  const localBranchWeight = (root, hub, compSet) => {
    const seen = new Set([hub]);
    const q = [root];
    let people = 0;
    let childLinks = 0;
    let partnerLinks = 0;
    while (q.length && people < 200) {
      const id = String(q.shift());
      if (seen.has(id) || !nodeMap.has(id)) continue;
      seen.add(id);
      people += 1;
      (childrenOf.get(id) || []).forEach(c => {
        const cid = String(c);
        if (cid === hub) return;
        childLinks += 1;
        if (!seen.has(cid)) q.push(cid);
      });
      (adj.get(id) || []).forEach(p => {
        const pid = String(p);
        if (pid === hub) return;
        partnerLinks += 1;
        if (compSet.has(pid) && !seen.has(pid)) q.push(pid);
      });
    }
    const commonChildren = [...(childrenOf.get(root) || [])]
      .filter(c => (childrenOf.get(hub) || new Set()).has(c)).length;
    return people * 6 + childLinks * 4 + partnerLinks * 3 + commonChildren * 8;
  };

  const visited = new Set();
  const chains = [];

  [...nodeMap.keys()].sort().forEach(startId => {
    if (visited.has(startId)) return;
    const component = [];
    const queue = [startId];
    while (queue.length) {
      const cur = queue.shift();
      if (visited.has(cur)) continue;
      visited.add(cur);
      component.push(cur);
      (adj.get(cur) || []).forEach(p => { if (!visited.has(p)) queue.push(p); });
    }

    if (component.length === 1) {
      chains.push({ members: component, gen: generation.get(startId) || 0 });
      return;
    }

    const compSet = new Set(component);
    const deg = (id) => (adj.get(id) || []).filter(p => compSet.has(p)).length;
    const partnersInOrder = (id) =>
      (adj.get(id) || []).filter(p => compSet.has(p))
        .sort((a, b) => ridBetween(id, a).localeCompare(ridBetween(id, b)) || a.localeCompare(b));
    const hubScore = (id) =>
      deg(id) * 1000
      + (childrenOf.get(id)?.size || 0) * 20
      + partnersInOrder(id).reduce((s, p) => s + localBranchWeight(p, id, compSet), 0);
    const hub = [...component].sort((a, b) => hubScore(b) - hubScore(a) || a.localeCompare(b))[0];

    const seen = new Set([hub]);
    const expandOut = (id) => {
      seen.add(id);
      const out = [id];
      partnersInOrder(id).forEach(p => { if (!seen.has(p)) out.push(...expandOut(p)); });
      return out;
    };

    const leftB = [], rightB = [];
    let leftLoad = 0, rightLoad = 0;
    partnersInOrder(hub)
      .map(p => ({ id: p, w: localBranchWeight(p, hub, compSet), rank: relationRank(hub, p) }))
      .sort((a, b) => b.w - a.w || a.rank - b.rank || a.id.localeCompare(b.id))
      .forEach(({ id: p, w }) => {
      if (seen.has(p)) return;
      const bloc = expandOut(p);
      if (rightLoad <= leftLoad) {
        rightB.push(bloc);
        rightLoad += w + bloc.length;
      } else {
        leftB.push(bloc);
        leftLoad += w + bloc.length;
      }
    });

    const ordered = [];
    for (let i = leftB.length - 1; i >= 0; i--) ordered.push(...leftB[i].slice().reverse());
    ordered.push(hub);
    rightB.forEach(b => ordered.push(...b));

    component.filter(m => !seen.has(m)).sort().forEach(m => { seen.add(m); ordered.push(m); });

    chains.push({ members: ordered, gen: generation.get(hub) || 0 });
  });

  return chains;
}

function buildFamilyUnits(chains, nodeMap, parentEdges, partnerEdges, generation) {
  const relTypeOf = new Map();
  const pairToRelId = new Map();

  partnerEdges.forEach(e => {
    const s = String(e.source), t = String(e.target);
    const rid = e.relation_id || `_anon_${[s, t].sort().join('||')}`;
    relTypeOf.set(rid, e.partner_type || 'married');
    pairToRelId.set([s, t].sort().join('||'), rid);
  });

  const partnerAdj = new Map();
  partnerEdges.forEach(e => {
    const s = String(e.source), t = String(e.target);
    if (!partnerAdj.has(s)) partnerAdj.set(s, []);
    if (!partnerAdj.has(t)) partnerAdj.set(t, []);
    if (!partnerAdj.get(s).includes(t)) partnerAdj.get(s).push(t);
    if (!partnerAdj.get(t).includes(s)) partnerAdj.get(t).push(s);
  });

  const childrenOf = new Map();
  const parentsOf = new Map();
  parentEdges.forEach(e => {
    const p = String(e.source), c = String(e.target);
    if (!childrenOf.has(p)) childrenOf.set(p, []);
    if (!parentsOf.has(c)) parentsOf.set(c, []);
    if (!childrenOf.get(p).includes(c)) childrenOf.get(p).push(c);
    if (!parentsOf.get(c).includes(p)) parentsOf.get(c).push(p);
  });

  const units = [];
  const personToUnit = new Map();

  chains.forEach(chain => {
    const idx = units.length;
    const unit = {
      members: chain.members,
      gen: chain.gen,
      childIds: [],
      childUnits: [],
      pairChildren: new Map(),
      pairTypes: new Map(),
    };

    const allChildren = new Set();
    chain.members.forEach(pid => {
      (childrenOf.get(pid) || []).forEach(cid => allChildren.add(cid));
    });

    const assigned = new Set();
    allChildren.forEach(cid => {
      if (assigned.has(cid)) return;
      const cp = parentsOf.get(cid) || [];
      const inChain = cp.filter(p => chain.members.includes(p));
      if (!inChain.length) return;

      assigned.add(cid);
      unit.childIds.push(cid);

      let pairKey, pairPartnerType = 'married';

      if (inChain.length >= 2) {
        const sorted = inChain.slice(0, 2).sort();
        pairKey = sorted.join('||');
        const rid = pairToRelId.get(pairKey);
        if (rid && relTypeOf.has(rid)) pairPartnerType = relTypeOf.get(rid);
      } else {
        const parent = inChain[0];
        const pi = chain.members.indexOf(parent);
        let adjacent = null;
        if (pi > 0 && (partnerAdj.get(parent) || []).includes(chain.members[pi - 1])) {
          adjacent = chain.members[pi - 1];
        } else if (pi < chain.members.length - 1 && (partnerAdj.get(parent) || []).includes(chain.members[pi + 1])) {
          adjacent = chain.members[pi + 1];
        }
        if (adjacent) {
          const sorted = [parent, adjacent].sort();
          pairKey = sorted.join('||');
          const rid = pairToRelId.get(pairKey);
          if (rid && relTypeOf.has(rid)) pairPartnerType = relTypeOf.get(rid);
        } else {
          pairKey = parent;
          pairPartnerType = 'solo';
        }
      }

      if (!unit.pairChildren.has(pairKey)) {
        unit.pairChildren.set(pairKey, []);
        unit.pairTypes.set(pairKey, pairPartnerType);
      }
      unit.pairChildren.get(pairKey).push(cid);
    });

    units.push(unit);
    chain.members.forEach(m => personToUnit.set(m, idx));
  });

  units.forEach((u, i) => {
    const childUnitSet = new Set();
    u.childIds.forEach(cid => {
      const cu = personToUnit.get(cid);
      if (cu !== undefined && cu !== i) childUnitSet.add(cu);
    });
    u.childUnits = [...childUnitSet];
  });

  const unitParent = new Array(units.length).fill(-1);
  units.forEach((u, i) => {
    u.childUnits.forEach(cu => {
      if (unitParent[cu] === -1) unitParent[cu] = i;
    });
  });
  const roots = units.map((_, i) => i).filter(i => unitParent[i] === -1);

  return { units, unitParent, roots, personToUnit };
}

function positionUnitsRT(units, roots, unitParent, parentsOf) {
  function unitW(i) {
    const m = units[i].members.length;
    return m * NODE_WIDTH + (m - 1) * COUPLE_GAP;
  }

  function treeKids(i) {
    return (units[i].childUnits || []).filter(c => unitParent[c] === i);
  }

  function anchorOffset(pi, ci) {
    const cm = units[ci].members;
    if (cm.length < 2) return 0;
    const pset = new Set(units[pi].members.map(String));
    let matches = 0, firstIdx = -1;
    cm.forEach((m, idx) => {
      const blood = (parentsOf.get(String(m)) || []).some(p => pset.has(String(p)));
      if (blood) { matches++; if (firstIdx < 0) firstIdx = idx; }
    });
    if (matches !== 1) return 0;
    const w = unitW(ci);
    const memCenter = firstIdx * (NODE_WIDTH + COUPLE_GAP) + NODE_WIDTH / 2;
    return memCenter - w / 2;
  }

  function directParentIndexes(parentUnit, childUnit) {
    const parentMembers = units[parentUnit].members.map(String);
    const parentIndex = new Map(parentMembers.map((member, index) => [member, index]));
    const indexes = new Set();
    units[childUnit].members.forEach(childMember => {
      (parentsOf.get(String(childMember)) || []).forEach(parentId => {
        if (parentIndex.has(String(parentId))) indexes.add(parentIndex.get(String(parentId)));
      });
    });
    return [...indexes].sort((a, b) => a - b);
  }

  function parentPairOffset(parentUnit, childUnit) {
    const indexes = directParentIndexes(parentUnit, childUnit);
    if (!indexes.length) return unitW(parentUnit) / 2;
    const centers = indexes.map(index =>
      index * (NODE_WIDTH + COUPLE_GAP) + NODE_WIDTH / 2
    );
    return centers.reduce((a, b) => a + b, 0) / centers.length;
  }

  function layoutSub(i, vazut) {
    const pos = new Map();
    if (vazut.has(i)) { pos.set(i, unitW(i) / 2); return { pos, width: unitW(i) }; }
    vazut.add(i);

    const wSelf = unitW(i);
    const kids = treeKids(i).filter(k => !vazut.has(k));
    if (!kids.length) { pos.set(i, wSelf / 2); return { pos, width: wSelf }; }

    const kidData = kids.map(k => ({ k, off: parentPairOffset(i, k) }));
    const distinctOffs = new Set(kidData.map(d => Math.round(d.off))).size;
    const multiPair = distinctOffs >= 2 && units[i].members.length >= 2;

    if (!multiPair) {
      let xOff = 0;
      const ancore = [];
      for (const k of kids) {
        const bloc = layoutSub(k, vazut);
        for (const [id, x] of bloc.pos) pos.set(id, x + xOff);
        ancore.push(bloc.pos.get(k) + xOff + anchorOffset(i, k));
        xOff += bloc.width + H_GAP;
      }
      const latimeCopii = xOff - H_GAP;

      let centru = (ancore[0] + ancore[ancore.length - 1]) / 2;
      let stanga = Math.min(0, centru - wSelf / 2);
      let dreapta = Math.max(latimeCopii, centru + wSelf / 2);

      if (stanga < 0) {
        const shift = -stanga;
        for (const [id, x] of pos) pos.set(id, x + shift);
        centru += shift;
        dreapta += shift;
      }
      pos.set(i, centru);
      return { pos, width: dreapta };
    }

    kidData.sort((a, b) => a.off - b.off);
    let prevRight = -Infinity, prevOff = null;
    let minBlockLeft = Infinity, maxBlockRight = -Infinity;
    const align = [];
    for (const { k, off } of kidData) {
      const bloc = layoutSub(k, vazut);
      const anchorInBloc = bloc.pos.get(k) + anchorOffset(i, k);
      let left = off - anchorInBloc;

      const gap = (prevOff !== null && Math.round(off) === prevOff) ? H_GAP : COUPLE_GAP;
      if (left < prevRight + gap) left = prevRight + gap;
      prevOff = Math.round(off);
      for (const [id, x] of bloc.pos) pos.set(id, x + left);
      const anchorX = anchorInBloc + left;
      align.push(anchorX - off);
      minBlockLeft = Math.min(minBlockLeft, left);
      maxBlockRight = Math.max(maxBlockRight, left + bloc.width);
      prevRight = left + bloc.width;
    }

    let parentLeft = align.reduce((a, b) => a + b, 0) / align.length;
    const minX = Math.min(0, parentLeft, minBlockLeft);
    if (minX < 0) {
      const shift = -minX;
      for (const [id, x] of pos) pos.set(id, x + shift);
      parentLeft += shift;
      maxBlockRight += shift;
    }
    pos.set(i, parentLeft + wSelf / 2);
    return { pos, width: Math.max(maxBlockRight, parentLeft + wSelf) };
  }

  const centerX = new Map();
  const vazut = new Set();
  let cursor = 0;
  roots.forEach(r => {
    if (vazut.has(r)) return;
    const bloc = layoutSub(r, vazut);
    for (const [id, x] of bloc.pos) centerX.set(id, x + cursor);
    cursor += bloc.width + ROOT_GAP;
  });

  units.forEach((_, i) => {
    if (centerX.has(i)) return;
    const bloc = layoutSub(i, vazut);
    for (const [id, x] of bloc.pos) if (!centerX.has(id)) centerX.set(id, x + cursor);
    cursor += bloc.width + ROOT_GAP;
  });

  return centerX;
}

function positionUnitsFocusRooted(
  units,
  focusUnitIdx,
  unitGen,
  parentsOf,
  childrenOf,
  focusPersonId,
  genderOf,
  splitSides = true,
  anchorUp = false,
  centerChildren = false,
  parentBranchMode = 'father-left',
) {

  const sumGaps = (i) => {
    const u = units[i];
    if (!u._gaps) return (u.members.length - 1) * COUPLE_GAP;
    return u._gaps.reduce((a, b) => a + b, 0);
  };
  const unitW = (i) => units[i].members.length * NODE_WIDTH + sumGaps(i);

  const parentUnitsMap = new Map();
  units.forEach((u, i) => (u.childUnits || []).forEach(c => {
    if (!parentUnitsMap.has(c)) parentUnitsMap.set(c, new Set());
    parentUnitsMap.get(c).add(i);
  }));
  const neighbors = (i) => {
    const s = new Set(units[i].childUnits || []);
    (parentUnitsMap.get(i) || []).forEach(p => s.add(p));
    return [...s];
  };

  const treeChildren = new Map();
  units.forEach((_, i) => treeChildren.set(i, []));
  const seen = new Set([focusUnitIdx]);
  const q = [focusUnitIdx];
  while (q.length) {
    const cur = q.shift();
    neighbors(cur).forEach(nb => {
      if (seen.has(nb)) return;
      seen.add(nb);
      treeChildren.get(cur).push(nb);
      q.push(nb);
    });
  }

  const side = new Array(units.length).fill(0);
  if (splitSides && focusPersonId != null) {
    const fp = (parentsOf.get(String(focusPersonId)) || []).map(String);
    const gen = (id) => (genderOf ? genderOf(id) : '');
    let father = fp.find(p => gen(p) === 'M');
    let mother = fp.find(p => gen(p) === 'F');
    if (!father && !mother) { father = fp[0]; mother = fp[1]; }
    else { father = father || fp.find(p => p !== mother); mother = mother || fp.find(p => p !== father); }

    const fatherSide = parentBranchMode === 'father-right' ? +1 : -1;
    const motherSide = -fatherSide;

    const markSubtree = (root, s) => {
      const st = [root];
      while (st.length) {
        const u = st.pop();
        if (side[u] !== 0) continue;
        side[u] = s;
        (treeChildren.get(u) || []).forEach(k => st.push(k));
      }
    };

    (treeChildren.get(focusUnitIdx) || []).forEach(P => {
      if ((unitGen[P] ?? 0) >= (unitGen[focusUnitIdx] ?? 0)) return;
      (treeChildren.get(P) || []).forEach(gk => {
        if ((unitGen[gk] ?? 0) >= (unitGen[P] ?? 0)) return;
        const gkm = new Set(units[gk].members.map(String));
        const ofFather = father && (parentsOf.get(father) || []).some(p => gkm.has(String(p)));
        const ofMother = mother && (parentsOf.get(mother) || []).some(p => gkm.has(String(p)));
        if (ofFather && !ofMother) markSubtree(gk, fatherSide);
        else if (ofMother && !ofFather) markSubtree(gk, motherSide);
      });
    });
  }

  const GAP = H_GAP;
  let curOrder = treeChildren;

  function merge(pos, L, R, sub, forceShift = 0) {
    let shift = forceShift;
    for (const [row, l] of sub.L) {
      if (R.has(row)) shift = Math.max(shift, R.get(row) + GAP - l);
    }
    for (const [id, x] of sub.pos) pos.set(id, x + shift);
    for (const [row, l] of sub.L) {
      const nl = l + shift;
      if (!L.has(row) || nl < L.get(row)) L.set(row, nl);
    }
    for (const [row, r] of sub.R) {
      const nr = r + shift;
      if (!R.has(row) || nr > R.get(row)) R.set(row, nr);
    }
    return shift;
  }

  function packSiblings(list, vazut) {
    const pos = new Map(), L = new Map(), R = new Map();
    const centers = [];
    for (const k of list) {
      const sub = layoutSub(k, vazut);
      const shift = merge(pos, L, R, sub);
      centers.push(sub.pos.get(k) + shift);
    }
    return { pos, L, R, centers };
  }

  function layoutSub(i, vazut) {
    const g = unitGen[i] ?? 0;
    const w = unitW(i);
    if (vazut.has(i)) {
      return { pos: new Map([[i, w / 2]]), L: new Map([[g, 0]]), R: new Map([[g, w]]) };
    }
    vazut.add(i);
    const kids = (curOrder.get(i) || []).filter(k => !vazut.has(k));
    if (!kids.length) {
      return { pos: new Map([[i, w / 2]]), L: new Map([[g, 0]]), R: new Map([[g, w]]) };
    }

    const bySide = (a, b) => side[a] - side[b];
    const upKids = kids.filter(k => (unitGen[k] ?? 0) < g).sort(bySide);
    const downKids = kids.filter(k => (unitGen[k] ?? 0) >= g).sort(bySide);

    const pos = new Map(), L = new Map(), R = new Map();

    const up = packSiblings(upKids, vazut);
    for (const [id, x] of up.pos) pos.set(id, x);
    for (const [row, v] of up.L) L.set(row, v);
    for (const [row, v] of up.R) R.set(row, v);

    let center = up.centers.length
      ? (up.centers[0] + up.centers[up.centers.length - 1]) / 2
      : null;

    if (downKids.length) {
      const down = packSiblings(downKids, vazut);
      const downMid = (down.centers[0] + down.centers[down.centers.length - 1]) / 2;
      if (center == null) {

        merge(pos, L, R, down, 0);
        center = downMid;
      } else {

        merge(pos, L, R, down, Math.max(0, center - downMid));
      }
    } else if (center == null) {
      center = w / 2;
    }

    if (R.has(g) && center - w / 2 < R.get(g) + GAP) {
      center = R.get(g) + GAP + w / 2;
    }
    pos.set(i, center);
    const pl = center - w / 2, pr = center + w / 2;
    if (!L.has(g) || pl < L.get(g)) L.set(g, pl);
    if (!R.has(g) || pr > R.get(g)) R.set(g, pr);

    let minL = Infinity;
    for (const v of L.values()) minL = Math.min(minL, v);
    if (minL !== 0 && minL !== Infinity) {
      for (const [id, x] of pos) pos.set(id, x - minL);
      const nL = new Map(), nR = new Map();
      for (const [row, v] of L) nL.set(row, v - minL);
      for (const [row, v] of R) nR.set(row, v - minL);
      return { pos, L: nL, R: nR };
    }
    return { pos, L, R };
  }

  function runLayout(order) {
    curOrder = order;
    const centerX = new Map();
    const vazut = new Set();
    const bloc = layoutSub(focusUnitIdx, vazut);
    for (const [id, x] of bloc.pos) centerX.set(id, x);
    const currentMax = () => {
      let mx = 0;
      centerX.forEach((x, u) => { mx = Math.max(mx, x + unitW(u) / 2); });
      return mx;
    };
    let cursor = currentMax() + ROOT_GAP;
    units.forEach((_, i) => {
      if (centerX.has(i)) return;
      const b = layoutSub(i, vazut);
      for (const [id, x] of b.pos) if (!centerX.has(id)) centerX.set(id, x + cursor);
      cursor += (Math.max(0, ...b.R.values())) + ROOT_GAP;
    });
    return centerX;
  }

  const memberCenterRel = (ui, idx) => {
    const gs = units[ui]._gaps;
    let x = 0;
    for (let j = 0; j < idx; j++) x += NODE_WIDTH + (gs ? gs[j] : COUPLE_GAP);
    return x + NODE_WIDTH / 2 - unitW(ui) / 2;
  };

  const bloodMemberIdx = (pi, ci) => {
    const cm = units[ci].members;
    if (cm.length < 2) return -1;
    const pset = new Set(units[pi].members.map(String));
    let matches = 0, firstIdx = -1;
    cm.forEach((m, idx) => {
      const blood = (parentsOf.get(String(m)) || []).some(p => pset.has(String(p)));
      if (blood) { matches++; if (firstIdx < 0) firstIdx = idx; }
    });
    return matches === 1 ? firstIdx : -1;
  };
  const anchorOffsetU = (pi, ci) => {
    const idx = bloodMemberIdx(pi, ci);
    return idx < 0 ? 0 : memberCenterRel(ci, idx);
  };

  const pairIdxsU = (pi, ci) => {
    const pindex = new Map(units[pi].members.map((m, j) => [String(m), j]));
    const idxs = new Set();
    units[ci].members.forEach(cm => {
      (parentsOf.get(String(cm)) || []).forEach(p => {
        if (pindex.has(String(p))) idxs.add(pindex.get(String(p)));
      });
    });
    return [...idxs].sort((a, b) => a - b);
  };

  const pairOffsetU = (pi, ci) => {
    const idxs = pairIdxsU(pi, ci);
    if (!idxs.length) return 0;
    const centers = idxs.map(j => memberCenterRel(pi, j));
    return centers.reduce((a, b) => a + b, 0) / centers.length;
  };

  function widenChainForGroups(i, packed) {
    const u = units[i];
    const m = u.members.length;
    if (m < 2) return;
    const topW = (gblk) => {
      const rows = [...gblk.L.keys()];
      if (!rows.length) return 0;
      const top = Math.min(...rows);
      return gblk.R.get(top) - gblk.L.get(top);
    };
    const data = packed
      .map(p => ({ idxs: pairIdxsU(i, p.kids[0]), w: topW(p.gblk) }))
      .filter(d => d.idxs.length);
    if (data.length < 2) return;
    const centerOf = (idxs) =>
      idxs.reduce((a, j) => a + memberCenterRel(i, j), 0) / idxs.length;
    data.sort((a, b) => centerOf(a.idxs) - centerOf(b.idxs));
    const MAXG = NODE_WIDTH * 4;
    for (let t = 0; t + 1 < data.length; t++) {
      const A = data[t], B = data[t + 1];
      const need = (A.w + B.w) / 2 + GAP;
      const deficit = need - (centerOf(B.idxs) - centerOf(A.idxs));
      if (deficit <= 0) continue;

      const cur = u._gaps ?? new Array(m - 1).fill(COUPLE_GAP);
      let bestJ = -1, bestC = 0;
      for (let j = 0; j < m - 1; j++) {
        const fB = B.idxs.filter(x => x > j).length / B.idxs.length;
        const fA = A.idxs.filter(x => x > j).length / A.idxs.length;
        const c = fB - fA;
        if (c > bestC) { bestC = c; bestJ = j; }
      }
      if (bestJ < 0) continue;
      const add = Math.min(deficit / bestC, MAXG - cur[bestJ]);
      if (add <= 0) continue;
      cur[bestJ] += add;
      u._gaps = cur;
    }
  }

  const bySideU = (a, b) => side[a] - side[b];

  function packGroupOf(pu, grpKids, vazut) {
    const gblk = { pos: new Map(), L: new Map(), R: new Map() };
    const anchors = [];
    for (const kk of grpKids) {
      if (vazut.has(kk)) continue;
      const sub = layoutSubStrict(kk, vazut);
      const shift = merge(gblk.pos, gblk.L, gblk.R, sub);
      anchors.push(sub.pos.get(kk) + shift + anchorOffsetU(pu, kk));
    }
    return { gblk, anchors };
  }

  function layoutSubStrict(i, vazut) {
    const g = unitGen[i] ?? 0;
    const leaf = () => {
      const w = unitW(i);
      return { pos: new Map([[i, w / 2]]), L: new Map([[g, 0]]), R: new Map([[g, w]]) };
    };
    if (vazut.has(i)) return leaf();
    vazut.add(i);
    const kids = (treeChildren.get(i) || []).filter(k => !vazut.has(k));
    if (!kids.length) return leaf();

    const upKids = kids.filter(k => (unitGen[k] ?? 0) < g).sort(bySideU);
    const downKids = kids.filter(k => (unitGen[k] ?? 0) >= g);

    const w = unitW(i);

    const blk = { pos: new Map(), L: new Map(), R: new Map() };
    let center = 0;
    if (downKids.length) {

      const groups = new Map();
      for (const k of downKids) {
        const key = pairIdxsU(i, k).join('|') || 'x';
        if (!groups.has(key)) groups.set(key, { kids: [] });
        groups.get(key).kids.push(k);
      }

      const packed = [];
      for (const grp of groups.values()) {
        const { gblk, anchors } = packGroupOf(i, grp.kids, vazut);
        if (!anchors.length) continue;
        packed.push({ gblk, anchors, kids: grp.kids });
      }

      if (packed.length > 1) widenChainForGroups(i, packed);

      const devs = [];
      const withOff = packed
        .map(p => ({ ...p, off: pairOffsetU(i, p.kids[0]) }))
        .sort((a, b) => a.off - b.off);
      let minGroupLeft = -Infinity;
      for (const p of withOff) {
        const midAnchor = (p.anchors[0] + p.anchors[p.anchors.length - 1]) / 2;
        const shift = mergeNearOrdered(blk, p.gblk, p.off - midAnchor, minGroupLeft);
        const sb = subBounds(p.gblk);
        minGroupLeft = shift + sb.r + GAP;
        devs.push(midAnchor + shift - p.off);
      }
      if (devs.length) center = (Math.min(...devs) + Math.max(...devs)) / 2;
    }

    center = resolveRowConflict(blk, g, center, w);
    blk.pos.set(i, center);
    const pl = center - w / 2, pr = center + w / 2;
    if (!blk.L.has(g) || pl < blk.L.get(g)) blk.L.set(g, pl);
    if (!blk.R.has(g) || pr > blk.R.get(g)) blk.R.set(g, pr);

    const movable = i !== focusUnitIdx;
    upKids.forEach((k, idx) => {
      const aOff = anchorOffsetU(k, i);
      const dir = side[k] ? Math.sign(side[k])
        : (aOff !== 0 ? Math.sign(aOff) : (idx === 0 ? -1 : +1));
      layoutSpineUp(k, blk, i, center + aOff, dir, vazut, movable);
    });

    let minL = Infinity;
    for (const v of blk.L.values()) minL = Math.min(minL, v);
    if (minL !== 0 && minL !== Infinity) {
      for (const [id, x] of blk.pos) blk.pos.set(id, x - minL);
      const nL = new Map(), nR = new Map();
      for (const [row, v] of blk.L) nL.set(row, v - minL);
      for (const [row, v] of blk.R) nR.set(row, v - minL);
      return { pos: blk.pos, L: nL, R: nR };
    }
    return { pos: blk.pos, L: blk.L, R: blk.R };
  }

  function mergeDir(blk, sub, dir, want) {
    if (dir > 0) return merge(blk.pos, blk.L, blk.R, sub, want);
    let shift = want;
    for (const [row, r] of sub.R) {
      if (blk.L.has(row)) shift = Math.min(shift, blk.L.get(row) - GAP - r);
    }
    for (const [id, x] of sub.pos) blk.pos.set(id, x + shift);
    for (const [row, l] of sub.L) {
      const nl = l + shift;
      if (!blk.L.has(row) || nl < blk.L.get(row)) blk.L.set(row, nl);
    }
    for (const [row, r] of sub.R) {
      const nr = r + shift;
      if (!blk.R.has(row) || nr > blk.R.get(row)) blk.R.set(row, nr);
    }
    return shift;
  }

  function mergeNear(blk, sub, want) {
    const rows = new Map();
    for (const [u, x] of blk.pos) {
      const row = unitGen[u] ?? 0;
      const h = unitW(u) / 2;
      if (!rows.has(row)) rows.set(row, []);
      rows.get(row).push([x - h, x + h]);
    }
    const subIvs = [];
    for (const [u, x] of sub.pos) {
      const row = unitGen[u] ?? 0;
      const h = unitW(u) / 2;
      subIvs.push([row, x - h, x + h]);
    }
    const ok = (shift) => {
      for (const [row, l, r] of subIvs) {
        const ivs = rows.get(row);
        if (!ivs) continue;
        for (const iv of ivs) {
          if (r + shift > iv[0] - GAP && l + shift < iv[1] + GAP) return false;
        }
      }
      return true;
    };
    const cands = [want];
    for (const [row, l, r] of subIvs) {
      const ivs = rows.get(row);
      if (!ivs) continue;
      for (const iv of ivs) {
        cands.push(iv[0] - GAP - r);
        cands.push(iv[1] + GAP - l);
      }
    }
    cands.sort((a, b) => Math.abs(a - want) - Math.abs(b - want));
    for (const c of cands) {
      if (!ok(c)) continue;
      for (const [id, x] of sub.pos) blk.pos.set(id, x + c);
      for (const [row, l] of sub.L) {
        const nl = l + c;
        if (!blk.L.has(row) || nl < blk.L.get(row)) blk.L.set(row, nl);
      }
      for (const [row, r] of sub.R) {
        const nr = r + c;
        if (!blk.R.has(row) || nr > blk.R.get(row)) blk.R.set(row, nr);
      }
      return c;
    }
    return merge(blk.pos, blk.L, blk.R, sub, want);
  }

  function subBounds(sub) {
    let l = Infinity, r = -Infinity;
    for (const row of sub.L.keys()) {
      l = Math.min(l, sub.L.get(row));
      r = Math.max(r, sub.R.get(row));
    }
    if (l === Infinity) return { l: 0, r: 0 };
    return { l, r };
  }

  function mergeNearOrdered(blk, sub, want, minLeft = -Infinity) {
    if (minLeft === -Infinity) return mergeNear(blk, sub, want);
    const sb = subBounds(sub);
    const rows = new Map();
    for (const [u, x] of blk.pos) {
      const row = unitGen[u] ?? 0;
      const h = unitW(u) / 2;
      if (!rows.has(row)) rows.set(row, []);
      rows.get(row).push([x - h, x + h]);
    }
    const subIvs = [];
    for (const [u, x] of sub.pos) {
      const row = unitGen[u] ?? 0;
      const h = unitW(u) / 2;
      subIvs.push([row, x - h, x + h]);
    }
    const ok = (shift) => {
      if (shift + sb.l < minLeft - 0.5) return false;
      for (const [row, l, r] of subIvs) {
        const ivs = rows.get(row);
        if (!ivs) continue;
        for (const iv of ivs) {
          if (r + shift > iv[0] - GAP && l + shift < iv[1] + GAP) return false;
        }
      }
      return true;
    };
    const cands = [Math.max(want, minLeft - sb.l)];
    for (const [row, l, r] of subIvs) {
      const ivs = rows.get(row);
      if (!ivs) continue;
      for (const iv of ivs) {
        cands.push(iv[1] + GAP - l);
        cands.push(iv[0] - GAP - r);
      }
    }
    cands.sort((a, b) => Math.abs(a - want) - Math.abs(b - want));
    for (const c of cands) {
      if (!ok(c)) continue;
      for (const [id, x] of sub.pos) blk.pos.set(id, x + c);
      for (const [row, l] of sub.L) {
        const nl = l + c;
        if (!blk.L.has(row) || nl < blk.L.get(row)) blk.L.set(row, nl);
      }
      for (const [row, r] of sub.R) {
        const nr = r + c;
        if (!blk.R.has(row) || nr > blk.R.get(row)) blk.R.set(row, nr);
      }
      return c;
    }
    return merge(blk.pos, blk.L, blk.R, sub, Math.max(want, minLeft - sb.l));
  }

  function clampBoxDir(blk, gk, c, w, dir) {
    const ivs = [];
    for (const [u, x] of blk.pos) {
      if ((unitGen[u] ?? 0) !== gk) continue;
      const h = unitW(u) / 2;
      ivs.push([x - h, x + h]);
    }
    if (!ivs.length) return c;
    ivs.sort((a, b) => a[0] - b[0]);
    const merged = [];
    ivs.forEach(iv => {
      const last = merged[merged.length - 1];
      if (last && iv[0] <= last[1] + GAP) last[1] = Math.max(last[1], iv[1]);
      else merged.push([iv[0], iv[1]]);
    });
    for (let guard = 0; guard <= merged.length; guard++) {
      const hit = merged.find(iv => c + w / 2 + GAP > iv[0] && c - w / 2 - GAP < iv[1]);
      if (!hit) break;
      c = dir < 0 ? hit[0] - GAP - w / 2 : hit[1] + GAP + w / 2;
    }
    return c;
  }

  function clampBoxNear(blk, gk, c, w) {
    const cl = clampBoxDir(blk, gk, c, w, -1);
    const cr = clampBoxDir(blk, gk, c, w, +1);
    return Math.abs(cl - c) <= Math.abs(cr - c) ? cl : cr;
  }

  const inlawLineUnits = new Set();

  function resolveRowConflict(blk, g, center, w) {
    const lo = center - w / 2 - GAP, hi = center + w / 2 + GAP;
    const rowUnits = (row) => {
      const out = [];
      for (const [u, x] of blk.pos) {
        if ((unitGen[u] ?? 0) !== row) continue;
        const h = unitW(u) / 2;
        out.push({ u, l: x - h, r: x + h });
      }
      return out;
    };
    const conflicts = rowUnits(g).filter(iv => iv.r > lo && iv.l < hi);
    if (!conflicts.length) return center;
    if (conflicts.some(iv => !inlawLineUnits.has(iv.u))) return clampBoxNear(blk, g, center, w);

    const col = new Set(conflicts.map(iv => iv.u));
    let hullL = Math.min(...conflicts.map(iv => iv.l));
    let hullR = Math.max(...conflicts.map(iv => iv.r));
    let grown = true;
    while (grown) {
      grown = false;
      for (const [u, x] of blk.pos) {
        if (col.has(u) || (unitGen[u] ?? 0) >= g) continue;
        const h = unitW(u) / 2;
        if (x + h > hullL - GAP && x - h < hullR + GAP) {
          if (!inlawLineUnits.has(u)) return clampBoxNear(blk, g, center, w);
          col.add(u);
          hullL = Math.min(hullL, x - h);
          hullR = Math.max(hullR, x + h);
          grown = true;
        }
      }
    }

    const MAXD = NODE_WIDTH * 2.5;
    const tryDelta = (delta) => {
      if (Math.abs(delta) > MAXD) return false;
      for (const u of col) {
        const row = unitGen[u] ?? 0;
        const h = unitW(u) / 2;
        const nl = blk.pos.get(u) + delta - h, nr = blk.pos.get(u) + delta + h;
        if (row === g && nr > lo && nl < hi) return false;
        for (const iv of rowUnits(row)) {
          if (col.has(iv.u)) continue;
          if (nr > iv.l - GAP && nl < iv.r + GAP) return false;
        }
      }
      return true;
    };
    const dLeft = lo - hullR, dRight = hi - hullL;
    let delta = null;
    for (const d of (Math.abs(dLeft) <= Math.abs(dRight) ? [dLeft, dRight] : [dRight, dLeft])) {
      if (tryDelta(d)) { delta = d; break; }
    }
    if (delta == null) return clampBoxNear(blk, g, center, w);

    const rowsTouched = new Set();
    for (const u of col) {
      blk.pos.set(u, blk.pos.get(u) + delta);
      rowsTouched.add(unitGen[u] ?? 0);
    }
    rowsTouched.forEach(row => {
      let mn = Infinity, mx = -Infinity;
      for (const [u, x] of blk.pos) {
        if ((unitGen[u] ?? 0) !== row) continue;
        const h = unitW(u) / 2;
        mn = Math.min(mn, x - h); mx = Math.max(mx, x + h);
      }
      if (mn !== Infinity) { blk.L.set(row, mn); blk.R.set(row, mx); }
    });
    return center;
  }

  function layoutSpineUp(k, blk, fromUnit, anchorX, dir, vazut, movable = false) {
    if (vazut.has(k)) return;
    vazut.add(k);
    if (movable) inlawLineUnits.add(k);
    const gk = unitGen[k] ?? 0;

    const kids = (treeChildren.get(k) || []).filter(kk => !vazut.has(kk));
    const downK = kids.filter(kk => (unitGen[kk] ?? 0) >= gk);
    const upK = kids.filter(kk => (unitGen[kk] ?? 0) < gk).sort(bySideU);

    const wk = unitW(k);

    const spineOff = pairOffsetU(k, fromUnit);
    const groups = new Map();
    for (const kk of downK) {
      const off = pairOffsetU(k, kk);
      const key = Math.round(off);
      if (!groups.has(key)) groups.set(key, { off, kids: [] });
      groups.get(key).kids.push(kk);
    }

    const spineKey = Math.round(spineOff);
    const spineAnchors = [anchorX];
    if (groups.has(spineKey)) {
      const { gblk, anchors } = packGroupOf(k, groups.get(spineKey).kids, vazut);
      groups.delete(spineKey);
      if (anchors.length) {
        const want = dir < 0
          ? (anchorX - NODE_WIDTH - GAP) - anchors[anchors.length - 1]
          : (anchorX + NODE_WIDTH + GAP) - anchors[0];
        const shift = mergeDir(blk, gblk, dir, want);
        anchors.forEach(a => spineAnchors.push(a + shift));
      }
    }

    let ck = (Math.min(...spineAnchors) + Math.max(...spineAnchors)) / 2 - spineOff;
    ck = resolveRowConflict(blk, gk, ck, wk);
    blk.pos.set(k, ck);
    const pl = ck - wk / 2, pr = ck + wk / 2;
    if (!blk.L.has(gk) || pl < blk.L.get(gk)) blk.L.set(gk, pl);
    if (!blk.R.has(gk) || pr > blk.R.get(gk)) blk.R.set(gk, pr);

    let minGroupLeft = -Infinity;
    for (const grp of [...groups.values()].sort((a, b) => a.off - b.off)) {
      const { gblk, anchors } = packGroupOf(k, grp.kids, vazut);
      if (!anchors.length) continue;
      const midAnchor = (anchors[0] + anchors[anchors.length - 1]) / 2;
      const shift = mergeNearOrdered(blk, gblk, (ck + grp.off) - midAnchor, minGroupLeft);
      const sb = subBounds(gblk);
      minGroupLeft = shift + sb.r + GAP;
    }

    for (const kk of upK) {
      const a = ck + anchorOffsetU(kk, k);
      const d2 = side[kk] ? Math.sign(side[kk]) : dir;
      layoutSpineUp(kk, blk, k, a, d2, vazut, movable);
    }
  }

  if (!anchorUp && !centerChildren) {
    const vazut = new Set();
    const centerX = new Map();

    const bloc = layoutSubStrict(focusUnitIdx, vazut);
    for (const [id, x] of bloc.pos) centerX.set(id, x);

    let cursor = (Math.max(0, ...bloc.R.values())) + ROOT_GAP;
    units.forEach((_, i) => {
      if (centerX.has(i)) return;
      const b = layoutSubStrict(i, vazut);
      for (const [id, x] of b.pos) if (!centerX.has(id)) centerX.set(id, x + cursor);
      cursor += (Math.max(0, ...b.R.values())) + ROOT_GAP;
    });
    return centerX;
  }

  const centerX = runLayout(treeChildren);

  const personUnit = new Map();
  units.forEach((u, i) => u.members.forEach(m => personUnit.set(String(m), i)));
  const half = (i) => unitW(i) / 2;
  const sepOf = (a, b) => half(a) + H_GAP + half(b);
  const parentU = units.map((u, i) => {
    const s = new Set();
    u.members.forEach(m => (parentsOf.get(String(m)) || []).forEach(p => { const v = personUnit.get(String(p)); if (v != null && v !== i) s.add(v); }));
    return [...s];
  });
  const childU = units.map((u, i) => {
    const s = new Set();
    u.members.forEach(m => (childrenOf.get(String(m)) || []).forEach(c => { const v = personUnit.get(String(c)); if (v != null && v !== i) s.add(v); }));
    return [...s];
  });
  const prio = (i) => (i === focusUnitIdx ? Infinity : parentU[i].length + childU[i].length + 1);

  const gens = [...new Set(units.map((_, i) => unitGen[i] ?? 0))].sort((a, b) => a - b);
  const rows = new Map(gens.map(g => [g, []]));
  units.forEach((_, i) => { if (centerX.has(i)) rows.get(unitGen[i] ?? 0).push(i); });
  rows.forEach(list => list.sort((a, b) => centerX.get(a) - centerX.get(b)));

  const medianX = (arr) => {
    const xs = arr.filter(v => centerX.has(v)).map(v => centerX.get(v)).sort((a, b) => a - b);
    if (!xs.length) return null;
    const m = xs.length >> 1;
    return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
  };
  const baryX = (i) => {
    const ns = [...parentU[i], ...childU[i]].filter(v => centerX.has(v));
    return ns.length ? ns.reduce((a, v) => a + centerX.get(v), 0) / ns.length : centerX.get(i);
  };

  for (let it = 0; it < 16; it++) {
    const seq = it % 2 ? [...gens].reverse() : gens;
    seq.forEach(g => {
      const list = rows.get(g);
      const b = new Map(list.map(i => [i, baryX(i)]));
      list.sort((x, y) => (side[x] - side[y]) || (b.get(x) - b.get(y)) || (centerX.get(x) - centerX.get(y)));
      let prevI = null;
      for (const i of list) {
        let x = b.get(i);
        if (prevI != null) { const mn = centerX.get(prevI) + sepOf(prevI, i); if (x < mn) x = mn; }
        centerX.set(i, x); prevI = i;
      }
    });
  }

  const placeLayer = (order, desiredFn) => {
    const n = order.length;
    if (!n) return;
    const X = order.map(i => centerX.get(i));
    const byPrio = [...Array(n).keys()].sort((a, b) => prio(order[b]) - prio(order[a]) || a - b);
    const fixed = new Array(n).fill(false);
    for (const k of byPrio) {
      let want = desiredFn(order[k]);
      if (want == null) want = X[k];
      let lo = -Infinity, acc = 0;
      for (let j = k - 1; j >= 0; j--) { acc += sepOf(order[j], order[j + 1]); if (fixed[j]) { lo = X[j] + acc; break; } }
      let hi = Infinity; acc = 0;
      for (let j = k + 1; j < n; j++) { acc += sepOf(order[j - 1], order[j]); if (fixed[j]) { hi = X[j] - acc; break; } }
      want = Math.max(lo, Math.min(hi, want));
      X[k] = want; fixed[k] = true;
      for (let j = k - 1; j >= 0 && !fixed[j]; j--) { const mx = X[j + 1] - sepOf(order[j], order[j + 1]); if (X[j] > mx) X[j] = mx; else break; }
      for (let j = k + 1; j < n && !fixed[j]; j++) { const mn = X[j - 1] + sepOf(order[j - 1], order[j]); if (X[j] < mn) X[j] = mn; else break; }
    }
    order.forEach((i, k) => centerX.set(i, X[k]));
  };

  for (let it = 0; it < 30; it++) {
    for (let gi = 0; gi < gens.length; gi++) placeLayer(rows.get(gens[gi]), (i) => medianX(parentU[i]));
    for (let gi = gens.length - 1; gi >= 0; gi--) placeLayer(rows.get(gens[gi]), (i) => medianX(childU[i]));
  }

  if (anchorUp) {
    for (let it = 0; it < 24; it++) {
      for (let gi = 0; gi < gens.length; gi++) placeLayer(rows.get(gens[gi]), (i) => medianX(parentU[i]));
    }
  }

  if (centerChildren) {
    for (let it = 0; it < 24; it++) {
      for (let gi = gens.length - 1; gi >= 0; gi--) placeLayer(rows.get(gens[gi]), (i) => medianX(childU[i]));
    }
  }

  return centerX;
}

function computeRawLayout(nodeMap, partnerEdges, parentEdges, ancestorMode = false, focusRootId = null, layoutOpts = {}) {
  const {
    splitSides = true,
    anchorUp = false,
    centerChildren = false,
    parentBranchMode = null,
  } = layoutOpts;

  const structuralParentEdges = ancestorMode
    ? parentEdges.map(e => ({ ...e, source: e.target, target: e.source }))
    : parentEdges;

  const generation = computeGenerations(nodeMap, partnerEdges, structuralParentEdges);
  const chains = findChains(nodeMap, partnerEdges, generation, structuralParentEdges);
  const { units, unitParent, roots, personToUnit } =
    buildFamilyUnits(chains, nodeMap, structuralParentEdges, partnerEdges, generation);

  const parentsOfStruct = new Map();
  structuralParentEdges.forEach(e => {
    const p = String(e.source), c = String(e.target);
    if (!parentsOfStruct.has(c)) parentsOfStruct.set(c, []);
    if (!parentsOfStruct.get(c).includes(p)) parentsOfStruct.get(c).push(p);
  });

  const parintiReali = new Map();
  const copiiReali   = new Map();
  parentEdges.forEach(e => {
    const p = String(e.source), c = String(e.target);
    if (!parintiReali.has(c)) parintiReali.set(c, []);
    if (!copiiReali.has(p)) copiiReali.set(p, []);
    parintiReali.get(c).push(p);
    copiiReali.get(p).push(c);
  });

  const focusUnitIdx = focusRootId != null ? personToUnit.get(String(focusRootId)) : undefined;
  const unitGen = units.map(u => generation.get(u.members[0]) ?? 0);
  const genderOf = (id) => (nodeMap.get(String(id))?.gender || '').toUpperCase();
  let selectedParentBranchMode = parentBranchMode || 'father-left';
  const positionUnits = (branchMode = selectedParentBranchMode) => (focusUnitIdx != null && focusUnitIdx >= 0)
    ? positionUnitsFocusRooted(
      units,
      focusUnitIdx,
      unitGen,
      parintiReali,
      copiiReali,
      focusRootId,
      genderOf,
      splitSides,
      anchorUp,
      centerChildren,
      branchMode,
    )
    : positionUnitsRT(units, roots, unitParent, parentsOfStruct);

  let centerX = positionUnits();

  const baricentruMembru = (mid) => {
    const xs = [];
    [...(parintiReali.get(mid) || []), ...(copiiReali.get(mid) || [])].forEach(vid => {
      const ui = personToUnit.get(vid);
      if (ui != null && centerX.has(ui)) xs.push(centerX.get(ui));
    });
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  units.forEach(u => {
    if (u.members.length < 2) return;
    const bs = u.members.map(baricentruMembru);
    if (bs.some(b => b == null)) return;

    let trend = 0;
    const mid = (bs.length - 1) / 2;
    bs.forEach((b, i) => { trend += b * (i - mid); });
    if (trend < 0) mirrorUnitMembers(u);
  });

  centerX = positionUnits();

  const maxGen = Math.max(0, ...[...generation.values()]);
  const dispGen = new Map();
  nodeMap.forEach((_, id) => {
    const g = generation.get(id) ?? 0;
    dispGen.set(id, ancestorMode ? (maxGen - g) : g);
  });

  const buildPosFromCenters = (centers) => {
    const nextPos = new Map();
    units.forEach((u, i) => {
      const cx = centers.get(i);
      if (cx == null) return;
      const dg = dispGen.get(u.members[0]) ?? 0;
      const y = dg * ROW_HEIGHT;

      const gs = u._gaps;
      const wSelf = u.members.length * NODE_WIDTH +
        (gs ? gs.reduce((a, b) => a + b, 0) : (u.members.length - 1) * COUPLE_GAP);
      let mx = cx - wSelf / 2;
      u.members.forEach((mid, j) => {
        nextPos.set(mid, { x: mx, y });
        mx += NODE_WIDTH + (gs ? (gs[j] ?? 0) : COUPLE_GAP);
      });
    });

    let mx = 0;
    nextPos.forEach(p => { if (p.x + NODE_WIDTH > mx) mx = p.x + NODE_WIDTH; });
    nodeMap.forEach((_, id) => {
      if (!nextPos.has(id)) {
        nextPos.set(id, { x: mx + H_GAP, y: (dispGen.get(id) || 0) * ROW_HEIGHT });
        mx += NODE_WIDTH + H_GAP;
      }
    });
    return nextPos;
  };

  const collectParentBranchInfo = () => {
    if (focusRootId == null) return null;
    const fp = (parintiReali.get(String(focusRootId)) || []).map(String);
    if (fp.length < 2) return null;
    const gen = (id) => genderOf(id);
    let father = fp.find(p => gen(p) === 'M');
    let mother = fp.find(p => gen(p) === 'F');
    if (!father && !mother) { father = fp[0]; mother = fp[1]; }
    else { father = father || fp.find(p => p !== mother); mother = mother || fp.find(p => p !== father); }
    if (!father || !mother) return null;

    const ancestorsOf = (rootId) => {
      const out = new Set();
      const q = [...(parintiReali.get(String(rootId)) || [])].map(String);
      while (q.length) {
        const id = String(q.shift());
        if (out.has(id)) continue;
        out.add(id);
        (parintiReali.get(id) || []).forEach(p => q.push(String(p)));
      }
      return out;
    };

    return {
      father,
      mother,
      fatherAncestors: ancestorsOf(father),
      motherAncestors: ancestorsOf(mother),
    };
  };

  const parentBranchInfo = collectParentBranchInfo();
  const branchSidePenalty = (candidatePos, mode) => {
    if (!parentBranchInfo) return 0;
    const focusPos = candidatePos.get(String(focusRootId));
    if (!focusPos) return 0;
    const focusCx = focusPos.x + NODE_WIDTH / 2;
    const fatherSide = mode === 'father-right' ? +1 : -1;
    const motherSide = -fatherSide;
    const rangeFor = (ids) => {
      const xs = [...ids]
        .map(id => candidatePos.get(String(id)))
        .filter(Boolean)
        .map(p => p.x + NODE_WIDTH / 2);
      if (!xs.length) return null;
      return { min: Math.min(...xs), max: Math.max(...xs), count: xs.length };
    };
    const scoreSet = (ids, wantedSide) => {
      let score = 0;
      ids.forEach(id => {
        const p = candidatePos.get(String(id));
        if (!p) return;
        const signedDistance = wantedSide * (p.x + NODE_WIDTH / 2 - focusCx);
        if (signedDistance < -NODE_WIDTH * 0.25) {
          score += 2500 + Math.abs(signedDistance) * 6;
        } else if (signedDistance < NODE_WIDTH * 0.5) {
          score += (NODE_WIDTH * 0.5 - signedDistance) * 1.5;
        }
      });
      return score;
    };

    let score = 0;
    score += scoreSet(parentBranchInfo.fatherAncestors, fatherSide);
    score += scoreSet(parentBranchInfo.motherAncestors, motherSide);

    const fRange = rangeFor(parentBranchInfo.fatherAncestors);
    const mRange = rangeFor(parentBranchInfo.motherAncestors);
    if (fRange && mRange) {
      const overlap = Math.min(fRange.max, mRange.max) - Math.max(fRange.min, mRange.min);
      if (overlap > -MIN_SUBTREE_GAP) score += (overlap + MIN_SUBTREE_GAP) * 12;
    }
    return score;
  };

  const branchModeCandidates = (
    parentBranchMode
      ? [parentBranchMode]
      : (parentBranchInfo && splitSides && !anchorUp && !centerChildren
        ? ['father-left', 'father-right']
        : [selectedParentBranchMode])
  );

  if (branchModeCandidates.length > 1) {
    const indexes = buildLocalIndexes(parentEdges, partnerEdges);
    const distances = graphDistanceFromFocus(
      focusRootId,
      indexes.childrenOf,
      indexes.parentsOf,
      indexes.partnersOf,
    );
    const focusLocalLimit = Math.min(DEFAULT_MAX_EDGE_LENGTH, NODE_WIDTH * 2.25);
    let best = null;
    branchModeCandidates.forEach(mode => {
      const candidateCenter = positionUnits(mode);
      const candidatePos = buildPosFromCenters(candidateCenter);
      const validation = validateFamilyBlockArrangement(
        buildValidationLayout(candidatePos, nodeMap, parentEdges, partnerEdges),
        null,
      );
      const longEdges = detectLongEdges(parentEdges, candidatePos, Math.max(DEFAULT_MAX_EDGE_LENGTH, NODE_WIDTH * 3.2));
      const focusLongEdges = focusRootId != null
        ? detectFocusLocalLongEdges(parentEdges, candidatePos, distances, focusLocalLimit)
        : [];
      const ancestorPenalty = ancestorPenaltyValue(candidatePos, partnerEdges, indexes);
      const branchPenalty = branchSidePenalty(candidatePos, mode);
      const score =
        validation.hardFailures * 100000 +
        validation.score +
        (validation.maxAncestorEdgeLength || 0) * 3 +
        longEdges.length * 9000 +
        focusLongEdges.length * 16000 +
        ancestorPenalty * 18 +
        branchPenalty;
      if (!best || score < best.score - 1) {
        best = { mode, center: candidateCenter, score };
      }
    });
    if (best) {
      selectedParentBranchMode = best.mode;
      centerX = best.center;
    }
  }

  const heavyPolishBudget = 110;
  const doHeavyPolish = nodeMap.size <= heavyPolishBudget;
  const mirrorPasses = doHeavyPolish ? 3 : 0;

  for (let pass = 0; pass < mirrorPasses; pass++) {
    centerX = positionUnits();
    const basePos = buildPosFromCenters(centerX);
    const baseValidation = validateFamilyBlockArrangement(
      buildValidationLayout(basePos, nodeMap, parentEdges, partnerEdges),
      null,
    );
    const baseScore = baseValidation.score;
    const baseIndexes = buildLocalIndexes(parentEdges, partnerEdges);
    const baseAncestorPenalty = ancestorPenaltyValue(basePos, partnerEdges, baseIndexes);
    const candidates = familyMirrorCandidateUnits(basePos, parentEdges, partnerEdges, personToUnit)
      .filter(i => units[i]?.members?.length > 1)
      .slice(0, 5);
    let best = null;

    candidates.forEach(i => {
      mirrorUnitMembers(units[i]);
      const candidateCenter = positionUnits();
      const candidatePos = buildPosFromCenters(candidateCenter);
      const candidateValidation = validateFamilyBlockArrangement(
        buildValidationLayout(candidatePos, nodeMap, parentEdges, partnerEdges),
        null,
      );
      if (candidateValidation.hardFailures > baseValidation.hardFailures) {
        mirrorUnitMembers(units[i]);
        return;
      }
      if (candidateValidation.maxAncestorEdgeLength > baseValidation.maxAncestorEdgeLength + NODE_WIDTH * 0.5) {
        mirrorUnitMembers(units[i]);
        return;
      }
      const candidateAncestorPenalty = ancestorPenaltyValue(candidatePos, partnerEdges, baseIndexes);
      if (candidateAncestorPenalty > baseAncestorPenalty + 1) {
        mirrorUnitMembers(units[i]);
        return;
      }
      const candidateScore = candidateValidation.score;
      mirrorUnitMembers(units[i]);
      if (candidateScore < (best?.score ?? baseScore) - 1) {
        best = { unit: i, score: candidateScore, center: candidateCenter };
      }
    });

    if (!best) break;
    mirrorUnitMembers(units[best.unit]);
    centerX = best.center;
  }

  const pos = buildPosFromCenters(centerX);

  const layoutDraft = doHeavyPolish
    ? optimizeFamilyBlocks(
      { pos, generation: dispGen, offsetY: 25 },
      nodeMap,
      parentEdges,
      partnerEdges,
    )
    : { pos };
  const finalPos = layoutDraft.pos;

  const brackets = buildBracketsFromEdges(finalPos, parentEdges, partnerEdges);

  let minX = Infinity, maxX = -Infinity, maxY = 0;
  finalPos.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.x + NODE_WIDTH > maxX) maxX = p.x + NODE_WIDTH;
    if (p.y + NODE_HEIGHT > maxY) maxY = p.y + NODE_HEIGHT;
  });

  return {
    pos: finalPos,
    units,
    brackets,
    generation: dispGen,
    parentBranchMode: selectedParentBranchMode,
    width: maxX - minX + 80,
    height: maxY + 80,
    offsetX: -minX + 40,
    offsetY: 25,
    positionedNodes: [...nodeMap.values()].map(n => {
      const p = finalPos.get(n.id);
      return { ...n, x: p?.x, y: p?.y, generation: dispGen.get(n.id) };
    }),
  };
}

function canShiftSubtree(layout, subtreeIds, dx, pad = 8) {
  if (!dx || Math.abs(dx) < 1) return false;
  const nodes = layout.positionedNodes.filter(n => n.x != null && n.y != null);
  const moving = nodes.filter(n => subtreeIds.has(String(n.id)));
  const fixed = nodes.filter(n => !subtreeIds.has(String(n.id)));
  for (const a of moving) {
    const ax0 = a.x + dx - pad;
    const ax1 = a.x + dx + (a.width || NODE_WIDTH) + pad;
    const ay0 = a.y - pad;
    const ay1 = a.y + (a.height || NODE_HEIGHT) + pad;
    for (const b of fixed) {
      if (Math.abs((b.y || 0) - (a.y || 0)) > NODE_HEIGHT) continue;
      const bx0 = b.x - pad;
      const bx1 = b.x + (b.width || NODE_WIDTH) + pad;
      const by0 = b.y - pad;
      const by1 = b.y + (b.height || NODE_HEIGHT) + pad;
      if (ax0 < bx1 && ax1 > bx0 && ay0 < by1 && ay1 > by0) return false;
    }
  }
  return true;
}

function refreshLayoutGeometry(layout, nodeMap, parentEdges, partnerEdges) {
  layout.brackets = buildBracketsFromEdges(layout.pos, parentEdges, partnerEdges);
  let minX = Infinity, maxX = -Infinity, maxY = 0;
  layout.pos.forEach(p => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x + NODE_WIDTH);
    maxY = Math.max(maxY, p.y + NODE_HEIGHT);
  });
  if (minX === Infinity) minX = 0;
  if (maxX === -Infinity) maxX = NODE_WIDTH;
  layout.width = maxX - minX + 80;
  layout.height = maxY + 80;
  layout.offsetX = -minX + 40;
  layout.offsetY = layout.offsetY ?? 25;
  layout.positionedNodes = [...nodeMap.values()].map(n => {
    const p = layout.pos.get(String(n.id));
    return { ...n, x: p?.x, y: p?.y, generation: layout.generation?.get(String(n.id)) };
  });
  return layout;
}

function keepConnectedTreeComponent(visibleNodes, visibleEdges, focusId) {
  if (!visibleNodes.length) return { nodes: visibleNodes, edges: visibleEdges, detachedIds: new Set() };
  const ids = new Set(visibleNodes.map(n => String(n.id)));
  const adj = new Map();
  ids.forEach(id => adj.set(id, new Set()));
  visibleEdges.forEach(e => {
    const s = String(e.source), t = String(e.target);
    if (!ids.has(s) || !ids.has(t)) return;
    adj.get(s).add(t);
    adj.get(t).add(s);
  });

  const componentFrom = (start) => {
    const seen = new Set();
    const q = [String(start)];
    while (q.length) {
      const id = q.shift();
      if (seen.has(id) || !ids.has(id)) continue;
      seen.add(id);
      (adj.get(id) || new Set()).forEach(n => {
        if (!seen.has(n)) q.push(n);
      });
    }
    return seen;
  };

  let keep = focusId != null && ids.has(String(focusId)) ? componentFrom(focusId) : null;
  if (!keep) {
    const visited = new Set();
    keep = new Set();
    ids.forEach(id => {
      if (visited.has(id)) return;
      const comp = componentFrom(id);
      comp.forEach(x => visited.add(x));
      if (comp.size > keep.size) keep = comp;
    });
  }

  const detachedIds = new Set([...ids].filter(id => !keep.has(id)));
  if (!detachedIds.size) return { nodes: visibleNodes, edges: visibleEdges, detachedIds };
  return {
    nodes: visibleNodes.filter(n => keep.has(String(n.id))),
    edges: visibleEdges.filter(e => keep.has(String(e.source)) && keep.has(String(e.target))),
    detachedIds,
  };
}

function placeSubtreeNearParent(layout, edge, indexes, nodeMap, parentEdges, partnerEdges, maxLength) {
  const { childrenOf, parentsOf, partnersOf } = indexes;
  const childId = String(edge.targetId);
  const visibleParents = [...(parentsOf.get(childId) || [])].filter(p => layout.pos.has(p));
  let parentX;
  if (visibleParents.length > 1) {
    const arePartners = visibleParents.length === 2 &&
      (partnersOf.get(visibleParents[0]) || new Set()).has(visibleParents[1]);
    if (!arePartners) return false;
    const pxs = visibleParents.map(p => layout.pos.get(p).x + NODE_WIDTH / 2);
    parentX = (Math.min(...pxs) + Math.max(...pxs)) / 2;
  } else if (visibleParents.length === 1) {
    const pp = layout.pos.get(visibleParents[0]);
    if (!pp) return false;
    parentX = pp.x + NODE_WIDTH / 2;
  } else {
    return false;
  }
  const box = getSubtreeBoundingBox(childId, childrenOf, partnersOf, layout.pos, new Set(visibleParents));
  if (!box || !box.ids.size) return false;
  const childPos = layout.pos.get(childId);
  if (!childPos) return false;
  const childX = childPos.x + NODE_WIDTH / 2;
  const sign = childX >= parentX ? 1 : -1;
  const align = parentX - childX;
  const desiredNear = parentX + sign * Math.min(maxLength * 0.45, NODE_WIDTH);
  const desiredMid = parentX + sign * Math.min(maxLength * 0.55, NODE_WIDTH * 1.5);
  const desiredLimit = parentX + sign * maxLength * 0.82;
  const candidates = [
    align,
    desiredNear - childX,
    desiredMid - childX,
    desiredLimit - childX,
  ].filter(dx => Math.abs(dx) > 1);
  for (const dx of candidates) {
    if (!canShiftSubtree(layout, box.ids, dx)) continue;
    box.ids.forEach(id => {
      const p = layout.pos.get(id);
      if (p) p.x += dx;
    });
    refreshLayoutGeometry(layout, nodeMap, parentEdges, partnerEdges);
    return true;
  }
  return false;
}

function resolveLongEdge(layout, edge, indexes, nodeMap, parentEdges, partnerEdges, maxLength) {
  return placeSubtreeNearParent(layout, edge, indexes, nodeMap, parentEdges, partnerEdges, maxLength);
}

function packSubtreeLocally(layout, edge, indexes, nodeMap, parentEdges, partnerEdges, maxLength) {
  return placeSubtreeNearParent(
    layout,
    edge,
    indexes,
    nodeMap,
    parentEdges,
    partnerEdges,
    Math.max(maxLength * 0.75, NODE_WIDTH * 2),
  );
}

function nodeCenterX(pos) {
  return pos ? pos.x + NODE_WIDTH / 2 : null;
}

function layoutCenterX(layout) {
  const xs = [];
  layout.pos?.forEach(p => {
    if (p?.x != null) xs.push(p.x + NODE_WIDTH / 2);
  });
  return xs.length ? xs.reduce((sum, x) => sum + x, 0) / xs.length : 0;
}

function branchNaturalDirection(layout, rootId, anchorIds = []) {
  const rootX = nodeCenterX(layout.pos?.get(String(rootId)));
  if (rootX == null) return 1;
  const anchorXs = anchorIds
    .map(id => nodeCenterX(layout.pos?.get(String(id))))
    .filter(x => x != null);
  const anchorX = anchorXs.length
    ? anchorXs.reduce((sum, x) => sum + x, 0) / anchorXs.length
    : layoutCenterX(layout);
  if (Math.abs(rootX - anchorX) > 1) return rootX >= anchorX ? 1 : -1;
  return rootX >= layoutCenterX(layout) ? 1 : -1;
}

function movedSubtreeOverlaps(layout, subtreeIds, dx = 0, pad = MIN_NODE_GAP) {
  const movingIds = new Set([...subtreeIds].map(String));
  const moving = [];
  const fixed = [];
  (layout.positionedNodes || []).forEach(node => {
    if (node.x == null || node.y == null) return;
    const box = {
      id: String(node.id),
      x: node.x,
      y: node.y,
      width: node.width || NODE_WIDTH,
      height: node.height || NODE_HEIGHT,
    };
    if (movingIds.has(box.id)) moving.push(box);
    else fixed.push(box);
  });
  for (const a of moving) {
    const ax0 = a.x + dx - pad;
    const ax1 = a.x + dx + a.width + pad;
    const ay0 = a.y - pad;
    const ay1 = a.y + a.height + pad;
    for (const b of fixed) {
      if (Math.min(ay1, b.y + b.height + pad) - Math.max(ay0, b.y - pad) <= 0) continue;
      if (ax0 < b.x + b.width + pad && ax1 > b.x - pad) return true;
    }
  }
  return false;
}

function outwardSideClearance(layout, box, subtreeIds, dir, dx = 0) {
  const movingIds = new Set([...subtreeIds].map(String));
  const minX = box.minX + dx;
  const maxX = box.maxX + dx;
  let clearance = Infinity;
  (layout.positionedNodes || []).forEach(node => {
    if (movingIds.has(String(node.id)) || node.x == null || node.y == null) return;
    const yOverlap = Math.min(box.maxY, node.y + (node.height || NODE_HEIGHT)) -
      Math.max(box.minY, node.y);
    if (yOverlap <= -NODE_HEIGHT * 0.25) return;
    if (dir > 0 && node.x >= maxX) clearance = Math.min(clearance, node.x - maxX);
    if (dir < 0) {
      const nodeMaxX = node.x + (node.width || NODE_WIDTH);
      if (nodeMaxX <= minX) clearance = Math.min(clearance, minX - nodeMaxX);
    }
  });
  return clearance;
}

function shiftedAnchorDistance(layout, rootId, anchorIds = [], dx = 0, movingIds = new Set()) {
  const rootPos = layout.pos?.get(String(rootId));
  const rootX = nodeCenterX(rootPos);
  if (rootX == null || !anchorIds.length) return 0;
  const distances = anchorIds
    .map(id => {
      const anchorX = nodeCenterX(layout.pos?.get(String(id)));
      if (anchorX == null) return null;
      return movingIds.has(String(id)) ? anchorX + dx : anchorX;
    })
    .filter(x => x != null)
    .map(anchorX => Math.abs((rootX + dx) - anchorX));
  return distances.length ? Math.min(...distances) : 0;
}

function tryKeepBranchExpandedLocally(
  layout,
  rootId,
  indexes,
  nodeMap,
  parentEdges,
  partnerEdges,
  options = {},
) {
  const root = String(rootId);
  const blockedIds = new Set((options.blockedIds || []).map(String));
  const box = getSubtreeBoundingBox(root, indexes.childrenOf, indexes.partnersOf, layout.pos, blockedIds);
  if (!box?.ids?.size) return null;

  const anchorIds = (options.anchorIds || []).map(String);
  const maxAnchorDistance = options.maxAnchorDistance ?? null;
  const dir = options.dir || branchNaturalDirection(layout, root, anchorIds);

  const rootX = nodeCenterX(layout.pos?.get(root));
  const anchorXs = anchorIds
    .map(id => nodeCenterX(layout.pos?.get(String(id))))
    .filter(x => x != null);
  const anchorCenter = anchorXs.length
    ? anchorXs.reduce((sum, x) => sum + x, 0) / anchorXs.length
    : null;
  const alignDx = (anchorCenter != null && rootX != null) ? anchorCenter - rootX : null;

  const evaluate = (dx) => {
    if (Math.abs(dx) > 1 && movedSubtreeOverlaps(layout, box.ids, dx)) return null;
    const anchorDistance = shiftedAnchorDistance(layout, root, anchorIds, dx, box.ids);
    if (maxAnchorDistance != null && anchorDistance > maxAnchorDistance) return null;
    const sideClearance = outwardSideClearance(layout, box, box.ids, dir, dx);
    if (sideClearance < MIN_SUBTREE_GAP) return null;
    return { dx, anchorDistance, sideClearance };
  };

  const apply = (best) => {
    if (Math.abs(best.dx) > 1) {
      box.ids.forEach(id => {
        const p = layout.pos.get(String(id));
        if (p) p.x += best.dx;
      });
      refreshLayoutGeometry(layout, nodeMap, parentEdges, partnerEdges);
    }
    return {
      id: root,
      shifted: Math.round(best.dx),
      direction: dir < 0 ? 'left' : 'right',
      anchorDistance: Math.round(best.anchorDistance),
      clearance: Number.isFinite(best.sideClearance) ? Math.round(best.sideClearance) : null,
    };
  };

  const stay = evaluate(0);
  if (stay) return apply(stay);

  const shifts = [];
  const pushShift = (dx) => {
    if (dx == null || Number.isNaN(dx)) return;
    shifts.push(dx);
  };
  pushShift(alignDx);
  if (alignDx != null && Math.abs(alignDx) > 1) {
    const inwardSign = Math.sign(alignDx) || 1;
    const span = Math.abs(alignDx);
    [0.8, 0.6, 0.4, 0.2].forEach(frac => pushShift(inwardSign * span * frac));
  }
  [
    dir * Math.max(MIN_SUBTREE_GAP, H_GAP * 2),
    dir * (NODE_WIDTH * 0.5 + H_GAP),
    dir * (NODE_WIDTH + H_GAP * 2),
    dir * (NODE_WIDTH * 1.5 + H_GAP * 3),
    dir * (NODE_WIDTH * 2 + H_GAP * 4),
  ].forEach(pushShift);

  const seen = new Set();
  let best = null;
  for (const dx of shifts) {
    const rounded = Math.round(dx);
    if (seen.has(rounded)) continue;
    seen.add(rounded);
    const res = evaluate(dx);
    if (!res) continue;
    if (!best ||
        res.anchorDistance < best.anchorDistance - 1 ||
        (Math.abs(res.anchorDistance - best.anchorDistance) <= 1 &&
         Math.abs(res.dx) < Math.abs(best.dx))) {
      best = res;
    }
  }
  if (!best) return null;
  return apply(best);
}

function collapseSubtreeIfNeeded(edge, indexes, distances, autoCollapsed, manuallyExpanded, focusId, maxEdgeLength, priorityIds = null, preserveCandidate = null) {
  const { childrenOf } = indexes;
  const sourceId = String(edge.sourceId);
  const targetId = String(edge.targetId);
  const subtreeSize = (rootId) => {
    const seen = new Set();
    const q = [...(childrenOf.get(rootId) || new Set())];
    while (q.length) {
      const cur = String(q.shift());
      if (seen.has(cur)) continue;
      seen.add(cur);
      (childrenOf.get(cur) || new Set()).forEach(c => q.push(c));
    }
    return seen.size;
  };
  const candidates = [sourceId, targetId]
    .filter((id, idx, arr) => arr.indexOf(id) === idx)
    .map(id => ({
      id,
      dist: distances.get(id) ?? 99,
      hidden: subtreeSize(id),
      priority: priorityIds?.has(String(id)) ? 1 : 0,
      anchorSide: id === sourceId ? 1 : 0,
    }))
    .filter(c => {
      const id = c.id;
      if (String(id) === String(focusId)) return false;
      if (autoCollapsed.has(id) || manuallyExpanded?.has(id)) return false;
      if (!(childrenOf.get(id) || new Set()).size) return false;
      return true;
    });
  if (!candidates.length) return null;

  const eligible = candidates;

  eligible.sort((a, b) =>
    b.priority - a.priority ||
    b.anchorSide - a.anchorSide ||
    a.hidden - b.hidden ||
    b.dist - a.dist ||
    a.id.localeCompare(b.id)
  );
  for (const candidate of eligible) {
    if (preserveCandidate?.(candidate.id)) continue;
    autoCollapsed.add(candidate.id);
    return candidate.id;
  }
  return null;
}

function detectFocusLocalLongEdges(parentEdges, pos, distances, focusLocalMaxLength) {
  return detectLongEdges(parentEdges, pos, focusLocalMaxLength)
    .filter(edge => {
      const sd = distances.get(String(edge.sourceId)) ?? 99;
      const td = distances.get(String(edge.targetId)) ?? 99;
      return Math.min(sd, td) <= 3;
    });
}

function parentStemJog(parentId, indexes, pos) {
  const p = pos.get(String(parentId));
  if (!p) return 0;
  const parentCx = p.x + NODE_WIDTH / 2;
  const childCxs = [...(indexes.childrenOf.get(String(parentId)) || new Set())]
    .map(c => pos.get(String(c)))
    .filter(Boolean)
    .map(c => c.x + NODE_WIDTH / 2);
  if (!childCxs.length) return 0;
  const lo = Math.min(...childCxs), hi = Math.max(...childCxs);
  if (parentCx < lo) return lo - parentCx;
  if (parentCx > hi) return parentCx - hi;
  return 0;
}

function keepStemLongEdges(longEdges, indexes, pos, minJog) {
  const jogCache = new Map();
  const jogOf = (id) => {
    const key = String(id);
    if (!jogCache.has(key)) jogCache.set(key, parentStemJog(key, indexes, pos));
    return jogCache.get(key);
  };
  return longEdges.filter(edge => jogOf(edge.sourceId) > minJog);
}

function familyBlockHasForeignInterleave(layout, bracket, indexes) {
  const childIds = (bracket.childIds || []).map(String);
  if (childIds.length < 2) return false;
  const childPos = childIds.map(id => layout.pos.get(id)).filter(Boolean);
  if (childPos.length < 2) return false;
  const centers = childPos.map(p => p.x + NODE_WIDTH / 2);
  const lo = Math.min(...centers), hi = Math.max(...centers);
  const rowTop = Math.min(...childPos.map(p => p.y));
  const rowBot = Math.max(...childPos.map(p => p.y + NODE_HEIGHT));

  const parentSet = new Set((bracket.parentIds || []).map(String));
  const blockIds = new Set([...parentSet, ...childIds]);
  childIds.forEach(c => {
    const box = getSubtreeBoundingBox(c, indexes.childrenOf, indexes.partnersOf, layout.pos, parentSet);
    box?.ids?.forEach(id => blockIds.add(String(id)));
  });

  return (layout.positionedNodes || []).some(n => {
    if (n.x == null || n.y == null) return false;
    if (blockIds.has(String(n.id))) return false;
    const cx = n.x + (n.width || NODE_WIDTH) / 2;
    if (cx <= lo || cx >= hi) return false;
    const yOverlap = Math.min(rowBot, n.y + (n.height || NODE_HEIGHT)) - Math.max(rowTop, n.y);
    return yOverlap > NODE_HEIGHT * 0.25;
  });
}

function collapseBrokenFamilyBlock(layout, indexes, distances, autoCollapsed, manuallyExpanded, focusId, priorityIds = null, preserveCandidate = null) {
  const issues = detectFamilyBlockBreakage(layout);
  if (!issues.length) return null;
  let bracket = null;
  for (const issue of issues) {
    const b = (layout.brackets || []).find(br => String(br.relationId) === String(issue.relationId));
    if (b && familyBlockHasForeignInterleave(layout, b, indexes)) { bracket = b; break; }
  }
  if (!bracket) return null;
  const candidates = (bracket.childIds || [])
    .map(id => String(id))
    .filter(id => id !== String(focusId))
    .filter(id => !autoCollapsed.has(id) && !manuallyExpanded?.has(id))
    .filter(id => (indexes.childrenOf.get(id) || new Set()).size > 0)
    .map(id => {
      const box = getSubtreeBoundingBox(id, indexes.childrenOf, indexes.partnersOf, layout.pos, new Set(bracket.parentIds || []));
      return {
        id,
        dist: distances.get(id) ?? 99,
        width: box?.width || 0,
        priority: priorityIds?.has(String(id)) ? 1 : 0,
      };
    })
    .sort((a, b) => b.priority - a.priority || b.dist - a.dist || b.width - a.width || a.id.localeCompare(b.id));
  if (!candidates.length) return null;
  for (const candidate of candidates) {
    if (preserveCandidate?.(candidate.id, bracket)) continue;
    autoCollapsed.add(candidate.id);
    return candidate.id;
  }
  return null;
}

function collapseInteriorSubtreeIfNeeded(layout, indexes, distances, autoCollapsed, manuallyExpanded, focusId, priorityIds = null) {
  const nodes = (layout.positionedNodes || []).filter(n => n.x != null && n.y != null);
  if (nodes.length < 3) return null;
  const allMinX = Math.min(...nodes.map(n => n.x));
  const allMaxX = Math.max(...nodes.map(n => n.x + (n.width || NODE_WIDTH)));
  const treeWidth = allMaxX - allMinX;
  if (treeWidth < NODE_WIDTH * 4) return null;

  const candidates = [];
  indexes.childrenOf.forEach((children, rootId) => {
    const root = String(rootId);
    if (!children?.size) return;
    if (root === String(focusId)) return;
    if (autoCollapsed.has(root) || manuallyExpanded?.has(root)) return;
    if (!layout.pos.has(root)) return;

    const parents = [...(indexes.parentsOf.get(root) || new Set())].map(String);
    const box = getSubtreeBoundingBox(root, indexes.childrenOf, indexes.partnersOf, layout.pos, new Set(parents));
    if (!box?.ids?.size || box.ids.size < 2) return;

    const dir = branchNaturalDirection(layout, root, parents);
    const onNaturalEdge = dir < 0
      ? box.minX <= allMinX + NODE_WIDTH * 1.25
      : box.maxX >= allMaxX - NODE_WIDTH * 1.25;
    if (onNaturalEdge) return;

    if (!movedSubtreeOverlaps(layout, box.ids, 0, 0)) return;

    candidates.push({
      id: root,
      priority: priorityIds?.has(root) ? 1 : 0,
      dist: distances.get(root) ?? 99,
      width: box.width,
    });
  });

  if (!candidates.length) return null;
  candidates.sort((a, b) =>
    b.priority - a.priority ||
    b.dist - a.dist ||
    b.width - a.width ||
    a.id.localeCompare(b.id)
  );
  autoCollapsed.add(candidates[0].id);
  return candidates[0].id;
}

function recomputeLayoutAround(nodeMap, partnerEdges, parentEdges, focusId, ancestorMode, anchorUp, centerChildren, splitSides) {
  return computeRawLayout(nodeMap, partnerEdges, parentEdges, ancestorMode, focusId, { anchorUp, centerChildren, splitSides });
}

function keepPartnersVisible(hidden, nodes, partnerEdges) {
  if (!hidden.size) return hidden;
  const allIds = new Set(nodes.map(n => String(n.id)));
  const partnerAdj = new Map();
  partnerEdges.forEach(e => {
    const s = String(e.source), t = String(e.target);
    if (!allIds.has(s) || !allIds.has(t)) return;
    if (!partnerAdj.has(s)) partnerAdj.set(s, new Set());
    if (!partnerAdj.has(t)) partnerAdj.set(t, new Set());
    partnerAdj.get(s).add(t);
    partnerAdj.get(t).add(s);
  });

  const next = new Set(hidden);
  let changed = true;
  while (changed) {
    changed = false;
    allIds.forEach(id => {
      if (next.has(id)) return;
      (partnerAdj.get(id) || new Set()).forEach(partnerId => {
        if (!next.has(partnerId)) return;
        next.delete(partnerId);
        changed = true;
      });
    });
  }
  return next;
}

function computeFocusBloodSet(edges, focusId) {
  const fid = String(focusId);
  const parentEdges = edges.filter(e =>
    ['BIRTH_PARENT', 'STEP_PARENT', 'ADOPTIVE_PARENT'].includes(e.type)
  );
  const parentsOf = new Map();
  const childrenOf = new Map();
  parentEdges.forEach(e => {
    const p = String(e.source), c = String(e.target);
    if (!parentsOf.has(c)) parentsOf.set(c, new Set());
    if (!childrenOf.has(p)) childrenOf.set(p, new Set());
    parentsOf.get(c).add(p);
    childrenOf.get(p).add(c);
  });

  const ancestors = new Set();
  const ancestorQueue = [...(parentsOf.get(fid) || [])];
  while (ancestorQueue.length) {
    const id = String(ancestorQueue.shift());
    if (ancestors.has(id)) continue;
    ancestors.add(id);
    (parentsOf.get(id) || new Set()).forEach(p => ancestorQueue.push(p));
  }

  const bloodSet = new Set();
  const queue = [fid, ...ancestors];
  while (queue.length) {
    const id = String(queue.shift());
    if (bloodSet.has(id)) continue;
    bloodSet.add(id);
    (childrenOf.get(id) || new Set()).forEach(c => queue.push(c));
  }
  return { bloodSet, childrenOf, parentsOf };
}

function seedInLawBranchCollapse(edges, focusId, autoCollapsed, manuallyExpanded) {
  if (!focusId) return [];
  const { bloodSet, childrenOf, parentsOf } = computeFocusBloodSet(edges, focusId);
  const partnerEdges = edges.filter(e => e.type === 'PARTNER');
  const collapsed = [];
  const subtreeSize = (rootId) => {
    const seen = new Set();
    const q = [...(childrenOf.get(rootId) || new Set())];
    while (q.length) {
      const id = String(q.shift());
      if (seen.has(id) || bloodSet.has(id)) continue;
      seen.add(id);
      (childrenOf.get(id) || new Set()).forEach(c => q.push(c));
    }
    return seen.size;
  };

  const collapseRoot = (rootId, inlawId) => {
    const root = String(rootId);
    if (root === String(focusId)) return;
    if (bloodSet.has(root)) return;
    if (autoCollapsed.has(root) || manuallyExpanded?.has(root)) return;
    if (!(childrenOf.get(root) || new Set()).size) return;
    const visibleBloodParent = [...(parentsOf.get(root) || new Set())].some(p => bloodSet.has(String(p)));
    if (visibleBloodParent) return;
    const hidden = subtreeSize(root);
    if (!hidden) return;
    autoCollapsed.add(root);
    collapsed.push({ id: root, inlawId, hidden });
  };

  partnerEdges.forEach(edge => {
    const a = String(edge.source), b = String(edge.target);
    const pairs = [[a, b], [b, a]];
    pairs.forEach(([inlawId, bloodId]) => {
      if (bloodSet.has(inlawId)) return;
      if (!bloodSet.has(bloodId)) return;
      if (manuallyExpanded?.has(inlawId)) return;
      (childrenOf.get(inlawId) || new Set()).forEach(childId => collapseRoot(childId, inlawId));
    });
  });

  return collapsed;
}

function buildProximityCollisionReport(layout, nodeMap, partnerEdges) {
  const links = (partnerEdges || [])
    .filter(e => layout.pos.has(String(e.source)) && layout.pos.has(String(e.target)))
    .map(e => {
      const sid = String(e.source), tid = String(e.target);
      const sp = layout.pos.get(sid), tp = layout.pos.get(tid);
      return {
        source: { ...nodeMap.get(sid), ...sp, width: NODE_WIDTH, height: NODE_HEIGHT },
        target: { ...nodeMap.get(tid), ...tp, width: NODE_WIDTH, height: NODE_HEIGHT },
        type: 'PARTNER',
        relation_id: e.relation_id,
        partner_type: e.partner_type,
      };
    });
  return detectLayoutCollisions(
    { positionedNodes: layout.positionedNodes || [], links, brackets: layout.brackets || [] },
    { nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT },
  );
}

function computeAutoCollapse(nodes, edges, focusId, manuallyExpanded, manuallyCollapsed, ancestorMode, anchorUp = false, centerChildren = false, splitSides = true, proximityOptions = {}) {
  const partnerEdges = edges.filter(e => e.type === 'PARTNER');
  const parentEdges = edges.filter(e =>
    ['BIRTH_PARENT', 'STEP_PARENT', 'ADOPTIVE_PARENT'].includes(e.type)
  );

  const autoCollapsedProximity = new Set(manuallyCollapsed || []);
  const focusBlood = focusId ? computeFocusBloodSet(edges, focusId).bloodSet : new Set();
  const inlawSeedCollapsed = [];
  const proximityEnabled = proximityOptions.enabled !== false && !ancestorMode;
  const maxEdgeLength = proximityOptions.maxEdgeLength || Math.max(DEFAULT_MAX_EDGE_LENGTH, NODE_WIDTH * 3.2);
  const focusLocalMaxLength = Math.min(maxEdgeLength, NODE_WIDTH * 2.25);
  const stemJogThreshold = Math.max(NODE_WIDTH * 0.75, MIN_SUBTREE_GAP);
  const proximityReport = {
    maxEdgeLength,
    focusLocalMaxLength,
    moved: [],
    localExpanded: [],
    collapsed: inlawSeedCollapsed.map(item => ({
      id: item.id,
      reason: 'ramura prin alianta',
      inlawId: item.inlawId,
      hidden: item.hidden,
    })),
    unresolved: [],
  };
  let proximityLayout = null;

  proximityPass:
  for (let pass = 0; pass < 5; pass++) {
    const hidden = keepPartnersVisible(
      expandHiddenSet(autoCollapsedProximity, parentEdges, focusId, manuallyExpanded),
      nodes,
      partnerEdges,
    );
    let visibleNodes = nodes.filter(n => !hidden.has(String(n.id)));
    const visIds = new Set(visibleNodes.map(n => String(n.id)));
    let visibleEdges = edges.filter(e =>
      visIds.has(String(e.source)) && visIds.has(String(e.target))
    );
    const connected = keepConnectedTreeComponent(visibleNodes, visibleEdges, focusId);
    visibleNodes = connected.nodes;
    visibleEdges = connected.edges;
    if (connected.detachedIds.size) {
      proximityReport.detached = (proximityReport.detached || 0) + connected.detachedIds.size;
    }
    const nodeMap = new Map();
    visibleNodes.forEach(n => nodeMap.set(String(n.id), { ...n, id: String(n.id) }));
    const vPartner = visibleEdges.filter(e => e.type === 'PARTNER');
    const vParent = visibleEdges.filter(e =>
      ['BIRTH_PARENT', 'STEP_PARENT', 'ADOPTIVE_PARENT'].includes(e.type)
    );

    proximityLayout = recomputeLayoutAround(nodeMap, vPartner, vParent, focusId, ancestorMode, anchorUp, centerChildren, splitSides);
    if (!proximityEnabled) return { layout: proximityLayout, autoCollapsed: autoCollapsedProximity, proximityReport };

    const indexes = buildLocalIndexes(vParent, vPartner);
    const distances = graphDistanceFromFocus(focusId, indexes.childrenOf, indexes.parentsOf, indexes.partnersOf);
    const secondaryCollapsePriority = new Set(
      [...distances.keys()].filter(id => !focusBlood.has(String(id)))
    );
    const preserveBranchLocally = (rootId, details = {}) => {
      const root = String(rootId);
      const parentBlockers = [...(indexes.parentsOf.get(root) || new Set())];
      const kept = tryKeepBranchExpandedLocally(
        proximityLayout,
        root,
        indexes,
        nodeMap,
        vParent,
        vPartner,
        {
          anchorIds: details.anchorIds || parentBlockers,
          blockedIds: details.blockedIds || parentBlockers,
          dir: details.dir,
          maxAnchorDistance: details.maxAnchorDistance,
        },
      );
      if (!kept) return false;
      proximityReport.localExpanded.push({
        ...kept,
        reason: details.reason || 'spatiu local disponibil',
        source: details.source,
        target: details.target,
      });
      return true;
    };

    for (let movePass = 0; movePass < 3; movePass++) {
      const longEdges = keepStemLongEdges([
        ...detectFocusLocalLongEdges(vParent, proximityLayout.pos, distances, focusLocalMaxLength),
        ...detectLongEdges(vParent, proximityLayout.pos, maxEdgeLength),
      ].filter((edge, idx, arr) =>
        arr.findIndex(other => other.sourceId === edge.sourceId && other.targetId === edge.targetId) === idx
      ), indexes, proximityLayout.pos, stemJogThreshold);
      if (!longEdges.length) break;
      let moved = false;
      for (const edge of longEdges.slice(0, 8)) {
        if (
          resolveLongEdge(proximityLayout, edge, indexes, nodeMap, vParent, vPartner, maxEdgeLength) ||
          packSubtreeLocally(proximityLayout, edge, indexes, nodeMap, vParent, vPartner, maxEdgeLength)
        ) {
          proximityReport.moved.push({ source: edge.sourceId, target: edge.targetId, length: Math.round(edge.length) });
          moved = true;
        }
      }
      if (!moved) break;
    }

    const collisionReport = buildProximityCollisionReport(proximityLayout, nodeMap, vPartner);
    const realCollision = collisionReport.nodeOverlaps.length > 0 ||
      collisionReport.lineNodeCollisions.length > 0;
    if (!realCollision) {
      return { layout: proximityLayout, autoCollapsed: autoCollapsedProximity, proximityReport };
    }

    const collapsedBlock = collapseBrokenFamilyBlock(
      proximityLayout, indexes, distances, autoCollapsedProximity, manuallyExpanded, focusId,
      secondaryCollapsePriority,
      (id, bracket) => preserveBranchLocally(id, {
        anchorIds: bracket?.parentIds || [],
        blockedIds: bracket?.parentIds || [],
        maxAnchorDistance: maxEdgeLength,
        reason: 'family block pastrat local',
      }),
    );
    if (collapsedBlock) {
      proximityReport.collapsed.push({ id: collapsedBlock, reason: 'coliziune reala: bloc familial rupt' });
      continue proximityPass;
    }
    const collapsedInterior = collapseInteriorSubtreeIfNeeded(
      proximityLayout, indexes, distances, autoCollapsedProximity, manuallyExpanded, focusId,
      secondaryCollapsePriority,
    );
    if (collapsedInterior) {
      proximityReport.collapsed.push({ id: collapsedInterior, reason: 'coliziune reala: ramura suprapusa' });
      continue proximityPass;
    }

    proximityReport.unresolved = [
      ...collisionReport.nodeOverlaps.map(o => ({ kind: 'node-overlap', a: o.a, b: o.b })),
      ...collisionReport.lineNodeCollisions.map(o => ({ kind: 'line-through-node', node: o.node })),
    ];
    return { layout: proximityLayout, autoCollapsed: autoCollapsedProximity, proximityReport };
  }

  return { layout: proximityLayout, autoCollapsed: autoCollapsedProximity, proximityReport };

  const autoCollapsed = new Set(manuallyCollapsed || []);
  const hidden = expandHiddenSet(autoCollapsed, parentEdges, focusId, manuallyExpanded);

  const visibleNodes = nodes.filter(n => !hidden.has(String(n.id)));
  const visIds = new Set(visibleNodes.map(n => String(n.id)));
  const visibleEdges = edges.filter(e =>
    visIds.has(String(e.source)) && visIds.has(String(e.target))
  );
  const nodeMap = new Map();
  visibleNodes.forEach(n => nodeMap.set(String(n.id), { ...n, id: String(n.id) }));
  const vPartner = visibleEdges.filter(e => e.type === 'PARTNER');
  const vParent = visibleEdges.filter(e =>
    ['BIRTH_PARENT', 'STEP_PARENT', 'ADOPTIVE_PARENT'].includes(e.type)
  );

  const layout = computeRawLayout(nodeMap, vPartner, vParent, ancestorMode, focusId, { anchorUp, centerChildren, splitSides });
  return { layout, autoCollapsed };
}

function expandHiddenSet(collapsedSet, parentEdges, focusId, manuallyExpanded) {
  const childrenOf = new Map();
  parentEdges.forEach(e => {
    const p = String(e.source), c = String(e.target);
    if (!childrenOf.has(p)) childrenOf.set(p, new Set());
    childrenOf.get(p).add(c);
  });
  const parentsOf = new Map();
  parentEdges.forEach(e => {
    const p = String(e.source), c = String(e.target);
    if (!parentsOf.has(c)) parentsOf.set(c, new Set());
    parentsOf.get(c).add(p);
  });

  const hidden = new Set();
  collapsedSet.forEach(parentId => {
    const queue = [...(childrenOf.get(parentId) || [])];
    while (queue.length) {
      const cur = queue.shift();
      if (hidden.has(cur)) continue;
      if (manuallyExpanded?.has(cur)) continue;
      if (String(cur) === String(focusId)) continue;

      const otherParents = [...(parentsOf.get(cur) || [])].filter(p => p !== parentId);
      const otherParentVisible = otherParents.some(p => !collapsedSet.has(p) && !hidden.has(p));
      if (otherParentVisible) continue;

      hidden.add(cur);
      (childrenOf.get(cur) || []).forEach(c => queue.push(c));
    }
  });
  return hidden;
}

function computeSecondaryAncestorCollapse(nodes, edges, childConvs, manuallyExpandedAncestors, focusId) {
  const counts = new Map();
  const collapsedAt = new Set();
  const hidden = new Set();
  if (!childConvs.length) return { hidden, counts, collapsedAt };

  const parentEdges = edges.filter(e =>
    ['BIRTH_PARENT', 'STEP_PARENT', 'ADOPTIVE_PARENT'].includes(e.type)
  );
  const parentsOf = new Map();
  const childEdgesOf = new Map();
  parentEdges.forEach(e => {
    const p = String(e.source), c = String(e.target);
    if (!parentsOf.has(c)) parentsOf.set(c, new Set());
    parentsOf.get(c).add(p);
    if (!childEdgesOf.has(p)) childEdgesOf.set(p, []);
    childEdgesOf.get(p).push({ c, key: convKey(edgeRid(e), c) });
  });

  const collapsedKeys = new Set();
  const seeds = [];
  childConvs.forEach(({ relationId, childId }) => {
    const cid = String(childId);
    if (manuallyExpandedAncestors?.has(cid)) return;
    const key = convKey(relationId, cid);
    collapsedKeys.add(key);
    const ps = parentEdges
      .filter(e => convKey(edgeRid(e), String(e.target)) === key)
      .map(e => String(e.source));
    seeds.push({ childId: cid, parents: ps });
  });
  if (!collapsedKeys.size) return { hidden, counts, collapsedAt };

  const keepsVisible = (p) =>
    (childEdgesOf.get(p) || []).some(({ c, key }) =>
      !collapsedKeys.has(key) && !hidden.has(c)
    );

  let changed = true;
  while (changed) {
    changed = false;
    seeds.forEach(({ parents }) => {
      const q = [...parents];
      while (q.length) {
        const p = q.shift();
        if (hidden.has(p)) continue;
        if (String(p) === String(focusId)) continue;
        if (manuallyExpandedAncestors?.has(p)) continue;
        if (keepsVisible(p)) continue;
        hidden.add(p);
        changed = true;
        (parentsOf.get(p) || []).forEach(pp => q.push(pp));
      }
    });
  }

  seeds.forEach(({ childId, parents }) => {
    const seen = new Set();
    let n = 0;
    const q = [...parents];
    while (q.length) {
      const p = q.shift();
      if (seen.has(p)) continue;
      seen.add(p);
      if (!hidden.has(p)) continue;
      n++;
      (parentsOf.get(p) || []).forEach(pp => q.push(pp));
    }
    if (n > 0) { counts.set(childId, n); collapsedAt.add(childId); }
  });

  return { hidden, counts, collapsedAt };
}

function computeInLawAncestorCollapse(nodes, edges, focusId, manuallyExpandedAncestors, skipIds) {
  const counts = new Map();
  const collapsedAt = new Set();
  const hidden = new Set();
  const bySpouse = new Map();
  if (!focusId) return { hidden, counts, collapsedAt, bySpouse, bloodSet: new Set() };
  const fid = String(focusId);
  if (!nodes.some(n => String(n.id) === fid)) return { hidden, counts, collapsedAt, bySpouse, bloodSet: new Set() };

  const partnerEdges = edges.filter(e => e.type === 'PARTNER');
  const parentEdges = edges.filter(e =>
    ['BIRTH_PARENT', 'STEP_PARENT', 'ADOPTIVE_PARENT'].includes(e.type)
  );
  const parentsOf = new Map();
  const childrenOf = new Map();
  parentEdges.forEach(e => {
    const p = String(e.source), c = String(e.target);
    if (!parentsOf.has(c)) parentsOf.set(c, new Set());
    if (!childrenOf.has(p)) childrenOf.set(p, new Set());
    parentsOf.get(c).add(p); childrenOf.get(p).add(c);
  });

  const ancestorsOfId = (start) => {
    const res = new Set();
    const q = [...(parentsOf.get(String(start)) || [])];
    while (q.length) {
      const cur = q.shift();
      if (res.has(cur)) continue;
      res.add(cur);
      (parentsOf.get(cur) || []).forEach(p => q.push(p));
    }
    return res;
  };
  const partnersOf = new Map();
  partnerEdges.forEach(e => {
    const a = String(e.source), b = String(e.target);
    if (!partnersOf.has(a)) partnersOf.set(a, new Set());
    if (!partnersOf.has(b)) partnersOf.set(b, new Set());
    partnersOf.get(a).add(b); partnersOf.get(b).add(a);
  });

  const focusAnc = ancestorsOfId(fid);
  const bloodSeeds = new Set([fid]);
  const anc = new Set(focusAnc);
  (partnersOf.get(fid) || []).forEach(p => {
    const pa = ancestorsOfId(p);
    if (pa.size > focusAnc.size) {
      bloodSeeds.add(String(p));
      pa.forEach(a => anc.add(a));
    }
  });

  const bloodSet = new Set();
  {
    const q = [...bloodSeeds, ...anc];
    while (q.length) {
      const cur = q.shift();
      if (bloodSet.has(cur)) continue;
      bloodSet.add(cur);
      (childrenOf.get(cur) || []).forEach(k => q.push(k));
    }
  }

  const visibleAncestors = (id) => {
    const res = new Set();
    const q = [...(parentsOf.get(id) || [])];
    while (q.length) {
      const cur = q.shift();
      if (res.has(cur) || hidden.has(cur)) continue;
      res.add(cur);
      (parentsOf.get(cur) || []).forEach(p => q.push(p));
    }
    return res;
  };

  const processed = new Set();
  partnerEdges.forEach(e => {
    const a = String(e.source), b = String(e.target);
    const key = [a, b].sort().join('|');
    if (processed.has(key)) return;
    processed.add(key);
    [[a, b], [b, a]].forEach(([inlaw, blood]) => {
      if (bloodSet.has(inlaw)) return;
      if (!bloodSet.has(blood)) return;
      if (skipIds && skipIds.has(inlaw)) return;
      if (manuallyExpandedAncestors?.has(inlaw)) return;
      const ancestors = visibleAncestors(inlaw);
      const ancOfSpouse = new Set();
      ancestors.forEach(p => {
        if (p === fid) return;
        if (bloodSet.has(p)) return;
        if (manuallyExpandedAncestors?.has(p)) return;
        hidden.add(p); ancOfSpouse.add(p);
      });
      if (ancOfSpouse.size) {
        counts.set(inlaw, ancOfSpouse.size);
        collapsedAt.add(inlaw);
        bySpouse.set(inlaw, ancOfSpouse);
      }
    });
  });

  return { hidden, counts, collapsedAt, bySpouse, bloodSet };
}

function decideInLawLinesByFeasibility(workingNodes, workingEdges, candidates, baseHidden, isDiamondEdge, focusId, manuallyExpanded, manuallyCollapsed) {
  const decisions = new Map();
  if (!candidates.length) return decisions;

  const allCandAnc = new Set();
  candidates.forEach(c => c.ancSet.forEach(a => allCandAnc.add(a)));
  const skNodes = workingNodes.filter(n => {
    const id = String(n.id);
    return !baseHidden.has(id) && !allCandAnc.has(id);
  });
  const skIds = new Set(skNodes.map(n => String(n.id)));
  const skEdges = workingEdges.filter(e =>
    skIds.has(String(e.source)) && skIds.has(String(e.target)) && !isDiamondEdge(e)
  );
  const { layout: sk } = computeAutoCollapse(
    skNodes, skEdges, focusId, manuallyExpanded, manuallyCollapsed, false,
    false, false, true, { enabled: false }
  );

  const mergeIvs = (ivs) => {
    ivs.sort((a, b) => a[0] - b[0]);
    const merged = [];
    ivs.forEach(iv => {
      const last = merged[merged.length - 1];
      if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
      else merged.push([iv[0], iv[1]]);
    });
    return merged;
  };
  const occ = new Map();
  sk.pos.forEach(({ x, y }) => {
    const row = Math.round(y / ROW_HEIGHT);
    if (!occ.has(row)) occ.set(row, []);
    occ.get(row).push([x, x + NODE_WIDTH]);
  });
  occ.forEach((ivs, row) => occ.set(row, mergeIvs(ivs)));
  const skeletonBoxes = [...sk.pos.values()].filter(p => p && p.x != null);
  const minOccX = skeletonBoxes.length ? Math.min(...skeletonBoxes.map(p => p.x)) : 0;
  const maxOccX = skeletonBoxes.length ? Math.max(...skeletonBoxes.map(p => p.x + NODE_WIDTH)) : NODE_WIDTH;

  const freeGapBeside = (row, x, dir) => {
    const ivs = occ.get(row);
    if (!ivs || !ivs.length) return [-Infinity, Infinity];
    let cover = null, prevEnd = -Infinity, nextStart = Infinity;
    for (const iv of ivs) {
      if (iv[0] <= x && x <= iv[1]) cover = iv;
      else if (iv[1] < x) prevEnd = Math.max(prevEnd, iv[1]);
      else nextStart = Math.min(nextStart, iv[0]);
    }
    if (!cover) return [prevEnd, nextStart];
    return dir < 0 ? [prevEnd, cover[0]] : [cover[1], nextStart];
  };

  const childrenOf = new Map();
  const partnersOf = new Map();
  workingEdges.forEach(e => {
    const s = String(e.source), t = String(e.target);
    if (['BIRTH_PARENT', 'STEP_PARENT', 'ADOPTIVE_PARENT'].includes(e.type)) {
      if (!childrenOf.has(s)) childrenOf.set(s, []);
      childrenOf.get(s).push(t);
    } else if (e.type === 'PARTNER') {
      if (!partnersOf.has(s)) partnersOf.set(s, []);
      if (!partnersOf.has(t)) partnersOf.set(t, []);
      partnersOf.get(s).push(t);
      partnersOf.get(t).push(s);
    }
  });
  const footprintByDepth = (spouseId, ancSet) => {
    const depth = new Map([[spouseId, 0]]);
    ancSet.forEach(a => depth.set(a, 1));
    let changed = true, guard = 0;
    while (changed && guard++ <= ancSet.size + 1) {
      changed = false;
      ancSet.forEach(a => {
        let d = depth.get(a);
        (childrenOf.get(a) || []).forEach(c => {
          if (!depth.has(c) || c === a) return;
          d = Math.max(d, depth.get(c) + 1);
        });
        if (d !== depth.get(a)) { depth.set(a, d); changed = true; }
      });
    }

    const widths = new Map();
    const seen = new Set();
    ancSet.forEach(a => {
      if (seen.has(a)) return;
      const comp = [a]; seen.add(a);
      for (let i = 0; i < comp.length; i++) {
        (partnersOf.get(comp[i]) || []).forEach(p => {
          if (ancSet.has(p) && !seen.has(p)) { seen.add(p); comp.push(p); }
        });
      }
      const d = Math.max(...comp.map(m => depth.get(m)));
      const w = comp.length * NODE_WIDTH + (comp.length - 1) * COUPLE_GAP;
      if (!widths.has(d)) widths.set(d, []);
      widths.get(d).push(w);
    });
    const fw = new Map();
    widths.forEach((ws, d) => fw.set(d, ws.reduce((a, b) => a + b, 0) + (ws.length - 1) * H_GAP));

    return fw;
  };

  const xOf = (id) => { const p = sk.pos.get(String(id)); return p ? p.x + NODE_WIDTH / 2 : null; };
  const centerRef = xOf(focusId) ?? 0;
  const treeMid = (minOccX + maxOccX) / 2;
  const sideFor = (x) => {
    if (x < centerRef) return 'left';
    if (x > centerRef) return 'right';
    return x <= treeMid ? 'left' : 'right';
  };
  const hasOccupiedOnBothSides = (row, x) => {
    const ivs = occ.get(row) || [];
    return ivs.some(iv => iv[1] < x - H_GAP) && ivs.some(iv => iv[0] > x + H_GAP);
  };
  const classifyPlacement = (sp, row) => {
    const x = sp.x + NODE_WIDTH / 2;
    const wideEnough = maxOccX - minOccX > NODE_WIDTH * 4;
    const betweenMainBounds = wideEnough
      && x > minOccX + NODE_WIDTH * 1.25
      && x < maxOccX - NODE_WIDTH * 1.25;
    return {
      inline: false,
      interior: betweenMainBounds && hasOccupiedOnBothSides(row, x),
      side: sideFor(x),
    };
  };
  const ordered = [...candidates].sort((a, b) =>
    ((b.isExpanded ? 1 : 0) - (a.isExpanded ? 1 : 0)) ||
    (Math.abs((xOf(b.id) ?? 0) - centerRef) - Math.abs((xOf(a.id) ?? 0) - centerRef)) ||
    String(a.id).localeCompare(String(b.id))
  );

  const CLEARANCE = Math.max(H_GAP, NODE_WIDTH * 0.35);
  const REACH = NODE_WIDTH * 1.9;
  for (const cand of ordered) {
    const sp = sk.pos.get(String(cand.id));
    if (!sp || !cand.ancSet.size) {
      decisions.set(cand.id, { inline: false, interior: true, side: 'right' });
      continue;
    }
    const rowS = Math.round(sp.y / ROW_HEIGHT);
    const placement = classifyPlacement(sp, rowS);
    const fw = footprintByDepth(String(cand.id), cand.ancSet);

    let mL = sp.x + NODE_WIDTH / 2, mR = mL;
    (partnersOf.get(String(cand.id)) || []).forEach(p => {
      const pp = sk.pos.get(String(p));
      if (!pp || Math.round(pp.y / ROW_HEIGHT) !== rowS) return;
      if (Math.abs(pp.x - sp.x) > (NODE_WIDTH + COUPLE_GAP) * 2.5) return;
      const cx = pp.x + NODE_WIDTH / 2;
      mL = Math.min(mL, cx);
      mR = Math.max(mR, cx);
    });
    const probeL = mL - NODE_WIDTH / 2, probeR = mR + NODE_WIDTH / 2;

    let best = null;

    const maxFw = Math.max(...fw.values());
    const reach = maxFw <= NODE_WIDTH * 2.2 ? REACH : NODE_WIDTH * 1.3;
    const preferredDir = placement.side === 'left' ? -1 : 1;
    const dirs = placement.interior ? [preferredDir] : [preferredDir, -preferredDir];
    for (const dir of dirs) {
      const xs = dir < 0 ? probeL : probeR;
      let cLo = -Infinity, cHi = Infinity;
      for (const [d, w] of fw) {
        const [a, b] = freeGapBeside(rowS - d, xs, dir);
        cLo = Math.max(cLo, a + CLEARANCE + w / 2);
        cHi = Math.min(cHi, b - CLEARANCE - w / 2);
        if (cLo > cHi) break;
      }
      if (cLo > cHi) continue;
      const c = Math.max(cLo, Math.min(cHi, xs));
      const dist = Math.abs(c - xs);
      if (dist <= reach && (!best || dist < best.dist)) best = { c, dist, dir };
    }

    placement.inline = !!best;
    decisions.set(cand.id, placement);
    if (!best) continue;
    for (const [d, w] of fw) {
      const row = rowS - d;
      const ivs = occ.get(row) || [];
      ivs.push([best.c - w / 2, best.c + w / 2]);
      occ.set(row, mergeIvs(ivs));
    }
  }

  return decisions;
}

function computeBowtieLayout(nodes, edges, focusId, compact, activeSpouseId) {
  const valid = nodes.filter(n => !isUnknownPerson(n));
  const nodeById = new Map(valid.map(n => [String(n.id), n]));
  const parentsOf = new Map();
  const childrenOf = new Map();
  const partnersOf = new Map();
  edges.forEach(e => {
    const s = String(e.source), t = String(e.target);
    if (!nodeById.has(s) || !nodeById.has(t)) return;
    if (['BIRTH_PARENT', 'STEP_PARENT', 'ADOPTIVE_PARENT'].includes(e.type)) {
      if (!parentsOf.has(t)) parentsOf.set(t, []);
      if (!parentsOf.get(t).includes(s)) parentsOf.get(t).push(s);
      if (!childrenOf.has(s)) childrenOf.set(s, []);
      if (!childrenOf.get(s).includes(t)) childrenOf.get(s).push(t);
    } else if (e.type === 'PARTNER') {
      if (!partnersOf.has(s)) partnersOf.set(s, new Set());
      if (!partnersOf.has(t)) partnersOf.set(t, new Set());
      partnersOf.get(s).add(t); partnersOf.get(t).add(s);
    }
  });

  const x = String(focusId);
  const genderOf = id => (nodeById.get(id)?.gender || '').toUpperCase();
  const orderedParents = id => (parentsOf.get(id) || [])
    .filter(p => nodeById.has(p))
    .slice()
    .sort((a, b) => {
      const ga = genderOf(a) === 'M' ? 0 : genderOf(a) === 'F' ? 1 : 0.5;
      const gb = genderOf(b) === 'M' ? 0 : genderOf(b) === 'F' ? 1 : 0.5;
      return ga - gb;
    })
    .slice(0, 2);

  const partners = [...(partnersOf.get(x) || [])].filter(p => nodeById.has(p));

  const xKids = new Set(childrenOf.get(x) || []);
  const comKids = p => (childrenOf.get(p) || []).filter(c => xKids.has(c)).length;
  let primary = null;
  partners.forEach(p => { if (!primary || comKids(p) > comKids(primary)) primary = p; });
  const active = (activeSpouseId && partners.includes(String(activeSpouseId)))
    ? String(activeSpouseId) : primary;

  const COL_W = NODE_WIDTH + Math.max(48, H_GAP * 3);
  const ROW_A = NODE_HEIGHT + Math.max(18, Math.round(V_GAP * 0.35));

  const activeKids = active
    ? (childrenOf.get(x) || []).filter(c => (parentsOf.get(c) || []).includes(active))
    : (childrenOf.get(x) || []);
  const descSet = new Set([x]);
  if (active) descSet.add(active);
  { const q = [...activeKids];
    while (q.length) {
      const c = q.shift();
      if (descSet.has(c)) continue;
      descSet.add(c);
      (partnersOf.get(c) || new Set()).forEach(sp => descSet.add(sp));
      (childrenOf.get(c) || []).forEach(k => q.push(k));
    } }
  const descNodes = [...descSet].filter(id => nodeById.has(id)).map(id => nodeById.get(id));
  const descEdges = edges.filter(e => descSet.has(String(e.source)) && descSet.has(String(e.target)));
  const cone = computeTreeLayout(descNodes, descEdges, { viewMode: 'descendants', focusId: x, compact });

  const focusCone = cone.positionedNodes.find(n => String(n.id) === x);
  const dx = focusCone ? -focusCone.x : 0;
  const dy = focusCone ? -focusCone.y : 0;
  const conePos = new Map(cone.positionedNodes.map(n => [String(n.id), { x: n.x + dx, y: n.y + dy }]));

  const mirror = active && conePos.has(active) && conePos.get(active).x < (conePos.get(x)?.x ?? 0);
  if (mirror) conePos.forEach(p => { p.x = -p.x; });
  const txCenter = v => mirror ? (NODE_WIDTH - (v + dx)) : (v + dx);

  const coneIds = new Set(conePos.keys());
  function computeWing(rootId, dir, rootLeftX, anchorCy) {
    const placed = new Map();
    const seen = new Set([rootId, ...coneIds]);
    let cursor = 0;
    function place(id, gen) {
      seen.add(id);
      const ps = orderedParents(id).filter(p => !seen.has(p));
      let cy;
      if (!ps.length) { cy = cursor + NODE_HEIGHT / 2; cursor += ROW_A; }
      else { const cys = ps.map(p => place(p, gen + 1)); cy = cys.reduce((a, b) => a + b, 0) / cys.length; }
      const nx = dir < 0 ? rootLeftX - gen * COL_W : rootLeftX + gen * COL_W;
      placed.set(id, { x: nx, y: cy - NODE_HEIGHT / 2 });
      return cy;
    }
    const roots = orderedParents(rootId).filter(p => !seen.has(p));
    if (!roots.length) return { placed, links: [] };
    const cys = roots.map(p => place(p, 1));
    const rootCy = cys.reduce((a, b) => a + b, 0) / cys.length;
    const shift = anchorCy - rootCy;
    placed.forEach(p => p.y += shift);

    const links = [];
    const posOf = id => id === rootId
      ? { x: rootLeftX, cy: anchorCy }
      : (placed.has(id) ? { x: placed.get(id).x, cy: placed.get(id).y + NODE_HEIGHT / 2 } : null);
    [rootId, ...placed.keys()].forEach(cid => {
      const cp = posOf(cid); if (!cp) return;
      orderedParents(cid).forEach(pid => {
        const pp = placed.get(pid); if (!pp) return;
        const pcy = pp.y + NODE_HEIGHT / 2;
        if (dir < 0) {
          const cEdge = cp.x, pEdge = pp.x + NODE_WIDTH, mid = (cEdge + pEdge) / 2;
          links.push({ kind: 'anc', d: `M ${cEdge} ${cp.cy} H ${mid} V ${pcy} H ${pEdge}` });
        } else {
          const cEdge = cp.x + NODE_WIDTH, pEdge = pp.x, mid = (cEdge + pEdge) / 2;
          links.push({ kind: 'anc', d: `M ${cEdge} ${cp.cy} H ${mid} V ${pcy} H ${pEdge}` });
        }
      });
    });
    return { placed, links };
  }

  const fp = conePos.get(x) || { x: 0, y: 0 };
  const leftWing = computeWing(x, -1, fp.x, fp.y + NODE_HEIGHT / 2);
  let rightWing = { placed: new Map(), links: [] };
  if (active && conePos.has(active)) {
    const sp = conePos.get(active);
    rightWing = computeWing(active, +1, sp.x, sp.y + NODE_HEIGHT / 2);
  }

  const others = partners.filter(p => p !== active && nodeById.has(p));
  const altNodes = [];
  const altLinks = [];
  if (others.length) {
    const focusCx = fp.x + NODE_WIDTH / 2;
    const activeCx = active && conePos.has(active) ? conePos.get(active).x + NODE_WIDTH / 2 : focusCx;
    const coupleCx = (focusCx + activeCx) / 2;
    const rowY = fp.y - (NODE_HEIGHT + V_GAP);
    const totalW = others.length * NODE_WIDTH + (others.length - 1) * H_GAP;
    let sx = coupleCx - totalW / 2;
    others.forEach(pid => {
      const px = sx; sx += NODE_WIDTH + H_GAP;
      altNodes.push({ id: pid, x: px, y: rowY });
      const fromX = px + NODE_WIDTH / 2, fromY = rowY + NODE_HEIGHT;
      const toX = focusCx, toY = fp.y, mid = (fromY + toY) / 2;
      altLinks.push({ kind: 'altmarriage', d: `M ${fromX} ${fromY} V ${mid} H ${toX} V ${toY}` });
    });
  }

  const wingNode = (id, p) => ({
    ...nodeById.get(id), id, x: p.x, y: p.y,
    width: NODE_WIDTH, height: NODE_HEIGHT, generation: 0, isFocus: false,
    isCollapsed: false, hiddenDescendants: 0, ancestorCollapsed: false, hiddenAncestors: 0,
    isGhost: false, hasGhost: false,
  });
  const positionedNodes = cone.positionedNodes
    .map(n => { const p = conePos.get(String(n.id)); return { ...n, x: p.x, y: p.y }; })
    .concat([...leftWing.placed].map(([id, p]) => wingNode(id, p)))
    .concat([...rightWing.placed].map(([id, p]) => wingNode(id, p)))
    .concat(altNodes.map(({ id, x: ax, y: ay }) => ({ ...wingNode(id, { x: ax, y: ay }), isBowtieAltSpouse: true })));

  const links = cone.links.map(l => {
    const s = conePos.get(String(l.source.id)), t = conePos.get(String(l.target.id));
    return {
      ...l,
      source: { ...l.source, x: s.x, y: s.y },
      target: { ...l.target, x: t.x, y: t.y },
    };
  });
  const brackets = (cone.brackets || []).map(b => ({
    ...b,
    parentCx: txCenter(b.parentCx),
    parentY: b.parentY + dy,
    childCenters: b.childCenters.map(c => ({ ...c, x: txCenter(c.x), y: c.y + dy })),
    pathD: b.pathD
      ? b.pathD.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) =>
          `${txCenter(Number(x))} ${Number(y) + dy}`)
      : b.pathD,
    segments: (b.segments || []).map(s => ({
      ...s,
      x1: txCenter(s.x1),
      y1: s.y1 + dy,
      x2: txCenter(s.x2),
      y2: s.y2 + dy,
    })),
  }));
  const bowtieLinks = [...leftWing.links, ...rightWing.links, ...altLinks];

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  positionedNodes.forEach(n => {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x + NODE_WIDTH);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y + NODE_HEIGHT);
  });
  const MARGIN = 70;
  return {
    positionedNodes,
    links,
    brackets,
    bowtieLinks,
    width: (maxX - minX) + MARGIN * 2,
    height: (maxY - minY) + MARGIN * 2,
    offsetX: -minX + MARGIN,
    offsetY: -minY + MARGIN,
    autoCollapsed: new Set(),
  };
}

function collapseBadgeWidth(label, minWidth = 60) {
  return Math.max(minWidth, Math.min(128, String(label || '').length * 6.8 + 18));
}

function boxesOverlap(a, b, margin = 0) {
  return a.x - margin < b.x + b.width &&
    a.x + a.width + margin > b.x &&
    a.y - margin < b.y + b.height &&
    a.y + a.height + margin > b.y;
}

function segmentIntersectsBox(seg, box, margin = 0) {
  const x1 = seg.x1, y1 = seg.y1, x2 = seg.x2, y2 = seg.y2;
  const bx0 = box.x - margin, bx1 = box.x + box.width + margin;
  const by0 = box.y - margin, by1 = box.y + box.height + margin;
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

function edgeSegments(layout) {
  const out = [];
  const push = (seg, ownerIds = []) => {
    if (!seg) return;
    out.push({
      ...seg,
      ownerIds: new Set([...(seg.ownerIds || []), ...ownerIds].filter(Boolean).map(String)),
    });
  };
  (layout.brackets || []).forEach((b, i) => {
    (b.segments || []).forEach(seg => push(seg, [`bracket:${i}`, ...(b.parentIds || []), ...(b.childIds || [])]));
  });
  (layout.links || []).forEach(link => {
    if (link.type !== 'PARTNER') return;
    (link.segments || []).forEach(seg => push(seg, [link.source?.id, link.target?.id]));
  });
  return out;
}

function updateLayoutBounds(layout) {
  const nodes = layout.positionedNodes || [];
  if (!nodes.length) return layout;
  let minX = Infinity, maxX = -Infinity, maxY = 0;
  nodes.forEach(n => {
    minX = Math.min(minX, n.x || 0);
    maxX = Math.max(maxX, (n.x || 0) + (n.width || NODE_WIDTH));
    maxY = Math.max(maxY, (n.y || 0) + (n.height || NODE_HEIGHT));
  });
  const badgeMaxY = Math.max(0, ...(layout.badges || []).map(b => b.y + b.height));
  layout.width = Math.max(layout.width || 0, maxX - minX + 80);
  layout.height = Math.max(layout.height || 0, maxY + 80, badgeMaxY + 80);
  layout.offsetX = Math.max(layout.offsetX || 0, -minX + 40);
  layout.offsetY = layout.offsetY ?? 25;
  return layout;
}

export function resetLayoutState(layout = {}) {
  return {
    ...layout,
    links: (layout.links || []).map(link => ({
      ...link,
      routePoints: undefined,
      pathD: undefined,
      segments: undefined,
    })),
    brackets: (layout.brackets || []).map(bracket => ({
      ...bracket,
      routePoints: undefined,
      pathD: undefined,
      segments: undefined,
      edges: undefined,
    })),
    badges: [],
    collisionReport: null,
    finalLayoutValidation: null,
  };
}

export function computeNodeBoundingBoxes(layout = {}) {
  return (layout.positionedNodes || [])
    .filter(n => n && n.x != null && n.y != null)
    .map(n => ({
      id: String(n.id),
      x: n.x,
      y: n.y,
      width: n.width || NODE_WIDTH,
      height: n.height || NODE_HEIGHT,
      node: n,
    }));
}

export function computeBadgeBoundingBoxes(layout = {}) {
  return (layout.badges || []).map(badge => ({
    ...badge,
    id: String(badge.id),
    width: badge.width || 0,
    height: badge.height || 0,
  }));
}

const NODE_OVERLAP_TOLERANCE = 2;

export function detectNodeOverlaps(layout = {}) {
  const boxes = computeNodeBoundingBoxes(layout).sort((a, b) => a.y - b.y || a.x - b.x);
  const partnerPairs = new Set();
  (layout.links || []).forEach(l => {
    if (l.type !== 'PARTNER') return;
    const a = String(l.source?.id ?? l.source), b = String(l.target?.id ?? l.target);
    partnerPairs.add(a < b ? `${a}|${b}` : `${b}|${a}`);
  });
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[j].y > boxes[i].y + boxes[i].height + MIN_GENERATION_GAP) break;
      const a = String(boxes[i].id), b = String(boxes[j].id);
      if (partnerPairs.has(a < b ? `${a}|${b}` : `${b}|${a}`)) continue;
      if (boxesOverlap(boxes[i], boxes[j], NODE_OVERLAP_TOLERANCE)) {
        overlaps.push({ a: boxes[i].id, b: boxes[j].id, boxA: boxes[i], boxB: boxes[j] });
      }
    }
  }
  return overlaps;
}

export function detectBadgeOverlaps(layout = {}) {
  const badges = computeBadgeBoundingBoxes(layout);
  const nodes = computeNodeBoundingBoxes(layout);
  const overlaps = [];
  badges.forEach((badge, i) => {
    nodes.forEach(node => {
      if (badge.nodeId === node.id) return;
      if (boxesOverlap(badge, node, BADGE_MARGIN)) {
        overlaps.push({ kind: 'badge-node', badgeId: badge.id, nodeId: node.id });
      }
    });
    for (let j = i + 1; j < badges.length; j++) {
      if (boxesOverlap(badge, badges[j], BADGE_MARGIN)) {
        overlaps.push({ kind: 'badge-badge', badgeId: badge.id, otherBadgeId: badges[j].id });
      }
    }
  });
  return overlaps;
}

export function detectEdgeNodeIntersections(layout = {}) {
  const nodes = computeNodeBoundingBoxes(layout);
  const hits = [];
  edgeSegments(layout).forEach((seg, segmentIndex) => {
    nodes.forEach(node => {
      if (seg.ownerIds?.has(node.id)) return;
      if (segmentIntersectsBox(seg, node, EDGE_NODE_MARGIN)) {
        hits.push({ segmentIndex, nodeId: node.id, segment: seg });
      }
    });
  });
  return hits;
}

export function detectEdgeBadgeIntersections(layout = {}) {
  const badges = computeBadgeBoundingBoxes(layout);
  const hits = [];
  edgeSegments(layout).forEach((seg, segmentIndex) => {
    badges.forEach(badge => {
      if (seg.ownerIds?.has(String(badge.nodeId))) return;
      if (segmentIntersectsBox(seg, badge, EDGE_BADGE_MARGIN)) {
        hits.push({ segmentIndex, badgeId: badge.id, segment: seg });
      }
    });
  });
  return hits;
}

export function detectFlattenedGenerationLayout(layout = {}) {
  const byId = new Map((layout.positionedNodes || []).map(n => [String(n.id), n]));
  const violations = [];
  (layout.brackets || []).forEach(bracket => {
    const parents = (bracket.parentIds || []).map(id => byId.get(String(id))).filter(Boolean);
    const children = (bracket.childIds || []).map(id => byId.get(String(id))).filter(Boolean);
    parents.forEach(parent => {
      children.forEach(child => {
        if ((child.y || 0) <= (parent.y || 0) + MIN_GENERATION_GAP) {
          violations.push({
            kind: 'parent-child-generation-too-close',
            relationId: bracket.relationId,
            parentId: String(parent.id),
            childId: String(child.id),
          });
        }
      });
    });
  });
  return violations;
}

export function detectFamilyBlockBreakage(layout = {}) {
  const byId = new Map((layout.positionedNodes || []).map(n => [String(n.id), n]));
  const issues = [];
  (layout.brackets || []).forEach(bracket => {
    const childNodes = (bracket.childIds || []).map(id => byId.get(String(id))).filter(Boolean);
    if (childNodes.length < 2) return;
    const childCenters = childNodes
      .map(n => (n.x || 0) + (n.width || NODE_WIDTH) / 2)
      .sort((a, b) => a - b);
    const childSpan = childCenters[childCenters.length - 1] - childCenters[0];
    const expectedMax = Math.max(
      NODE_WIDTH * 3,
      childNodes.length * (NODE_WIDTH + Math.max(MIN_NODE_GAP, H_GAP)) * 1.75,
    );
    if (childSpan > expectedMax) {
      issues.push({
        kind: 'children-spread-too-wide-for-family-block',
        relationId: bracket.relationId,
        childSpan,
        expectedMax,
      });
    }
  });
  return issues;
}

export function resolveHorizontalCollisions(layout = {}) {
  const nodes = (layout.positionedNodes || []).map(n => ({ ...n }));
  const rows = new Map();
  nodes.forEach(node => {
    const key = Math.round((node.y || 0) / Math.max(1, MIN_GENERATION_GAP));
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(node);
  });
  rows.forEach(row => {
    row.sort((a, b) => (a.x || 0) - (b.x || 0));
    for (let i = 1; i < row.length; i++) {
      const prev = row[i - 1];
      const cur = row[i];
      const minX = (prev.x || 0) + (prev.width || NODE_WIDTH) + MIN_NODE_GAP;
      if ((cur.x || 0) < minX) {
        const dx = minX - (cur.x || 0);
        for (let j = i; j < row.length; j++) row[j].x = (row[j].x || 0) + dx;
      }
    }
  });
  return updateLayoutBounds({ ...layout, positionedNodes: nodes });
}

export function resolveSubtreeCollisions(layout = {}) {
  const nodes = (layout.positionedNodes || []).map(n => ({ ...n }));
  const byGeneration = new Map();
  nodes.forEach(node => {
    const key = node.generation ?? Math.round((node.y || 0) / Math.max(1, ROW_HEIGHT));
    if (!byGeneration.has(key)) byGeneration.set(key, []);
    byGeneration.get(key).push(node);
  });
  byGeneration.forEach(row => {
    row.sort((a, b) => (a.x || 0) - (b.x || 0));
    for (let i = 1; i < row.length; i++) {
      const prev = row[i - 1];
      const cur = row[i];
      const minX = (prev.x || 0) + (prev.width || NODE_WIDTH) + MIN_SUBTREE_GAP;
      if ((cur.x || 0) < minX) {
        const dx = minX - (cur.x || 0);
        cur.x = (cur.x || 0) + dx;
      }
    }
  });
  return updateLayoutBounds({ ...layout, positionedNodes: nodes });
}

export function placeCollapseBadges(layout = {}) {
  const badges = [];
  const positionedNodes = (layout.positionedNodes || []).map(node => {
    const n = { ...node };
    const nodeBadges = [];
    const width = n.width || NODE_WIDTH;
    const height = n.height || NODE_HEIGHT;
    if (n.isCollapsed && (n.hiddenDescendants || 0) > 0) {
      const label = n.hiddenDescendantsLabel || `+${n.hiddenDescendants} ▼`;
      const bw = collapseBadgeWidth(label);
      nodeBadges.push({
        id: `${n.id}:hidden-desc`,
        nodeId: String(n.id),
        kind: 'hidden-descendants',
        label,
        x: n.x + width / 2 - bw / 2,
        y: n.y + height + BADGE_MARGIN,
        width: bw,
        height: 22,
      });
    }
    if ((n.hiddenAncestors || 0) > 0) {
      const label = n.hiddenAncestorsLabel || `+${n.hiddenAncestors} ▲`;
      const bw = collapseBadgeWidth(label);
      nodeBadges.push({
        id: `${n.id}:hidden-anc`,
        nodeId: String(n.id),
        kind: 'hidden-ancestors',
        label,
        x: n.x + width / 2 - bw / 2,
        y: n.y - 22 - BADGE_MARGIN,
        width: bw,
        height: 22,
      });
    }
    n.collapseBadges = nodeBadges;
    badges.push(...nodeBadges);
    return n;
  });
  return updateLayoutBounds({ ...layout, positionedNodes, badges });
}

export function rerouteAllEdges(layout = {}) {
  return rerouteEdgesAfterLayoutChange({
    ...layout,
    badges: layout.badges || [],
  });
}

export function validateFinalLayout(layout = {}) {
  const nodeOverlaps = detectNodeOverlaps(layout);
  const badgeOverlaps = detectBadgeOverlaps(layout);
  const edgeNodeIntersections = detectEdgeNodeIntersections(layout);
  const edgeBadgeIntersections = detectEdgeBadgeIntersections(layout);
  const flattenedGenerationLayout = detectFlattenedGenerationLayout(layout);
  const familyBlockBreakage = detectFamilyBlockBreakage(layout);
  const edgeRoutingValidation = layout.edgeDiagnostics?.localRoutingValidation || null;
  const edgeRoutingInvalid = edgeRoutingValidation && !edgeRoutingValidation.valid;
  const valid = nodeOverlaps.length === 0 &&
    badgeOverlaps.length === 0 &&
    edgeNodeIntersections.length === 0 &&
    edgeBadgeIntersections.length === 0 &&
    flattenedGenerationLayout.length === 0 &&
    familyBlockBreakage.length === 0 &&
    !edgeRoutingInvalid;
  return {
    valid,
    nodeOverlaps,
    badgeOverlaps,
    edgeNodeIntersections,
    edgeBadgeIntersections,
    flattenedGenerationLayout,
    familyBlockBreakage,
    edgeRoutingValidation,
  };
}

function repairBadges(layout = {}) {
  const badges = layout.badges || [];
  if (!badges.length) return layout;
  const nodeBoxes = computeNodeBoundingBoxes(layout);
  const segs = edgeSegments(layout);
  const boxesNow = badges.map(b => ({ id: b.id, x: b.x, y: b.y, width: b.width, height: b.height }));
  const STEP = 8, MAX = 80;

  const collidesAt = (badge, box) => {
    for (const n of nodeBoxes) {
      if (String(n.id) === String(badge.nodeId)) continue;
      if (boxesOverlap(box, n, BADGE_MARGIN)) return true;
    }
    for (const s of segs) {
      if (s.ownerIds?.has(String(badge.nodeId))) continue;
      if (segmentIntersectsBox(s, box, EDGE_BADGE_MARGIN)) return true;
    }
    for (const ob of boxesNow) {
      if (ob.id === badge.id) continue;
      if (boxesOverlap(box, ob, BADGE_MARGIN)) return true;
    }
    return false;
  };

  const moved = new Map();
  const newBadges = badges.map(badge => {
    const base = { x: badge.x, y: badge.y, width: badge.width, height: badge.height };
    if (!collidesAt(badge, base)) return badge;
    const vdir = badge.kind === 'hidden-ancestors' ? -1 : 1;
    let chosen = null;
    for (let d = STEP; d <= MAX && !chosen; d += STEP) {
      const cands = [
        { ...base, y: base.y + vdir * d },
        { ...base, x: base.x + d, y: base.y + vdir * d },
        { ...base, x: base.x - d, y: base.y + vdir * d },
        { ...base, x: base.x + d },
        { ...base, x: base.x - d },
      ];
      for (const c of cands) { if (!collidesAt(badge, c)) { chosen = c; break; } }
    }
    if (!chosen) return badge;
    const nb = { ...badge, x: chosen.x, y: chosen.y };
    moved.set(badge.id, nb);
    const idx = boxesNow.findIndex(o => o.id === badge.id);
    if (idx >= 0) boxesNow[idx] = { id: nb.id, x: nb.x, y: nb.y, width: nb.width, height: nb.height };
    return nb;
  });

  if (!moved.size) return layout;
  const positionedNodes = (layout.positionedNodes || []).map(n => {
    if (!n.collapseBadges?.length) return n;
    let changed = false;
    const cb = n.collapseBadges.map(b => {
      const m = moved.get(b.id);
      if (m) { changed = true; return m; }
      return b;
    });
    return changed ? { ...n, collapseBadges: cb } : n;
  });
  return updateLayoutBounds({ ...layout, badges: newBadges, positionedNodes });
}

function finalizeFocusLayout(layout = {}) {
  let next = resetLayoutState(layout);
  next = placeCollapseBadges(next);
  next = rerouteAllEdges(next);
  next = repairBadges(next);
  const validation = validateFinalLayout(next);
  return {
    ...next,
    finalLayoutValidation: validation,
    layoutProblematic: !!next.layoutProblematic || !validation.valid,
  };
}

function breakParentCycles(edges) {
  const PARENT_TYPES = ['BIRTH_PARENT', 'STEP_PARENT', 'ADOPTIVE_PARENT'];
  const childrenOf = new Map();
  for (const e of edges) {
    if (!PARENT_TYPES.includes(e.type)) continue;
    const p = String(e.source);
    if (!childrenOf.has(p)) childrenOf.set(p, []);
    childrenOf.get(p).push({ child: String(e.target), edge: e });
  }
  if (!childrenOf.size) return edges;

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  const dropped = new Set();
  for (const root of childrenOf.keys()) {
    if ((color.get(root) || WHITE) !== WHITE) continue;
    color.set(root, GRAY);
    const stack = [{ node: root, i: 0 }];
    while (stack.length) {
      const top = stack[stack.length - 1];
      const kids = childrenOf.get(top.node) || [];
      if (top.i >= kids.length) { color.set(top.node, BLACK); stack.pop(); continue; }
      const { child, edge } = kids[top.i++];
      const c = color.get(child) || WHITE;
      if (c === GRAY) {
        dropped.add(edge);
      } else if (c === WHITE) {
        color.set(child, GRAY);
        stack.push({ node: child, i: 0 });
      }
    }
  }
  if (!dropped.size) return edges;
  console.warn(
    `[layout] Date inconsistente: ${dropped.size} legătură(i) părinte→copil formează un ciclu ` +
    `(cineva ar fi propriul strămoș) și au fost ignorate la afișare:`,
    [...dropped].map(e => `${e.source} → ${e.target}`)
  );
  return edges.filter(e => !dropped.has(e));
}

export function computeFocusLayout(graph, focusId, options = {}) {
  return computeTreeLayout(graph?.nodes || [], graph?.edges || [], { ...options, focusId });
}

export function computeTreeLayout(nodes, edges, options = {}) {
  if (!nodes || !nodes.length) {
    return { positionedNodes: [], links: [], brackets: [], width: 0, height: 0,
             autoCollapsed: new Set() };
  }

  const {
    focusId = null,
    viewMode = 'all',
    manuallyCollapsed = new Set(),
    manuallyExpanded = new Set(),
    manuallyExpandedAncestors = new Set(),
    maxEdgeLength = null,
    hideUnknowns = true,
    compact = false,
    activeSpouseId = null,
  } = options;

  applyMetrics(compact);

  const cleanEdges = breakParentCycles(edges);

  if (viewMode === 'bowtie' && focusId) {
    return computeBowtieLayout(nodes, cleanEdges, focusId, compact, activeSpouseId);
  }

  const ancestorMode = viewMode === 'ancestors';

  const collapseEnabled = viewMode === 'all' || viewMode === 'descendants' || viewMode === 'dualtree';

  let workingNodes = nodes;
  if (hideUnknowns) {
    workingNodes = nodes.filter(n => !isUnknownPerson(n));
  }
  const validIds = new Set(workingNodes.map(n => String(n.id)));
  let workingEdges = cleanEdges.filter(e =>
    validIds.has(String(e.source)) && validIds.has(String(e.target))
  );

  let ancCounts = new Map();
  let ancCollapsedAt = new Set();
  let nodesForLayout = workingNodes;
  let edgesForLayout = workingEdges;
  let ghostInfo = null;
  let diamondSecondary = [];
  let ghostClusters = [];

  if (collapseEnabled) {
    const { list } = findConvergences(workingNodes, workingEdges);
    const childConvs  = list.filter(c => c.kind === 'child');
    const spouseConvs = list.filter(c => c.kind === 'spouse');

    const childCol = computeSecondaryAncestorCollapse(
      workingNodes, workingEdges, childConvs, manuallyExpandedAncestors, focusId
    );

    const inlawCol = computeInLawAncestorCollapse(
      workingNodes, workingEdges, focusId, manuallyExpandedAncestors,
      new Set(spouseConvs.map(c => String(c.childId)))
    );

    const spouseSecondaryKeys = new Set(
      spouseConvs.map(c => convKey(c.relationId, String(c.childId)))
    );
    const isDiamondEdge = (e) =>
      ['BIRTH_PARENT', 'STEP_PARENT', 'ADOPTIVE_PARENT'].includes(e.type) &&
      spouseSecondaryKeys.has(convKey(edgeRid(e), String(e.target)));

    const finalInlawHidden = new Set();
    const inlawCounts = new Map();
    const ghostHidden = new Set();

    const expandedInlaws = [...(manuallyExpandedAncestors || [])]
      .map(String).filter(id => !inlawCol.bloodSet.has(id));

    if (inlawCol.bySpouse.size || expandedInlaws.length) {
      const parentsOf = new Map();
      workingEdges.forEach(e => {
        if (!['BIRTH_PARENT', 'STEP_PARENT', 'ADOPTIVE_PARENT'].includes(e.type)) return;
        const c = String(e.target), p = String(e.source);
        if (!parentsOf.has(c)) parentsOf.set(c, []);
        parentsOf.get(c).push(p);
      });
      const inlawLineOf = (inlaw) => {
        const ancestors = new Set();
        const stack = [...(parentsOf.get(inlaw) || [])];
        while (stack.length) {
          const a = String(stack.pop());
          if (ancestors.has(a) || inlawCol.bloodSet.has(a)) continue;
          ancestors.add(a);
          (parentsOf.get(a) || []).forEach(p => stack.push(p));
        }
        return ancestors;
      };

      const candidates = [];
      inlawCol.bySpouse.forEach((ancSet, id) => {
        const vis = new Set([...ancSet].filter(a => !childCol.hidden.has(a)));
        candidates.push({ id, ancSet: vis, fullSet: ancSet, isExpanded: false });
      });
      expandedInlaws.forEach(id => {
        const line = inlawLineOf(id);
        const vis = new Set([...line].filter(a => !childCol.hidden.has(a)));
        if (vis.size) candidates.push({ id, ancSet: vis, fullSet: line, isExpanded: true });
      });

      const decisions = decideInLawLinesByFeasibility(
        workingNodes, workingEdges, candidates, childCol.hidden, isDiamondEdge,
        focusId, manuallyExpanded, manuallyCollapsed
      );

      const candidateById = new Map(candidates.map(c => [String(c.id), c]));
      const collapsedInlaws = new Set();

      const focusPartners = new Set();
      if (focusId) {
        const fid = String(focusId);
        workingEdges.forEach(e => {
          if (e.type !== 'PARTNER') return;
          const s = String(e.source), t = String(e.target);
          if (s === fid) focusPartners.add(t);
          else if (t === fid) focusPartners.add(s);
        });
      }

      const collisionLinksFor = (layoutCandidate, candidateEdges, candidateNodes) => {
        const candidateNodeMap = new Map(candidateNodes.map(n => [String(n.id), { ...n, id: String(n.id) }]));
        return candidateEdges
          .filter(e => layoutCandidate.pos.has(String(e.source)) && layoutCandidate.pos.has(String(e.target)))
          .map(e => {
            const sid = String(e.source), tid = String(e.target);
            return {
              source: { ...candidateNodeMap.get(sid), ...layoutCandidate.pos.get(sid), width: NODE_WIDTH, height: NODE_HEIGHT },
              target: { ...candidateNodeMap.get(tid), ...layoutCandidate.pos.get(tid), width: NODE_WIDTH, height: NODE_HEIGHT },
              type: e.type,
              relation_id: e.relation_id,
              partner_type: e.partner_type,
            };
          });
      };

      const collisionReportFor = (extraHidden = null) => {
        const hiddenNow = new Set([...childCol.hidden]);
        collapsedInlaws.forEach(id => {
          const candidate = candidateById.get(id);
          candidate?.fullSet?.forEach(a => hiddenNow.add(a));
        });
        if (extraHidden) extraHidden.forEach(a => hiddenNow.add(String(a)));
        const candidateNodes = workingNodes.filter(n => !hiddenNow.has(String(n.id)));
        const candidateIds = new Set(candidateNodes.map(n => String(n.id)));
        const candidateEdges = workingEdges.filter(e =>
          candidateIds.has(String(e.source)) &&
          candidateIds.has(String(e.target)) &&
          !isDiamondEdge(e)
        );
        const { layout: candidateLayout } = computeAutoCollapse(
          candidateNodes, candidateEdges, focusId, manuallyExpanded, manuallyCollapsed, false,
          false, false, true, { maxEdgeLength }
        );
        const candidateLinks = collisionLinksFor(candidateLayout, candidateEdges, candidateNodes);
        const report = detectLayoutCollisions(
          {
            positionedNodes: candidateLayout.positionedNodes,
            links: candidateLinks,
            brackets: candidateLayout.brackets,
          },
          { nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT },
        );
        let longEdges = 0;
        candidateEdges.forEach(e => {
          if (!['BIRTH_PARENT', 'STEP_PARENT', 'ADOPTIVE_PARENT'].includes(e.type)) return;
          const p = candidateLayout.pos.get(String(e.source));
          const c = candidateLayout.pos.get(String(e.target));
          if (!p || !c) return;
          if (Math.abs(p.x - c.x) > NODE_WIDTH * 3) longEdges++;
        });
        report.longEdges = longEdges;
        return report;
      };

      const bloodSet = inlawCol.bloodSet || new Set();
      const allInlawIds = new Set();
      candidates.forEach(c => {
        allInlawIds.add(String(c.id));
        (c.fullSet || c.ancSet || []).forEach(a => allInlawIds.add(String(a)));
      });
      const crossesFocusColumn = (hit) => {
        const oa = (hit.ownersA || []).map(String), ob = (hit.ownersB || []).map(String);
        const aBlood = oa.some(o => bloodSet.has(o)), bBlood = ob.some(o => bloodSet.has(o));
        const aInlaw = oa.some(o => allInlawIds.has(o)), bInlaw = ob.some(o => allInlawIds.has(o));
        return (aBlood && bInlaw && !bBlood) || (bBlood && aInlaw && !aBlood);
      };
      const reportHasFocusCross = (report) =>
        (report.lineLineCollisions || []).some(crossesFocusColumn);
      const involvesInlaw = (hit) => {
        const oa = (hit.ownersA || []).map(String), ob = (hit.ownersB || []).map(String);
        return oa.some(o => allInlawIds.has(o)) || ob.some(o => allInlawIds.has(o));
      };
      const reportHasInlawCross = (report) =>
        (report.lineLineCollisions || []).some(involvesInlaw);

      for (let guard = 0; guard < candidates.length; guard++) {
        const report = collisionReportFor();
        const realOverlap = report.nodeOverlaps.length > 0 ||
          report.lineNodeCollisions.length > 0 ||
          reportHasFocusCross(report) ||
          reportHasInlawCross(report);
        if (!realOverlap) break;
        const scores = candidates
          .filter(c => !collapsedInlaws.has(String(c.id)) && !c.isExpanded)
          .map(c => {
            const ids = new Set([String(c.id), ...[...c.fullSet].map(String)]);
            let score = 0;
            report.nodeOverlaps.forEach(hit => {
              if (ids.has(String(hit.a))) score += 2;
              if (ids.has(String(hit.b))) score += 2;
            });
            report.lineNodeCollisions.forEach(hit => {
              if (ids.has(String(hit.node))) score += 1;
            });
            report.lineLineCollisions?.forEach(hit => {
              const owners = [...(hit.ownersA || []), ...(hit.ownersB || [])];
              if (!owners.some(owner => ids.has(String(owner)))) return;
              score += crossesFocusColumn(hit) ? 3 : 1;
            });
            if (!score) return { id: String(c.id), score: 0 };
            const placement = decisions.get(c.id) || {};
            if (placement.interior) score += 1;
            score += Math.min(4, Math.ceil((c.fullSet?.size || 0) / 3));
            return { id: String(c.id), score };
          })
          .filter(item => item.score > 0)
          .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
        if (!scores.length) break;
        collapsedInlaws.add(scores[0].id);
      }

      if (collapsedInlaws.size) {
        const reexpandOrder = [...collapsedInlaws].sort((a, b) => {
          const pa = decisions.get(a) || {}, pb = decisions.get(b) || {};
          const fa = focusPartners.has(String(a)) ? 0 : 1;
          const fb = focusPartners.has(String(b)) ? 0 : 1;
          if (fa !== fb) return fa - fb;
          const ea = (pa.inline && !pa.interior) ? 0 : 1;
          const eb = (pb.inline && !pb.interior) ? 0 : 1;
          if (ea !== eb) return ea - eb;
          const sa = candidateById.get(a)?.fullSet?.size || 0;
          const sb = candidateById.get(b)?.fullSet?.size || 0;
          if (sa !== sb) return sa - sb;
          return String(a).localeCompare(String(b));
        });
        for (const id of reexpandOrder) {
          if (!collapsedInlaws.has(id)) continue;
          collapsedInlaws.delete(id);
          const report = collisionReportFor();
          const stillOverlaps = report.nodeOverlaps.length > 0 ||
            report.lineNodeCollisions.length > 0 ||
            reportHasFocusCross(report) ||
            reportHasInlawCross(report);
          if (stillOverlaps) collapsedInlaws.add(id);
        }
      }

      const partnerPartialHidden = new Set();
      const ancestorShellsFrom = (rootId, ancSet) => {
        const inSet = new Set([...ancSet].map(String));
        const shells = [];
        let frontier = (parentsOf.get(String(rootId)) || []).map(String).filter(p => inSet.has(p));
        const seen = new Set(frontier);
        while (frontier.length) {
          shells.push(frontier);
          const next = [];
          frontier.forEach(c => (parentsOf.get(c) || []).map(String).forEach(p => {
            if (inSet.has(p) && !seen.has(p)) { seen.add(p); next.push(p); }
          }));
          frontier = next;
        }
        return shells;
      };
      const overlapCount = (r) =>
        (r.nodeOverlaps?.length || 0) + (r.lineNodeCollisions?.length || 0);
      const qualityCount = (r) =>
        overlapCount(r) + (r.longEdges || 0);

      const focusBloodSet = inlawCol.bloodSet || new Set();
      const partenerEsteArborele = (pid) => {
        const pBlood = computeFocusBloodSet(workingEdges, pid).bloodSet;
        return pBlood.size >= focusBloodSet.size * 2 && pBlood.size > focusBloodSet.size + 3;
      };

      focusPartners.forEach(pid => {
        const sid = String(pid);
        const cand = candidateById.get(sid);
        if (!cand || !cand.fullSet || !cand.fullSet.size) return;
        collapsedInlaws.delete(sid);

        const qcount = overlapCount;

        const shells = ancestorShellsFrom(sid, cand.fullSet);
        const fullList = [...cand.fullSet].map(String);
        const baseHidden = new Set([...partnerPartialHidden, ...fullList]);
        let prevCount = qcount(collisionReportFor(baseHidden));
        const accepted = new Set();
        for (const shell of shells) {
          const trialAccepted = new Set([...accepted, ...shell]);
          const trialHidden = new Set([
            ...partnerPartialHidden,
            ...fullList.filter(a => !trialAccepted.has(a)),
          ]);
          const cnt = qcount(collisionReportFor(trialHidden));
          if (cnt > prevCount) break;
          shell.forEach(a => accepted.add(String(a)));
          prevCount = cnt;
        }
        let hiddenCount = 0;
        fullList.forEach(a => {
          if (!accepted.has(a)) { partnerPartialHidden.add(a); hiddenCount++; }
        });
        if (hiddenCount > 0) inlawCounts.set(sid, hiddenCount);
      });

      candidates.forEach(({ id, fullSet }) => {
        if (!collapsedInlaws.has(String(id))) return;
        fullSet.forEach(a => finalInlawHidden.add(a));
        inlawCounts.set(id, fullSet.size);
      });
      partnerPartialHidden.forEach(a => finalInlawHidden.add(a));
    }

    const hidden = keepPartnersVisible(
      new Set([...childCol.hidden, ...finalInlawHidden, ...ghostHidden]),
      workingNodes,
      workingEdges.filter(e => e.type === 'PARTNER'),
    );
    ancCounts = new Map([...childCol.counts]);
    inlawCounts.forEach((n, k) => ancCounts.set(k, (ancCounts.get(k) || 0) + n));
    ancCollapsedAt = new Set([...childCol.collapsedAt, ...inlawCounts.keys()]);

    nodesForLayout = workingNodes.filter(n => !hidden.has(String(n.id)));
    const visIds = new Set(nodesForLayout.map(n => String(n.id)));
    edgesForLayout = workingEdges.filter(e => {
      if (!visIds.has(String(e.source)) || !visIds.has(String(e.target))) return false;
      if (isDiamondEdge(e)) { diamondSecondary.push(e); return false; }
      return true;
    });
  }

  let layout, autoCollapsed, proximityReport;
  if (collapseEnabled) {
    ({ layout, autoCollapsed, proximityReport } = computeAutoCollapse(
      nodesForLayout, edgesForLayout, focusId, manuallyExpanded, manuallyCollapsed, false,
      false, false, true, { maxEdgeLength }
    ));
  } else if (viewMode === 'hourglass') {
    ({ layout, autoCollapsed, proximityReport } = computeAutoCollapse(
      nodesForLayout, edgesForLayout, focusId, manuallyExpanded, manuallyCollapsed, false,
      false, false, true, { maxEdgeLength }
    ));
  } else {
    const nodeMap = new Map();
    nodesForLayout.forEach(n => nodeMap.set(String(n.id), { ...n, id: String(n.id) }));
    const partnerEdges = edgesForLayout.filter(e => e.type === 'PARTNER');
    const parentEdges = edgesForLayout.filter(e =>
      ['BIRTH_PARENT', 'STEP_PARENT', 'ADOPTIVE_PARENT'].includes(e.type)
    );

    if (viewMode === 'ancestors') {
      layout = computeRawLayout(nodeMap, partnerEdges, parentEdges, false, focusId, { splitSides: false, anchorUp: true });
    } else {
      layout = computeRawLayout(nodeMap, partnerEdges, parentEdges, false);
    }
    autoCollapsed = new Set();
  }

  const parentEdgesAll = edgesForLayout.filter(e =>
    ['BIRTH_PARENT', 'STEP_PARENT', 'ADOPTIVE_PARENT'].includes(e.type)
  );

  const childrenOf = new Map();
  parentEdgesAll.forEach(e => {
    const p = String(e.source), c = String(e.target);
    if (!childrenOf.has(p)) childrenOf.set(p, new Set());
    childrenOf.get(p).add(c);
  });

  const hiddenCountOf = new Map();
  autoCollapsed.forEach(parentId => {
    let count = 0;
    const visited = new Set();
    const q = [...(childrenOf.get(parentId) || [])];
    while (q.length) {
      const c = q.shift();
      if (visited.has(c)) continue;
      visited.add(c);
      count++;
      (childrenOf.get(c) || []).forEach(cc => q.push(cc));
    }
    hiddenCountOf.set(parentId, count);
  });

  const visibleIds = new Set(layout.positionedNodes.map(n => String(n.id)));
  const positionedNodes = layout.positionedNodes
    .filter(n => visibleIds.has(String(n.id)))
    .map(n => {
      const idStr = String(n.id);
      const isGhost = !!(ghostInfo && ghostInfo.ghostIds.has(idStr));
      const meta = isGhost ? ghostInfo.ghostMeta.get(idStr) : null;
      const myGhosts = ghostInfo ? ghostInfo.ghostOfReal.get(idStr) : null;
      return {
        ...n,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        isFocus: focusId && idStr === String(focusId),
        isCollapsed: autoCollapsed.has(idStr),
        hiddenDescendants: hiddenCountOf.get(idStr) || 0,
        hiddenDescendantsLabel: hiddenDescendantsLabel(hiddenCountOf.get(idStr) || 0),
        ancestorCollapsed: ancCollapsedAt.has(idStr),
        hiddenAncestors: ancCounts.get(idStr) || 0,
        hiddenAncestorsLabel: hiddenAncestorsLabel(ancCounts.get(idStr) || 0),

        isGhost,
        ghostOf: isGhost ? meta.ghostOf : null,
        ghostKind: isGhost ? meta.kind : null,
        ghostRelationType: isGhost ? meta.relationType : null,
        hasGhost: !isGhost && !!(myGhosts && myGhosts.length),
        ghostIds: (!isGhost && myGhosts) ? myGhosts : null,
      };
    });

  const diamondMarkers = [];
  if (diamondSecondary.length) {
    const visible = new Set(positionedNodes.map(n => String(n.id)));
    const byKey = new Map();
    diamondSecondary.forEach(e => {
      const k = convKey(edgeRid(e), String(e.target));
      if (!byKey.has(k)) byKey.set(k, { childId: String(e.target), type: e.type, parents: new Set() });
      byKey.get(k).parents.add(String(e.source));
    });
    byKey.forEach(({ childId, type, parents }) => {
      if (!visible.has(childId)) return;
      const target = [...parents].find(p => visible.has(p));
      if (!target) return;
      diamondMarkers.push({
        id: childId,
        targetId: target,
        kind: type === 'ADOPTIVE_PARENT' ? 'adopt' : (type === 'STEP_PARENT' ? 'step' : 'consang'),
      });
    });
  }

  const nodeMap = new Map();
  nodesForLayout.forEach(n => nodeMap.set(String(n.id), { ...n, id: String(n.id) }));

  const partnerRelsOf = new Map();
  edgesForLayout.filter(e => e.type === 'PARTNER').forEach(e => {
    const s = String(e.source), t = String(e.target);
    const rid = String(e.relation_id ?? `${[s, t].sort().join('|')}`);
    if (!partnerRelsOf.has(s)) partnerRelsOf.set(s, new Map());
    if (!partnerRelsOf.has(t)) partnerRelsOf.set(t, new Map());
    partnerRelsOf.get(s).set(rid, t);
    partnerRelsOf.get(t).set(rid, s);
  });
  const marriageOrderOf = new Map();
  const marriageCountOf = new Map();
  partnerRelsOf.forEach((rels, pid) => {
    const rids = [...rels.keys()].sort((a, b) => a.localeCompare(b));
    marriageCountOf.set(pid, rids.length);
    rids.forEach((rid, idx) => marriageOrderOf.set(`${pid}|${rid}`, idx + 1));
  });

  const links = edgesForLayout
    .filter(e => layout.pos.has(String(e.source)) && layout.pos.has(String(e.target)))
    .map(e => {
      const sid = String(e.source), tid = String(e.target);
      const sp = layout.pos.get(sid), tp = layout.pos.get(tid);
      const link = {
        source: { ...nodeMap.get(sid), ...sp, width: NODE_WIDTH, height: NODE_HEIGHT },
        target: { ...nodeMap.get(tid), ...tp, width: NODE_WIDTH, height: NODE_HEIGHT },
        type: e.type,
        relation_id: e.relation_id,
        partner_type: e.partner_type,
      };
      if (e.type === 'PARTNER') {

        const rid = String(e.relation_id ?? `${[sid, tid].sort().join('|')}`);
        const sc = marriageCountOf.get(sid) || 1, tc = marriageCountOf.get(tid) || 1;
        const owner = sc >= tc ? sid : tid;
        link.marriageCount = Math.max(sc, tc);
        link.marriageOrder = marriageOrderOf.get(`${owner}|${rid}`) || 1;
      }
      return link;
    });

  const ghostNodes = [];
  const ghostLinks = [];
  const ghostBrackets = [];
  let extraMinX = Infinity;
  let extraMaxX = -Infinity;
  if (ghostClusters.length) {
    const mainXs = layout.positionedNodes.filter(n => n.x != null);
    const mainMinX = mainXs.length ? Math.min(...mainXs.map(n => n.x)) : 0;
    const mainMaxX = mainXs.length ? Math.max(...mainXs.map(n => n.x + NODE_WIDTH)) : NODE_WIDTH;
    let leftCursor = mainMinX - NODE_WIDTH * 2;
    let rightCursor = mainMaxX + NODE_WIDTH * 2;
    for (const { inlaw, ancestors, side = 'right' } of ghostClusters) {
      const ids = new Set([String(inlaw), ...[...ancestors].map(String)]);
      const cn = nodesForLayout.length ? workingNodes.filter(n => ids.has(String(n.id))) : [];
      if (cn.length < 2) continue;
      const cnMap = new Map(cn.map(n => [String(n.id), { ...n, id: String(n.id) }]));
      const cPartner = workingEdges.filter(e => e.type === 'PARTNER' && ids.has(String(e.source)) && ids.has(String(e.target)));
      const cParent = workingEdges.filter(e => ['BIRTH_PARENT', 'STEP_PARENT', 'ADOPTIVE_PARENT'].includes(e.type) && ids.has(String(e.source)) && ids.has(String(e.target)));
      const cl = computeRawLayout(cnMap, cPartner, cParent, true);
      const cps = cl.positionedNodes.filter(n => n.x != null);
      if (!cps.length) continue;
      const cMinX = Math.min(...cps.map(n => n.x));
      const cMaxX = Math.max(...cps.map(n => n.x + NODE_WIDTH));
      const cMinY = Math.min(...cps.map(n => n.y));
      const dx = side === 'left' ? leftCursor - cMaxX : rightCursor - cMinX;
      const dy = -cMinY;
      const localPos = new Map();
      let placedMinX = Infinity;
      let placedMaxX = -Infinity;
      for (const n of cps) {
        const id = String(n.id);
        const px = n.x + dx, py = n.y + dy;
        localPos.set(id, { x: px, y: py });
        placedMinX = Math.min(placedMinX, px);
        placedMaxX = Math.max(placedMaxX, px + NODE_WIDTH);
        extraMinX = Math.min(extraMinX, px);
        extraMaxX = Math.max(extraMaxX, px + NODE_WIDTH);
        const isAnchor = id === String(inlaw);
        ghostNodes.push({
          ...n, id: isAnchor ? `${id}__g` : id, x: px, y: py,
          width: NODE_WIDTH, height: NODE_HEIGHT,
          isFocus: false, isCollapsed: false, hiddenDescendants: 0, ancestorCollapsed: false, hiddenAncestors: 0,
          isGhost: isAnchor, ghostOf: isAnchor ? String(inlaw) : null,
          ghostKind: isAnchor ? 'inlaw' : null, ghostRelationType: null,
          hasGhost: false, ghostIds: null,
          ghostCluster: true,
        });
      }
      for (const e of [...cParent, ...cPartner]) {
        const sid = String(e.source), tid = String(e.target);
        const sp = localPos.get(sid), tp = localPos.get(tid);
        if (!sp || !tp) continue;
        const sgid = sid === String(inlaw) ? `${sid}__g` : sid;
        const tgid = tid === String(inlaw) ? `${tid}__g` : tid;
        ghostLinks.push({
          source: { ...cnMap.get(sid), id: sgid, ...sp, width: NODE_WIDTH, height: NODE_HEIGHT },
          target: { ...cnMap.get(tid), id: tgid, ...tp, width: NODE_WIDTH, height: NODE_HEIGHT },
          type: e.type, relation_id: e.relation_id, partner_type: e.partner_type,
        });
      }

      for (const b of (cl.brackets || [])) {
        ghostBrackets.push({
          ...b,
          parentCx: b.parentCx + dx,
          parentY: b.parentY + dy,
          childCenters: b.childCenters.map(c => ({
            ...c,
            x: c.x + dx,
            y: c.y + dy,
            routeX: c.routeX != null ? c.routeX + dx : c.routeX,
            busY: c.busY != null ? c.busY + dy : c.busY,
          })),
          pathD: b.pathD
            ? b.pathD.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) =>
                `${Number(x) + dx} ${Number(y) + dy}`)
            : b.pathD,
          segments: (b.segments || []).map(s => ({
            ...s,
            x1: s.x1 + dx,
            y1: s.y1 + dy,
            x2: s.x2 + dx,
            y2: s.y2 + dy,
          })),
        });
      }
      const real = positionedNodes.find(n => String(n.id) === String(inlaw));
      if (real) { real.hasGhost = true; real.ghostIds = [...(real.ghostIds || []), `${inlaw}__g`]; }
      if (side === 'left') {
        leftCursor = placedMinX - NODE_WIDTH * 1.5;
      } else {
        rightCursor = placedMaxX + NODE_WIDTH * 1.5;
      }
    }
  }

  const allNodes = ghostNodes.length ? [...positionedNodes, ...ghostNodes] : positionedNodes;
  const allLinks = ghostLinks.length ? [...links, ...ghostLinks] : links;
  const allBrackets = ghostBrackets.length ? [...layout.brackets, ...ghostBrackets] : layout.brackets;
  const finalizedLayout = finalizeFocusLayout({
    positionedNodes: allNodes,
    links: allLinks,
    brackets: allBrackets,
    width: layout.width,
    height: layout.height,
    offsetX: layout.offsetX,
    offsetY: layout.offsetY,
  });
  const routedLinks = finalizedLayout.links;
  const routedBrackets = finalizedLayout.brackets;
  const collisionReport = detectLayoutCollisions(
    { positionedNodes: finalizedLayout.positionedNodes, links: routedLinks, brackets: routedBrackets },
    { nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT },
  );
  const collisionNodes = collisionReport.byNodeId;
  const markedNodes = finalizedLayout.positionedNodes.map(n => {
    const kinds = collisionNodes.get(String(n.id));
    return kinds ? { ...n, layoutCollision: true, layoutCollisionKinds: [...kinds] } : n;
  });
  const hasDetachedClusters = extraMinX < Infinity || extraMaxX > -Infinity;
  const finalOffsetX = hasDetachedClusters
    ? Math.max(layout.offsetX || 0, -Math.min(...markedNodes.map(n => n.x || 0)) + 40)
    : layout.offsetX;
  const finalWidth = hasDetachedClusters
    ? Math.max(layout.width, Math.max(...markedNodes.map(n => (n.x || 0) + NODE_WIDTH)) + finalOffsetX + 40)
    : layout.width;

  let outOffsetX = finalOffsetX;
  let outWidth = finalWidth;
  if (viewMode === 'hourglass' && focusId) {
    const f = markedNodes.find(n => String(n.id) === String(focusId));
    if (f) {
      const fcx = (f.x || 0) + finalOffsetX + NODE_WIDTH / 2;
      const half = Math.max(fcx, finalWidth - fcx);
      outOffsetX = finalOffsetX + (half - fcx);
      outWidth = half * 2;
    }
  }

  return {
    positionedNodes: markedNodes,
    links: routedLinks,
    brackets: routedBrackets,
    badges: finalizedLayout.badges,
    diamondMarkers,
    width: outWidth,
    height: finalizedLayout.height,
    offsetX: outOffsetX,
    offsetY: finalizedLayout.offsetY,
    autoCollapsed,
    proximityReport,
    edgeDiagnostics: finalizedLayout.edgeDiagnostics,
    finalLayoutValidation: finalizedLayout.finalLayoutValidation,
    layoutProblematic: finalizedLayout.layoutProblematic,
    collisionReport,
  };
}
