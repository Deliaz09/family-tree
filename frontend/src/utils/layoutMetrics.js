const METRICS = {
  normal:  { NW: 160, NH: 200, HG: 14, VG: 70, CG: 20 },
  compact: { NW: 116, NH: 56,  HG: 10, VG: 40, CG: 8 },
};

export let NODE_WIDTH  = METRICS.normal.NW;
export let NODE_HEIGHT = METRICS.normal.NH;
export let H_GAP      = METRICS.normal.HG;
export let V_GAP      = METRICS.normal.VG;
export let COUPLE_GAP = METRICS.normal.CG;
export let ROW_HEIGHT = NODE_HEIGHT + V_GAP;
export let ROOT_GAP   = H_GAP * 3;

export const DEFAULT_MAX_EDGE_LENGTH = 520;
export const MAX_EDGE_LENGTH = DEFAULT_MAX_EDGE_LENGTH;
export const NODE_EDGE_MARGIN = 12;
export const BUS_VERTICAL_GAP = 24;
export const BUS_HORIZONTAL_GAP = 16;
export const MIN_EDGE_SEGMENT = 20;
export const EDGE_GRID = 5;
export const GRID_SIZE = EDGE_GRID;
export const MIN_NODE_GAP = 18;
export const MIN_SUBTREE_GAP = 36;
export const BADGE_MARGIN = 8;
export const EDGE_NODE_MARGIN = 10;
export const EDGE_BADGE_MARGIN = 8;
export const MIN_GENERATION_GAP = 44;

export function applyMetrics(compact) {
  const m = compact ? METRICS.compact : METRICS.normal;
  NODE_WIDTH = m.NW; NODE_HEIGHT = m.NH;
  H_GAP = m.HG; V_GAP = m.VG; COUPLE_GAP = m.CG;
  ROW_HEIGHT = NODE_HEIGHT + V_GAP;
  ROOT_GAP = H_GAP * 3;
}
