import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || window.location.origin;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });
api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// When the saved login has expired (or is no longer valid) the server answers
// 401. Instead of silently failing, clear the stale login and send the user
// back to the right login page with a clear message.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    const url = String(error?.config?.url || "");
    if (status === 401 && !url.includes("/auth/") && localStorage.getItem("token")) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      try { sessionStorage.setItem("acjm_session_expired", "1"); } catch {}
      const path = window.location.pathname || "/";
      const target = "/";
      if (path !== target) window.location.assign(target);
    }
    return Promise.reject(error);
  }
);

export default api;

export const setAuth = (token, user) => {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
};
export const getUser = () => {
  try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
};
export const clearAuth = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
};
