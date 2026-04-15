import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { App as AntdApp, Spin } from 'antd';
import { hasToken } from './lib/auth';

// 路由懒加载：Login 首屏直接加载，Dashboard 等大页面按需拆分
import Login from './pages/Login';
const Dashboard = lazy(() => import('./pages/Dashboard'));

const PageLoading = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
    <Spin size="large" />
  </div>
);

// ── 路由守卫：未登录则重定向到 /login ─────────────────────────
function PrivateRoute({ children }: { children: ReactNode }) {
  if (!hasToken()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AntdApp>
      <BrowserRouter>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <Dashboard />
                </PrivateRoute>
              }
            />
            {/* 兜底：未匹配路由跳回登录 */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AntdApp>
  );
}
