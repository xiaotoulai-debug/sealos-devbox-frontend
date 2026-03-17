import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, message } from 'antd';
import axios from 'axios';
import request from '../lib/request';

interface LoginFormValues {
  username: string;
  password: string;
}

interface LoginResponseData {
  token: string;
  user: {
    id: number;
    username: string;
    name: string;
    avatar: string | null;
    role: { id: number; name: string; isAdmin?: boolean };
  };
  // 后端返回该用户拥有的权限码数组（超管可返回 null 表示不限制）
  permissions?: string[] | null;
}

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm<LoginFormValues>();

  const handleSubmit = async (values: LoginFormValues) => {
    setLoading(true);
    try {
      const { data: res } = await request.post<{ code: number; data: LoginResponseData; message: string }>(
        '/auth/login',
        { username: values.username, password: values.password },
      );

      if (res.code === 200) {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        // 存储权限码：null 表示超管（不限制），[] 表示无权限，[...] 表示具体权限列表
        // 若后端尚未返回 permissions 字段，写入 JSON 'null' 保持向后兼容（视为超管）
        localStorage.setItem('permissions', JSON.stringify(res.data.permissions ?? null));
        message.success(`欢迎回来，${res.data.user.name}！`);
        navigate('/dashboard');
      } else {
        message.error(res.message || '登录失败，请稍后重试');
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.message ?? '网络异常，请检查后端服务是否启动';
        message.error(msg);
      } else {
        message.error('登录失败，请稍后重试');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">

      {/* ── 左侧：品牌区 60% ── */}
      <div className="hidden lg:flex lg:w-3/5 bg-gradient-to-br from-slate-800 via-slate-700 to-blue-900 justify-center items-center relative overflow-hidden">

        {/* 装饰性背景光晕 */}
        <div className="absolute top-[-120px] right-[-120px] w-[500px] h-[500px] rounded-full bg-blue-500 opacity-10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-100px] left-[-100px] w-[400px] h-[400px] rounded-full bg-slate-400 opacity-10 blur-3xl pointer-events-none" />

        {/* Logo：绝对定位锚在左上角，独立于文字块之外 */}
        <div className="absolute top-12 left-12 z-20 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center shadow-lg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M3 3h7v7H3V3zm0 11h7v7H3v-7zm11-11h7v7h-7V3zm0 11h7v7h-7v-7z" fill="white" />
            </svg>
          </div>
          <span className="text-white font-semibold text-lg tracking-widest">eMAG</span>
        </div>

        {/* 版权：绝对定位锚在左下角 */}
        <div className="absolute bottom-10 left-12 z-20">
          <p className="text-slate-500 text-xs tracking-wider">
            © {new Date().getFullYear()} eMAG 跨境电商管理系统 · 保留所有权利
          </p>
        </div>

        {/* 中央文字块：几何居中，max-w 约束内聚，去掉 px 贴边 */}
        <div className="relative z-10 w-full max-w-lg space-y-8 text-left">

          {/* 第一层：顶部小标签，极宽字距 + 半透明 */}
          <p className="text-blue-300/60 text-[10px] font-medium tracking-[0.3em] uppercase">
            Cross-border E-commerce Platform
          </p>

          {/* 第二层：核心大标题，适度字距 + 紧凑行高 */}
          <h1 className="text-white font-bold tracking-[0.06em] leading-tight">
            <span className="block text-5xl xl:text-6xl">跨境电商</span>
            <span className="block text-5xl xl:text-6xl mt-2">
              <span className="text-blue-300">全链路管理</span>系统
            </span>
          </h1>

          {/* 第三层：描述文字，适当字距 + 舒适行高 */}
          <div className="space-y-2 pt-1">
            <p className="text-slate-300 text-base font-medium tracking-[0.06em] leading-relaxed">
              Empowering Global E-commerce
            </p>
            <p className="text-slate-400 text-sm tracking-wider leading-loose">
              从选品到履约，一站式驱动你的全球生意
            </p>
          </div>

          {/* 第四层：特性标签 */}
          <div className="flex flex-wrap gap-2.5 pt-2">
            {['智能选品池', '利润自动核算', '动态权限管控', '团队协同'].map((tag) => (
              <span
                key={tag}
                className="px-4 py-1.5 rounded-full bg-white/10 text-slate-300 text-xs tracking-widest backdrop-blur-sm border border-white/10"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── 右侧：登录区 40% ── */}
      <div className="w-full lg:w-2/5 bg-white flex flex-col items-center justify-center px-8 sm:px-12 py-16">

        <div className="w-full max-w-md">

          {/* 标题 */}
          <div className="mb-10">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
              欢迎回来
            </h2>
            <p className="text-gray-400 mt-2 text-sm">
              登录您的工作账号以继续
            </p>
          </div>

          {/* 登录表单 */}
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            autoComplete="off"
            requiredMark={false}
          >
            <Form.Item
              name="username"
              label={
                <span className="text-sm font-medium text-gray-700">
                  登录账号
                </span>
              }
              rules={[{ required: true, message: '请输入登录账号' }]}
            >
              <Input
                placeholder="请输入账号"
                size="large"
                style={{ borderRadius: 10, height: 48 }}
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={
                <span className="text-sm font-medium text-gray-700">
                  登录密码
                </span>
              }
              rules={[{ required: true, message: '请输入登录密码' }]}
              style={{ marginBottom: 8 }}
            >
              <Input.Password
                placeholder="请输入密码"
                size="large"
                style={{ borderRadius: 10, height: 48 }}
              />
            </Form.Item>

            <div className="flex justify-end mb-6">
              <span className="text-xs text-gray-400 cursor-default select-none">
                忘记密码？请联系管理员
              </span>
            </div>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                loading={loading}
                block
                style={{
                  height: 48,
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #2563EB 0%, #1d4ed8 100%)',
                  border: 'none',
                  boxShadow: '0 4px 14px 0 rgba(37, 99, 235, 0.35)',
                  letterSpacing: '0.05em',
                }}
              >
                {loading ? '验证中...' : '登　录'}
              </Button>
            </Form.Item>
          </Form>

          {/* 底部系统说明 */}
          <div className="mt-10 pt-8 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-300">
              本系统仅对授权人员开放 · 如需账号请联系管理员
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
