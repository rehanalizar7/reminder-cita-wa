const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export function getToken() {
  try {
    return localStorage.getItem('cita_token');
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    localStorage.setItem('cita_token', token);
  } catch {
    /* ignore — worst case the user just has to log in again this visit */
  }
}

export function clearToken() {
  try {
    localStorage.removeItem('cita_token');
  } catch {
    /* ignore */
  }
}

export function isLoggedIn() {
  return Boolean(getToken());
}

export function googleLoginUrl() {
  return `${BASE_URL}/auth/google`;
}

async function request(path, { method = 'GET', body, params } = {}) {
  const url = new URL(BASE_URL + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }

  const token = getToken();
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // 401 = JWT aplikasi tidak valid → logout. Bukan untuk error Google API
  // (token Google yang rusak dikembalikan sebagai 409 GOOGLE_RECONNECT_REQUIRED).
  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Sesi habis, silakan login ulang');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request gagal (${res.status})`);
    if (data.code) err.code = data.code; // teruskan code dari backend (mis. GOOGLE_RECONNECT_REQUIRED)
    throw err;
  }
  return data;
}

export const api = {
  me: () => request('/auth/me'),

  waStatus: () => request('/wa/status'),
  waConnect: () => request('/wa/connect', { method: 'POST' }),
  waLogout: () => request('/wa/logout', { method: 'POST' }),
  waSafety: () => request('/wa/safety'),

  outlets: (params) => request('/outlets', { params }),
  updateOutlet: (id, body) => request(`/outlets/${id}`, { method: 'PATCH', body }),
  setOutletGroups: (id, groupIds) => request(`/outlets/${id}/groups`, { method: 'POST', body: { groupIds } }),

  groups: () => request('/groups'),
  createGroup: (name) => request('/groups', { method: 'POST', body: { name } }),
  deleteGroup: (id) => request(`/groups/${id}`, { method: 'DELETE' }),

  templates: () => request('/templates'),
  createTemplate: (body) => request('/templates', { method: 'POST', body }),
  updateTemplate: (id, body) => request(`/templates/${id}`, { method: 'PUT', body }),
  deleteTemplate: (id) => request(`/templates/${id}`, { method: 'DELETE' }),

  sendNow: (body) => request('/send/now', { method: 'POST', body }),
  sendHistory: (params) => request('/send/history', { params }),

  schedules: () => request('/schedules'),
  createSchedule: (body) => request('/schedules', { method: 'POST', body }),
  toggleSchedule: (id, isActive) => request(`/schedules/${id}`, { method: 'PATCH', body: { isActive } }),
  deleteSchedule: (id) => request(`/schedules/${id}`, { method: 'DELETE' }),
  runScheduleNow: (id) => request(`/schedules/${id}/run-now`, { method: 'POST' }),

  tsubAvailable: () => request('/tsub/available'),
  tsubClaim: (tsubId) => request('/tsub/claim', { method: 'POST', body: { tsubId } }),
  citaRetailerSearch: (search) => request('/tsub/retailers', { params: { search } }),

  // Contacts: Google OAuth (terpisah dari login)
  contactsGoogleStatus: () => request('/contacts/google/status'),
  // POST → { url } — frontend yang navigasi ke url, bukan server redirect,
  // supaya request tetap bawa Bearer token.
  contactsGoogleGetConnectUrl: () => request('/contacts/google/connect-url', { method: 'POST' }),
  contactsGoogleDisconnect: () => request('/contacts/google/disconnect', { method: 'DELETE' }),
  contactsGooglePreview: () => request('/contacts/google/preview'),

  // Contacts: Excel
  contactsExcelTemplate: async () => {
    const token = getToken();
    const res = await fetch(`${BASE_URL}/contacts/template`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `Gagal download template (${res.status})`);
    }
    return res.blob();
  },
  contactsUploadExcel: async (file) => {
    const token = getToken();
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE_URL}/contacts/upload/excel`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (res.status === 401) {
      clearToken();
      window.location.href = '/login';
      throw new Error('Sesi habis, silakan login ulang');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Upload gagal (${res.status})`);
    return data;
  },

  // Contacts: Manual
  contactsPreviewManual: (rows) => request('/contacts/preview/manual', { method: 'POST', body: { rows } }),

  // Contacts: Commit (semua sumber pakai endpoint yang sama)
  contactsImport: (rows, savePattern) => request('/contacts/import', { method: 'POST', body: { rows, savePattern } }),

  // Pattern
  setPattern: (payload) => request('/contacts/pattern', { method: 'PUT', body: payload }),

  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),

  adminUsers: () => request('/admin/users'),
  adminCreateUser: (body) => request('/admin/users', { method: 'POST', body }),
  adminResetPassword: (id, newPassword) =>
    request(`/admin/users/${id}/reset-password`, { method: 'POST', body: { newPassword } }),
  adminToggleActive: (id, isActive) =>
    request(`/admin/users/${id}/active`, { method: 'PATCH', body: { isActive } }),
};
