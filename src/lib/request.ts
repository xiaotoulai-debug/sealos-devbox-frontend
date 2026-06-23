import axios from 'axios';
import { message } from 'antd';

/**
 * 环境说明（与 Vite 代理一致）：
 * - 未设置 VITE_API_URL：浏览器请求同源 `/api/*`，由 dev 代理转发至 vite.config 中 target（默认 localhost:3001）。
 * - 已设置 VITE_API_URL：直连 `${VITE_API_URL}/api`，须后端配置 CORS 允许该前端 Origin，否则预检失败且无 response。
 *
 * 请求头：仅设置 Authorization（Bearer），无额外自定义头，不会触发非简单请求的额外预检字段。
 */
const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api';

const request = axios.create({
  baseURL,
  timeout: 15000,
});

/** 无 HTTP 响应体：断网、CORS 拦截、DNS 失败、超时等，与业务 4xx/5xx 区分 */
export function isAxiosNetworkError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (error.response) return false;
  if (error.code === 'ERR_NETWORK') return true;
  if (error.code === 'ECONNABORTED') return true;
  if (String(error.message).includes('Network Error')) return true;
  return false;
}

// 请求拦截器：自动注入 JWT Token
request.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：401 自动跳回登录页；网络层失败统一提示，避免页面只显示「暂无数据」
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
    } else if (isAxiosNetworkError(error)) {
      message.error('网络连接异常，请检查后端服务地址或跨域（CORS）配置');
    }
    return Promise.reject(error);
  },
);

export default request;
