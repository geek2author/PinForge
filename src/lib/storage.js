// ==========================================
// PinForge 本地会话存储（localStorage 自动保存/恢复）
// ==========================================
const KEY = 'pinforge.session.v1';

export function saveSession(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, savedAt: Date.now(), ...state }));
    return true;
  } catch {
    return false;
  }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || !Array.isArray(data.pinsData) || data.pinsData.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// 主题偏好
const THEME_KEY = 'pinforge.theme.v1';
export const loadTheme = () => {
  try { return localStorage.getItem(THEME_KEY); } catch { return null; }
};
export const saveTheme = (t) => {
  try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
};
