const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

function getToken() {
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

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Sesi habis, silakan login ulang');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request gagal (${res.status})`);
  }
  return data;
}

export const api = {
  me: () => request('/auth/me'),

  waStatus: () => request('/wa/status'),
  waConnect: () => request('/wa/connect', { method: 'POST' }),
  waLogout: () => request('/wa/logout', { method: 'POST' }),
  waSafety: () => request('/wa/safety'),

  contactsPreview: () => request('/contacts/preview'),
  contactsImport: (payload) => request('/contacts/import', { method: 'POST', body: payload }),
  setPattern: (payload) => request('/contacts/pattern', { method: 'PUT', body: payload }),

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
};
