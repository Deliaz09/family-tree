import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { computeTreeLayout, NODE_WIDTH, NODE_HEIGHT } from '../utils/treeLayout';
import { applyViewMode } from '../utils/treeViewModes';
import { API_BASE } from '../utils/apiBase';

const PHOTO_SIZE = 144;
const PHOTO_X = (NODE_WIDTH - PHOTO_SIZE) / 2;
const PHOTO_Y = 8;
const NAME_Y  = PHOTO_Y + PHOTO_SIZE + 24;

const BRACKET_COLORS = [
  '#78909c', '#8d6e63', '#7986cb', '#4db6ac',
  '#a1887f', '#90a4ae', '#9575cd', '#4dd0e1',
];

const PARTNER_STYLES = {
  married:   { stroke: '#7c3aed', dasharray: 'none',   width: 2.6, label: 'Căsătorit/ă' },
  partner:   { stroke: '#0d9488', dasharray: 'none',   width: 2.2, label: 'Partener/ă (necăsătoriți)' },
  engaged:   { stroke: '#d97706', dasharray: '9,4',    width: 2.2, label: 'Logodit/ă' },
  divorced:  { stroke: '#dc2626', dasharray: '7,5',    width: 2.2, label: 'Divorțat/ă' },
  separated: { stroke: '#6b7280', dasharray: '2,5',    width: 2.2, label: 'Separat/ă' },
  solo:      { stroke: '#bdbdbd', dasharray: 'none',   width: 1.5 },
};

const PARTNER_LEGEND = ['married', 'partner', 'engaged', 'divorced', 'separated'];
const snapEdge = (v, grid = 5) => Math.round(v / grid) * grid;

const FOCUS_NAV_MODES = new Set(['all', 'ancestors', 'descendants', 'hourglass', 'dualtree']);

function resolvePhotoUrl(photo_url, photo) {
  if (photo_url) {
    if (photo_url.startsWith('http') || photo_url.startsWith('data:')) return photo_url;
    return `${API_BASE}${photo_url}`;
  }
  if (photo) return `${API_BASE}/photos/${photo}`;
  return null;
}

const AVATAR_COLORS = {
  M: { bg: '#dbeafe', fg: '#5b8fd0' },
  F: { bg: '#fce7f0', fg: '#cf6892' },
  U: { bg: '#ececf2', fg: '#9aa0ad' },
};
const avatarGenderKey = g => (g === 'M' ? 'M' : g === 'F' ? 'F' : 'U');

export function NodeAvatar({ x, y, size, gender }) {
  const c = AVATAR_COLORS[avatarGenderKey(gender)];
  const cx = x + size / 2;
  const headR = size * 0.17;
  const headCy = y + size * 0.36;
  const W = size * 0.36;
  const shTop = y + size * 0.52;
  const shBot = y + size * 0.90;
  const shoulders =
    `M ${cx - W} ${shBot} ` +
    `C ${cx - W} ${shTop} ${cx - W * 0.5} ${shTop} ${cx} ${shTop} ` +
    `C ${cx + W * 0.5} ${shTop} ${cx + W} ${shTop} ${cx + W} ${shBot} Z`;
  return (
    <>
      <rect x={x} y={y} width={size} height={size} rx="6" fill={c.bg} />
      <circle cx={cx} cy={headCy} r={headR} fill={c.fg} />
      <path d={shoulders} fill={c.fg} />
    </>
  );
}

export function NodePhoto({ src, x, y, size, gender }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (!src || failed) {
    return <NodeAvatar x={x} y={y} size={size} gender={gender} />;
  }
  return (
    <image href={src} x={x} y={y} width={size} height={size}
      preserveAspectRatio="xMidYMid slice"
      onError={() => setFailed(true)} />
  );
}

function badgeBox(label, minWidth = 60) {
  return Math.max(minWidth, Math.min(128, label.length * 6.8 + 18));
}

function computeFitTransform(layout, vw, vh) {
  const fit = Math.min(vw / (layout.width || 1), vh / (layout.height || 1)) * 0.95;
  const s = Math.min(fit, 2);
  const tx = (vw - (layout.width || 0) * s) / 2;
  const ty = Math.max(20, (vh - (layout.height || 0) * s) / 2);
  return d3.zoomIdentity.translate(tx, ty).scale(s);
}

export default function TreeCanvas({
  nodes,
  edges,
  selectedId,
  onSelectPerson,
  printMode,
  focusId: externalFocusId,
  viewMode = 'all',
  lineage = 'paternal',
  compact = false,
  bowtieSpouseId = null,
  onBowtieSpouse,
  onFocusChange,
  highlightIds = null,
  onAddFirst,
}) {
  const svgRef = useRef(null);
  const gRef   = useRef(null);
  const zoomRef = useRef(null);

  const pendingFocusPan = useRef(null);

  const fitSigRef = useRef(null);

  const fitModeRef = useRef(null);

  const [focusId, setFocusId] = useState(externalFocusId || null);
  const [showLegend, setShowLegend] = useState(true);
  const [manuallyExpanded, setManuallyExpanded] = useState(new Set());
  const [manuallyCollapsed, setManuallyCollapsed] = useState(new Set());
  const [manuallyExpandedAncestors, setManuallyExpandedAncestors] = useState(new Set());
  const [showLayoutMetrics, setShowLayoutMetrics] = useState(true);

  const ANCESTOR_DEPTH = 99;
  const DESCENDANT_DEPTH = 99;
  const HOURGLASS_DEPTH = 99;
  const [expandedFrontier, setExpandedFrontier] = useState(new Set());

  useEffect(() => {
    if (externalFocusId) {

      if (String(externalFocusId) !== String(focusId)) {
        pendingFocusPan.current = String(externalFocusId);
      }
      setFocusId(externalFocusId);
    } else if (!focusId && nodes && nodes.length > 0) {
      const initial = selectedId || nodes[0]?.id;
      if (initial) setFocusId(String(initial));
    }
  }, [externalFocusId, nodes, selectedId]);

  useEffect(() => {
    setManuallyExpanded(prev => (prev.size ? new Set() : prev));
    setManuallyCollapsed(prev => (prev.size ? new Set() : prev));
    setManuallyExpandedAncestors(prev => (prev.size ? new Set() : prev));
    setExpandedFrontier(prev => (prev.size ? new Set() : prev));
  }, [viewMode, focusId]);

  const filteredData = useMemo(() => {
    if (!nodes || !nodes.length) return { nodes: [], edges: [] };
    const opts = { lineage };
    if (viewMode === 'ancestors' || viewMode === 'descendants' || viewMode === 'hourglass') {
      opts.maxGenerations = viewMode === 'ancestors' ? ANCESTOR_DEPTH
        : viewMode === 'descendants' ? DESCENDANT_DEPTH
        : HOURGLASS_DEPTH;
      opts.expandedFrontier = expandedFrontier;
    }
    return applyViewMode(nodes, edges || [], focusId, viewMode, opts);
  }, [nodes, edges, focusId, viewMode, lineage, expandedFrontier]);

  const layout = useMemo(() => {
    if (!filteredData.nodes.length) return null;
    if (!focusId) return null;
    return computeTreeLayout(filteredData.nodes, filteredData.edges, {
      focusId,
      viewMode,
      manuallyExpanded,
      manuallyCollapsed,
      manuallyExpandedAncestors,
      hideUnknowns: true,
      compact,
      activeSpouseId: bowtieSpouseId,
    });
  }, [filteredData, focusId, manuallyExpanded, manuallyCollapsed, manuallyExpandedAncestors, viewMode, compact, bowtieSpouseId]);

  const hlSet = useMemo(
    () => (highlightIds && highlightIds.length ? new Set(highlightIds.map(String)) : null),
    [highlightIds]
  );

  useEffect(() => {
    if (!layout || !svgRef.current || printMode) return;
    const svg = d3.select(svgRef.current);
    const g   = d3.select(gRef.current);
    const zoom = d3.zoom()
      .scaleExtent([0.01, 3])
      .on('zoom', (e) => g.attr('transform', e.transform));
    svg.call(zoom);
    zoomRef.current = zoom;
    const el = svgRef.current;
    const vw = el.clientWidth || 1200;
    const vh = el.clientHeight || 800;

    const sig = `${filteredData.nodes.length}|${viewMode}|${compact}|${lineage}`;

    const modeKey = `${viewMode}|${compact}|${lineage}`;
    const modeChanged = fitModeRef.current !== modeKey;
    fitModeRef.current = modeKey;
    const fitWhole = modeChanged && viewMode === 'all';

    const panId = pendingFocusPan.current;
    if (panId != null && !fitWhole) {
      const node = layout.positionedNodes.find(n => String(n.id) === String(panId));

      if (!node) return;
      pendingFocusPan.current = null;
      fitSigRef.current = sig;
      const cur = d3.zoomTransform(el);
      const s = cur.k && cur.k > 0.05 ? cur.k : 0.85;
      const cx = node.x + (layout.offsetX || 0) + NODE_WIDTH / 2;
      const cy = node.y + (layout.offsetY || 0) + NODE_HEIGHT / 2;
      svg.transition().duration(500).call(
        zoom.transform,
        d3.zoomIdentity.translate(vw / 2 - cx * s, vh / 2 - cy * s).scale(s)
      );
      return;
    }

    if (fitSigRef.current !== sig) {
      fitSigRef.current = sig;
      pendingFocusPan.current = null;
      svg.call(zoom.transform, computeFitTransform(layout, vw, vh));
    }
  }, [layout, printMode, filteredData, viewMode, compact, lineage]);

  const resetLayoutState = useCallback(() => {
    setManuallyExpanded(new Set());
    setManuallyCollapsed(new Set());
    setManuallyExpandedAncestors(new Set());
    setExpandedFrontier(new Set());
  }, []);

  const handleFocusChange = useCallback((newFocusId) => {
    const id = String(newFocusId);
    resetLayoutState();
    pendingFocusPan.current = id;
    fitSigRef.current = null;
    setFocusId(id);
    onFocusChange?.(id);
  }, [onFocusChange, resetLayoutState]);

  const handlePersonClick = useCallback((n, e) => {
    e?.stopPropagation();

    if (n.isBowtieAltSpouse && onBowtieSpouse) {
      onBowtieSpouse(String(n.id));
      return;
    }
    if (n.isCollapsed) {
      setManuallyExpanded(prev => {
        const next = new Set(prev);
        next.add(String(n.id));
        return next;
      });
      handleFocusChange(n.id);
      return;
    }

    if (FOCUS_NAV_MODES.has(viewMode) && String(n.id) !== String(focusId)) {
      handleFocusChange(n.id);
    }
    if (onSelectPerson) onSelectPerson(n);
  }, [onSelectPerson, onBowtieSpouse, viewMode, focusId, handleFocusChange]);

  const handleDoubleClick = useCallback((n, e) => {
    e?.stopPropagation();
    handleFocusChange(n.id);
    setManuallyExpanded(new Set());
    setManuallyCollapsed(new Set());
  }, [handleFocusChange]);

  const toggleCollapse = useCallback((nodeId, e) => {
    e.stopPropagation();
    const id = String(nodeId);
    if (manuallyExpanded.has(id)) {
      setManuallyExpanded(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } else {
      setManuallyCollapsed(prev => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }
  }, [manuallyExpanded]);

  const expandAncestors = useCallback((nodeId, e) => {
    e?.stopPropagation();
    const id = String(nodeId);
    setManuallyExpandedAncestors(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const expandFrontier = useCallback((nodeId, e) => {
    e?.stopPropagation();
    const id = String(nodeId);
    setExpandedFrontier(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const resetView = useCallback(() => {
    setManuallyExpanded(new Set());
    setManuallyCollapsed(new Set());
    setManuallyExpandedAncestors(new Set());
    setExpandedFrontier(new Set());
  }, []);

  const fitWholeTree = useCallback((animate = true) => {
    if (!layout || !svgRef.current || !zoomRef.current) return;
    const el = svgRef.current;
    const vw = el.clientWidth || 1200, vh = el.clientHeight || 800;
    pendingFocusPan.current = null;
    const target = computeFitTransform(layout, vw, vh);
    const sel = d3.select(el);
    (animate ? sel.transition().duration(500) : sel).call(zoomRef.current.transform, target);
  }, [layout]);

  const panToNode = useCallback((id) => {
    if (!layout || !svgRef.current || !zoomRef.current) return;
    const node = layout.positionedNodes.find(n => String(n.id) === String(id));
    if (!node) return;
    const el = svgRef.current;
    const vw = el.clientWidth || 1200, vh = el.clientHeight || 800;
    const cur = d3.zoomTransform(el);
    const s = cur.k && cur.k > 0.05 ? cur.k : 0.8;
    const cx = node.x + (layout.offsetX || 0) + NODE_WIDTH / 2;
    const cy = node.y + (layout.offsetY || 0) + NODE_HEIGHT / 2;
    d3.select(el).transition().duration(600).call(
      zoomRef.current.transform,
      d3.zoomIdentity.translate(vw / 2 - cx * s, vh / 2 - cy * s).scale(s)
    );
  }, [layout]);

  if (!layout) {
    if (!nodes || nodes.length === 0) {
      return (
        <div className="tree-empty">
          {onAddFirst ? (
            <>
              <button type="button" className="tree-empty-node" onClick={onAddFirst}>
                <span className="tree-empty-plus">＋</span>
                <span className="tree-empty-label">Adaugă prima persoană</span>
              </button>
              <p className="tree-empty-hint">Arborele tău pornește de aici</p>
            </>
          ) : (
            <div className="tree-empty-node tree-empty-node--static">
              <span className="tree-empty-label">Arborele este gol</span>
            </div>
          )}
        </div>
      );
    }
    return <div className="tree-loading" />;
  }

  const { positionedNodes, links, brackets, diamondMarkers, offsetX, offsetY, autoCollapsed } = layout;
  const layoutMetrics = (() => {
    const totalPersons = nodes?.length || 0;
    const renderedIds = new Set(
      positionedNodes.map(n => String(n.ghostOf || n.id).replace(/__g$/, ''))
    );
    const renderedPersons = renderedIds.size;
    const percent = totalPersons ? Math.round((renderedPersons / totalPersons) * 100) : 0;
    return {
      totalPersons,
      renderedPersons,
      percent,
    };
  })();
  const partnerLinks = links.filter(l => l.type === 'PARTNER');

  const diamondById = new Map((diamondMarkers || []).map(m => [String(m.id), m]));

  const FRONTIER_MODES = new Set(['ancestors', 'descendants', 'hourglass']);
  const frontierById = new Map(
    (FRONTIER_MODES.has(viewMode) ? (filteredData.frontier || []) : [])
      .map(f => [String(f.id), f])
  );

  const focusPerson = positionedNodes.find(n => String(n.id) === String(focusId));
  const hasCollapsed = (autoCollapsed?.size || 0) > 0 || manuallyCollapsed.size > 0;

  return (
    <>

      <div style={{
        position: 'absolute',
        top: 12,
        right: 12,
        background: '#fff',
        padding: '8px 12px',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        fontSize: 13,
        zIndex: 100,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
      }}>
        {focusPerson && (
          <span>📍 <strong>{focusPerson.full_name}</strong></span>
        )}
        <button onClick={() => fitWholeTree(true)} title="Încadrează tot arborele în ecran" style={{
          padding: '4px 10px', border: '1px solid #ccc',
          background: '#f5f5f5', borderRadius: 6, cursor: 'pointer',
          color: '#666', fontSize: 12,
        }}>⤢ Tot arborele</button>
        {viewMode !== 'all' && (
          <span style={{
            background: '#f3eeff',
            color: '#5e35b1',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
          }}>
            Mod: {viewMode}
          </span>
        )}
        {hasCollapsed && (
          <span style={{ color: '#888', fontSize: 12 }}>
            ({(autoCollapsed?.size || 0) + manuallyCollapsed.size} colapsate)
          </span>
        )}
        {(manuallyExpanded.size > 0 || manuallyCollapsed.size > 0 || manuallyExpandedAncestors.size > 0 || expandedFrontier.size > 0) && (
          <button onClick={resetView} style={{
            padding: '4px 10px', border: '1px solid #ccc',
            background: '#f5f5f5', borderRadius: 6, cursor: 'pointer',
            color: '#666', fontSize: 12,
          }}>↺ Reset</button>
        )}
      </div>

      {}
      {import.meta.env.DEV && (
        <div className={`layout-metrics-panel ${showLayoutMetrics ? 'open' : 'closed'}`}>
          <button
            className="layout-metrics-toggle"
            onClick={() => setShowLayoutMetrics(v => !v)}
            title={showLayoutMetrics ? 'Ascunde metricile layout-ului' : 'Arata metricile layout-ului'}
          >
            {showLayoutMetrics ? '−' : 'i'}
          </button>
          {showLayoutMetrics && (
            <>
              <div className="layout-metrics-head">
                <span>Test layout</span>
                <strong>{layoutMetrics.renderedPersons}/{layoutMetrics.totalPersons}</strong>
              </div>
              <div className="layout-metrics-grid">
                <span>Total persoane</span><b>{layoutMetrics.totalPersons}</b>
                <span>Persoane reprezentate</span><b>{layoutMetrics.renderedPersons}</b>
                <span>Procent vizibil</span><b>{layoutMetrics.percent}%</b>
              </div>
            </>
          )}
        </div>
      )}

      <div className={`rel-legend ${showLegend ? 'open' : 'closed'}`}>
        <button
          className="rel-legend-toggle"
          onClick={() => setShowLegend(v => !v)}
          title={showLegend ? 'Ascunde legenda tipurilor de relație' : 'Arată legenda tipurilor de relație'}
        >
          {showLegend ? '−' : '?'}
        </button>
        {showLegend && (
          <>
            <div className="rel-legend-title">Tip relație</div>
            {PARTNER_LEGEND.map(key => {
              const s = PARTNER_STYLES[key];
              return (
                <div key={key} className="rel-legend-row">
                  <svg width="34" height="10" viewBox="0 0 34 10" aria-hidden="true">
                    <line x1="1" y1="5" x2="33" y2="5"
                      stroke={s.stroke} strokeWidth={s.width}
                      strokeDasharray={s.dasharray === 'none' ? undefined : s.dasharray}
                      strokeLinecap="round" />
                  </svg>
                  <span>{s.label}</span>
                </div>
              );
            })}
          </>
        )}
      </div>

      <svg ref={svgRef} className="tree-canvas" data-tree-loaded="true">
        <g ref={gRef}>

          {partnerLinks.map((l, i) => {
            const sx = l.source.x, tx = l.target.x;
            const left  = sx < tx ? l.source : l.target;
            const right = sx < tx ? l.target : l.source;
            const style = PARTNER_STYLES[l.partner_type] || PARTNER_STYLES.married;
            const gap = right.x - left.x;

            const routedPathD = l.pathD
              ? l.pathD.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) =>
                  `${Number(x) + offsetX} ${Number(y) + offsetY}`)
              : '';
            const adjacent = gap <= NODE_WIDTH + 40 ||
              !positionedNodes.some(n =>
                n.y === left.y &&
                n.x + NODE_WIDTH / 2 > left.x + NODE_WIDTH &&
                n.x + NODE_WIDTH / 2 < right.x
              );
            const leftCx  = left.x  + offsetX + NODE_WIDTH/2;
            const rightCx = right.x + offsetX + NODE_WIDTH/2;
            const topY    = Math.min(left.y, right.y) + offsetY;
            const midY    = left.y + offsetY + NODE_HEIGHT/2;
            const showBadge = (l.marriageCount || 1) > 1;

            let connector, badgeX, badgeY;
            if (routedPathD) {
              connector = (
                <path
                  d={routedPathD}
                  fill="none" stroke={style.stroke} strokeWidth={style.width}
                  strokeDasharray={style.dasharray} strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
              badgeX = (l.badgePoint?.x ?? ((leftCx + rightCx) / 2)) + offsetX;
              badgeY = (l.badgePoint?.y ?? midY - offsetY) + offsetY;
            } else if (adjacent) {
              connector = (
                <line
                  x1={left.x  + offsetX + NODE_WIDTH} y1={midY}
                  x2={right.x + offsetX}              y2={midY}
                  stroke={style.stroke} strokeWidth={style.width}
                  strokeDasharray={style.dasharray} strokeLinecap="round"
                />
              );
              badgeX = (left.x + offsetX + NODE_WIDTH + right.x + offsetX) / 2;
              badgeY = midY;
            } else {
              const h = Math.min(130, 50 + gap * 0.12);
              const apexY = snapEdge(topY - h);
              const lcx = snapEdge(leftCx);
              const rcx = snapEdge(rightCx);
              connector = (
                <path
                  d={`M ${lcx} ${snapEdge(topY)} L ${lcx} ${apexY} L ${rcx} ${apexY} L ${rcx} ${snapEdge(topY)}`}
                  fill="none" stroke={style.stroke} strokeWidth={style.width}
                  strokeDasharray={style.dasharray} strokeLinecap="round" opacity={0.85}
                />
              );
              badgeX = snapEdge((leftCx + rightCx) / 2);
              badgeY = snapEdge(topY - 0.75 * h);
            }

            return (
              <g key={`cpl-${i}`}>
                {connector}
                {showBadge && (
                  <g>
                    <circle cx={badgeX} cy={badgeY} r={9} fill={style.stroke} stroke="#fff" strokeWidth="1.5"/>
                    <text x={badgeX} y={badgeY + 3.5} fontSize="11" fontWeight="700"
                      textAnchor="middle" fill="#fff"
                      style={{ userSelect:'none', pointerEvents:'none' }}>
                      {l.marriageOrder}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {(brackets || []).map((b, i) => {
            const children = (b.childCenters || []).map(c => ({ x: c.x + offsetX, y: c.y + offsetY }));
            if (!children.length) return null;

            const relKey = String(b.relationId ?? i);
            let relHash = 0;
            for (let k = 0; k < relKey.length; k++) relHash = (relHash * 31 + relKey.charCodeAt(k)) >>> 0;
            const color = BRACKET_COLORS[relHash % BRACKET_COLORS.length];
            const dissolved = b.partnerType === 'divorced' || b.partnerType === 'separated';
            const dasharray = dissolved ? '4,3' : (b.partnerType === 'engaged' ? '2,3' : 'none');
            const opacity   = dissolved ? 0.7 : 1;

            let pathD = b.pathD
              ? b.pathD.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) =>
                  `${Number(x) + offsetX} ${Number(y) + offsetY}`)
              : '';
            if (!pathD) return null;

            return (
              <path key={`bracket-${i}`} d={pathD} fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeDasharray={dasharray}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={opacity}
              />
            );
          })}

          {positionedNodes.map(n => {
            const x = n.x + offsetX, y = n.y + offsetY;

            if (n.isGhost) {
              const gc = n.gender === 'M' ? 'male' : n.gender === 'F' ? 'female' : 'unknown';
              const ini = (n.full_name || 'NN').split(' ').map(w => w[0]).join('').slice(0, 2);
              const relTag = n.ghostRelationType === 'ADOPTIVE_PARENT' ? 'adoptiv'
                           : n.ghostRelationType === 'STEP_PARENT' ? 'vitreg' : null;
              const nume = (n.full_name || 'Necunoscut');
              if (compact) {
                return (
                  <g key={n.id} className={`tree-node tree-node-ghost ${gc}`}
                     onClick={(e) => { e.stopPropagation(); panToNode(n.ghostOf); }}
                     style={{ cursor: 'alias', opacity: hlSet ? 0.22 : undefined }}>
                    <rect x={x} y={y} width={n.width} height={n.height} rx="7" className="node-bg-ghost"/>
                    <text x={x+n.width/2} y={y+n.height/2+4} className="node-name-compact" textAnchor="middle">
                      ⇄ {(nume).length>14?nume.slice(0,13)+'…':nume}
                    </text>
                  </g>
                );
              }
              return (
                <g key={n.id} className={`tree-node tree-node-ghost ${gc}`}
                   onClick={(e) => { e.stopPropagation(); panToNode(n.ghostOf); }}
                   style={{ cursor: 'alias', opacity: hlSet ? 0.22 : undefined }}>
                  <rect x={x} y={y} width={NODE_WIDTH} height={NODE_HEIGHT} rx="10" className="node-bg-ghost"/>
                  <circle cx={x+NODE_WIDTH/2} cy={y+50} r="34" className="avatar-ghost"/>
                  <text x={x+NODE_WIDTH/2} y={y+56} className="avatar-ghost-text" textAnchor="middle">{ini}</text>
                  <text x={x+NODE_WIDTH/2} y={y+105} className="node-name-ghost" textAnchor="middle">
                    {nume.length > 18 ? nume.slice(0,16)+'…' : nume}
                  </text>
                  {relTag && <text x={x+NODE_WIDTH/2} y={y+122} className="ghost-reltag" textAnchor="middle">({relTag})</text>}
                  <g>
                    <rect x={x+NODE_WIDTH/2-44} y={y+NODE_HEIGHT-30} width={88} height={22} rx={11}
                      fill="#9ca3af" stroke="#fff" strokeWidth="1.5"/>
                    <text x={x+NODE_WIDTH/2} y={y+NODE_HEIGHT-15} fontSize="11" fontWeight="700"
                      textAnchor="middle" fill="#fff" style={{ userSelect:'none', pointerEvents:'none' }}>
                      ⇄ vezi original
                    </text>
                  </g>
                </g>
              );
            }

            const sel = String(n.id) === String(selectedId);
            const isFocus = n.isFocus;
            const isCollapsed = n.isCollapsed;
            const hiddenDesc = n.hiddenDescendants || 0;
            const hiddenAnc  = n.hiddenAncestors || 0;
            const hiddenDescLabel = n.hiddenDescendantsLabel || `+${hiddenDesc} ▼`;
            const hiddenAncLabel = n.hiddenAncestorsLabel || `+${hiddenAnc} ▲`;
            const gc  = n.gender === 'M' ? 'male' : n.gender === 'F' ? 'female' : 'unknown';
            const src = resolvePhotoUrl(n.photo_url, n.photo);
            const idStr = String(n.id);
            const wasManuallyExpanded = manuallyExpanded.has(idStr);
            const inPath = hlSet ? hlSet.has(idStr) : false;
            const dimmed = hlSet ? !inPath : false;

            return (
              <g key={n.id} className={`tree-node ${gc} ${sel?'selected':''} ${n.death?'deceased':''} ${isFocus?'focus':''} ${isCollapsed?'collapsed':''} ${n.isBowtieAltSpouse?'bowtie-altspouse':''}`}
                 style={dimmed ? { opacity: 0.22 } : (n.ghostCluster ? { opacity: 0.6 } : undefined)}>

                {inPath && (
                  <rect x={x-5} y={y-5} width={n.width+10} height={n.height+10}
                    rx="15" fill="none" stroke="#e91e63" strokeWidth="3.5"/>
                )}

                {n.isBowtieAltSpouse && (
                  <text x={x + n.width/2} y={y - 6} textAnchor="middle" className="bowtie-altspouse-hint">
                    ⇄ click → arborele
                  </text>
                )}

                <g onClick={(e) => handlePersonClick(n, e)}
                   onDoubleClick={(e) => handleDoubleClick(n, e)}
                   style={{ cursor: 'pointer' }}>

                  {(sel || isFocus) && <rect x={x-3} y={y-3} width={n.width+6} height={n.height+6}
                    rx="14"
                    fill="none"
                    stroke={isFocus ? '#5e35b1' : '#7c6b9e'}
                    strokeWidth={isFocus ? '3' : '2'}
                    strokeDasharray={isFocus ? 'none' : '4,2'}
                  />}

                  {isCollapsed && !isFocus && !sel && (
                    <rect x={x-2} y={y-2} width={n.width+4} height={n.height+4}
                      rx="12" fill="none" stroke="#ff9800" strokeWidth="2" strokeDasharray="6,3"/>
                  )}

                  <rect x={x} y={y} width={n.width} height={n.height} rx={compact ? 7 : 10} className="node-bg"/>

                  {compact ? (

                    <text x={x+n.width/2} y={y+n.height/2+4} className="node-name-compact" textAnchor="middle">
                      {(n.full_name||'Necunoscut').length>16?(n.full_name||'').slice(0,15)+'…':n.full_name||'Necunoscut'}
                    </text>
                  ) : (
                    <>

                      <NodePhoto src={src} x={x+PHOTO_X} y={y+PHOTO_Y} size={PHOTO_SIZE} gender={n.gender}/>

                      <rect x={x+PHOTO_X} y={y+PHOTO_Y} width={PHOTO_SIZE} height={PHOTO_SIZE} rx="6"
                        className={`photo-border ${gc}`}/>

                      <text x={x+NODE_WIDTH/2} y={y+NAME_Y} className="node-name" textAnchor="middle">
                        {(n.full_name||'Necunoscut').length>20?(n.full_name||'').slice(0,18)+'…':n.full_name||'Necunoscut'}
                      </text>
                      {n.death && <text x={x+NODE_WIDTH-16} y={y+22} className="deceased-mark" textAnchor="middle">✝</text>}
                    </>
                  )}
                </g>

                {isCollapsed && hiddenDesc > 0 && (
                  (() => {
                    const badge = (n.collapseBadges || []).find(b => b.kind === 'hidden-descendants');
                    const bx = badge ? badge.x + offsetX : x + NODE_WIDTH/2 - badgeBox(hiddenDescLabel)/2;
                    const by = badge ? badge.y + offsetY : y + NODE_HEIGHT + 6;
                    const bw = badge ? badge.width : badgeBox(hiddenDescLabel);
                    return (
                  <g
                    onClick={(e) => { e.stopPropagation(); handlePersonClick(n, e); }}
                    style={{ cursor: 'pointer' }}
                  >
                    <title>Ramura colapsata: {hiddenDesc} persoane ascunse. Click pentru extindere.</title>
                    <rect x={bx} y={by}
                      width={bw} height={22} rx={11}
                      fill="#ff9800" stroke="#fff" strokeWidth="2"/>
                    <text x={bx + bw / 2} y={by + 15}
                      fontSize="11" fontWeight="700" textAnchor="middle" fill="#fff"
                      style={{ userSelect: 'none', pointerEvents: 'none' }}>
                      {hiddenDescLabel}
                    </text>
                  </g>
                    );
                  })()
                )}

                {hiddenAnc > 0 && (
                  (() => {
                    const badge = (n.collapseBadges || []).find(b => b.kind === 'hidden-ancestors');
                    const bx = badge ? badge.x + offsetX : x + NODE_WIDTH/2 - badgeBox(hiddenAncLabel)/2;
                    const by = badge ? badge.y + offsetY : y - 28;
                    const bw = badge ? badge.width : badgeBox(hiddenAncLabel);
                    return (
                  <g
                    onClick={(e) => expandAncestors(idStr, e)}
                    style={{ cursor: 'pointer' }}
                  >
                    <title>Ramura de familie colapsata: {hiddenAnc} persoane ascunse. Click pentru extindere locala.</title>
                    <rect x={bx} y={by}
                      width={bw} height={22} rx={11}
                      fill="#5e8bff" stroke="#fff" strokeWidth="2"/>
                    <text x={bx + bw / 2} y={by + 15}
                      fontSize="11" fontWeight="700" textAnchor="middle" fill="#fff"
                      style={{ userSelect: 'none', pointerEvents: 'none' }}>
                      {hiddenAncLabel}
                    </text>
                  </g>
                    );
                  })()
                )}

                {frontierById.has(idStr) && (() => {
                  const fr = frontierById.get(idStr);
                  const up = (fr.dir || (viewMode === 'ancestors' ? 'up' : 'down')) === 'up';
                  const ry = up ? y - 28 : y + NODE_HEIGHT + 6;
                  const ty = up ? y - 13 : y + NODE_HEIGHT + 21;
                  return (
                    <g onClick={(e) => expandFrontier(idStr, e)} style={{ cursor: 'pointer' }}>
                      <title>Încă {fr.count} {up ? 'strămoși' : 'descendenți'} — click pentru a-i afișa</title>
                      <rect x={x + NODE_WIDTH/2 - 30} y={ry}
                        width={60} height={22} rx={11}
                        fill="#5e8bff" stroke="#fff" strokeWidth="2"/>
                      <text x={x + NODE_WIDTH/2} y={ty}
                        fontSize="12" fontWeight="700" textAnchor="middle" fill="#fff"
                        style={{ userSelect: 'none', pointerEvents: 'none' }}>
                        +{fr.count} {up ? '▲' : '▼'}
                      </text>
                    </g>
                  );
                })()}

                {n.hasGhost && (
                  <g onClick={(e) => { e.stopPropagation(); panToNode(n.ghostIds[0]); }} style={{ cursor:'alias' }}>
                    <circle cx={x+16} cy={y+16} r={11} fill="#9ca3af" stroke="#fff" strokeWidth="1.5"/>
                    <text x={x+16} y={y+20} fontSize="12" fontWeight="700" textAnchor="middle" fill="#fff"
                      style={{ userSelect:'none', pointerEvents:'none' }}>⇄</text>
                  </g>
                )}

                {(() => {
                  const dm = diamondById.get(idStr);
                  if (!dm) return null;
                  const color = dm.kind === 'adopt' ? '#2e7d32' : dm.kind === 'step' ? '#ef6c00' : '#7c3aed';
                  const cx = x + NODE_WIDTH - 16, cy = y + 16;
                  return (
                    <g onClick={(e) => { e.stopPropagation(); panToNode(dm.targetId); }}
                       style={{ cursor: 'alias' }}>
                      <title>
                        {dm.kind === 'adopt' ? 'Linie adoptivă convergentă — click pentru a vedea linia'
                          : dm.kind === 'step' ? 'Linie vitregă convergentă — click pentru a vedea linia'
                          : 'Căsătorie între rude (strămoș comun) — click pentru a vedea linia comună'}
                      </title>
                      <rect x={cx - 9} y={cy - 9} width="18" height="18" rx="3"
                        transform={`rotate(45 ${cx} ${cy})`}
                        fill={color} stroke="#fff" strokeWidth="1.5" />
                      <text x={cx} y={cy + 3.5} fontSize="10" fontWeight="700" textAnchor="middle"
                        fill="#fff" style={{ userSelect:'none', pointerEvents:'none' }}>⌖</text>
                    </g>
                  );
                })()}

                {wasManuallyExpanded && (
                  <g
                    onClick={(e) => toggleCollapse(idStr, e)}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect x={x + NODE_WIDTH/2 - 30} y={y + NODE_HEIGHT + 6}
                      width={60} height={22} rx={11}
                      fill="#7c6b9e" stroke="#fff" strokeWidth="2"/>
                    <text x={x + NODE_WIDTH/2} y={y + NODE_HEIGHT + 21}
                      fontSize="11" fontWeight="700" textAnchor="middle" fill="#fff"
                      style={{ userSelect: 'none', pointerEvents: 'none' }}>
                      ▲ Colaps
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </>
  );
}
