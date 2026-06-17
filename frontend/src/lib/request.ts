import axios from 'axios';

// API 基础地址：有 VITE_API_URL 时直接请求云端，否则走 Vite 代理
const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api';

const request = axios.create({
  baseURL,
  timeout: 15000,
});

// 请求拦截器：自动注入 JWT Token
request.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：401 自动跳回登录页
request.interceptors.response.use(
  (response) => response,
  (error) => {
    const cfg = axios.isAxiosError(error) ? error.config : undefined;
    const reqUrl = String(cfg?.url ?? '');
    // 登录接口 401（如密码错误）不应清 token / 强跳登录页，由 Login 页展示后端 message
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const isLoginRequest = reqUrl.includes('/auth/login');
      if (!isLoginRequest) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default request;
