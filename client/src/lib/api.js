import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res.data,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    const msg = err.response?.data?.message || 'حدث خطأ غير متوقع.';
    return Promise.reject(new Error(msg));
  }
);

export const apiGet = (url, params) => api.get(url, { params });
export const apiPost = (url, body) => api.post(url, body);
export const apiPut = (url, body) => api.put(url, body);
export const apiPatch = (url, body) => api.patch(url, body);
export const apiDelete = url => api.delete(url);

export function uploadPost(url, body) {
  return api.post(url, body);
}
export function uploadPut(url, body) {
  return api.put(url, body);
}

export default api;