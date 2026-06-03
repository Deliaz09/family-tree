import { createContext, useContext } from 'react';
import axios from 'axios';

export function setActiveTree(treeId) {
  if (treeId) {
    axios.defaults.headers.common['X-Tree-Id'] = treeId;
  } else {
    delete axios.defaults.headers.common['X-Tree-Id'];
  }
}

const ROLURI_SCRIERE = ['owner', 'editor'];
const ROLURI_OWNER   = ['owner'];

export const PermissionContext = createContext({ role: 'viewer', treeId: null });

export function usePermissions() {
  const ctx = useContext(PermissionContext) || {};
  const role = ctx.role || 'viewer';
  return {
    role,
    treeId:   ctx.treeId || null,
    isOwner:  role === 'owner',
    canWrite: ROLURI_SCRIERE.includes(role),
    canOwner: ROLURI_OWNER.includes(role),
  };
}
