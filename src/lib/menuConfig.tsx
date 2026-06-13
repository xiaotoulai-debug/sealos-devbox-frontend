/**
 * 全量菜单配置 —— 单一数据源
 *
 * Dashboard.tsx  读取此配置渲染侧边栏，并按 code 过滤权限。
 * RoleManagement.tsx 读取此配置动态生成权限分配树，提交 code 给后端。
 *
 * 规则：
 *   - 父级分组节点不设 code，子节点过滤后若全部被移除则父节点自动隐藏。
 *   - 叶子节点的 code 必须与后端 Permission 表的 code 字段严格对齐。
 *   - 仪表盘左侧菜单可见性由 Dashboard.tsx 组合规则控制；权限树见 DASHBOARD_PERMISSION_ITEMS。
 */
import type { ReactNode } from 'react';
import {
  DashboardOutlined,
  GlobalOutlined,
  StarOutlined,
  DatabaseOutlined,
  AppstoreOutlined,
  TruckOutlined,
  ShoppingCartOutlined,
  FileTextOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  ApiOutlined,
  BulbOutlined,
  BarChartOutlined,
  LineChartOutlined,
  HomeOutlined,
} from '@ant-design/icons';

/** 权限树专用：挂载在菜单叶子下的操作权限（不进入侧边栏） */
export interface AppMenuAction {
  code:  string;
  label: string;
}

export interface AppMenuItem {
  key:       string;
  icon?:     ReactNode;
  label:     string;
  /** 与后端 Permission.code 严格对齐；无此字段 = 始终可见 */
  code?:     string;
  /** 权限树专用：操作级权限，挂在对应菜单叶子下 */
  actions?:  AppMenuAction[];
  children?: AppMenuItem[];
}

/** 仪表盘权限树（仅用于角色管理分配，不影响侧边栏结构） */
export const DASHBOARD_PERMISSION_ITEMS: AppMenuItem[] = [
  {
    key: 'dashboard-perm',
    label: '仪表盘',
    code: 'MENU_DASHBOARD',
    children: [
      { key: 'dashboard-daily', label: '每日登记（页面访问）', code: 'MENU_DASHBOARD_DAILY' },
      {
        key: 'dashboard-task-center',
        label: '个人任务（页面访问）',
        code: 'MENU_DASHBOARD_TASK_CENTER',
        actions: [
          { code: 'ACTION_DASHBOARD_REMINDER_TEMPLATE_MANAGE', label: '管理提醒模板（操作权限）' },
        ],
      },
      {
        key: 'dashboard-company',
        label: '团队任务（页面访问）',
        code: 'MENU_DASHBOARD_COMPANY_MANAGEMENT',
        actions: [
          { code: 'ACTION_DASHBOARD_COMPANY_TASK_MANAGE', label: '团队任务-任务管理（操作权限）' },
          { code: 'ACTION_DASHBOARD_COMPANY_WEEKLY_AI_GENERATE', label: '团队任务-生成AI周报（操作权限）' },
        ],
      },
    ],
  },
];

export const ALL_MENU_ITEMS: AppMenuItem[] = [
  { key: 'dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  {
    key: 'product-dev',
    icon: <BulbOutlined />,
    label: '产品开发',
    children: [
      { key: 'pool',           icon: <GlobalOutlined />,   label: '公海产品', code: 'MENU_PUBLIC_PRODUCTS' },
      { key: 'private-pool',   icon: <StarOutlined />,     label: '意向产品', code: 'MENU_INTENT_PRODUCTS'  },
      { key: 'inventory-sku',  icon: <DatabaseOutlined />, label: '库存 SKU', code: 'MENU_INVENTORY'         },
      { key: 'warehouse-list', icon: <HomeOutlined />,     label: '仓库列表', code: 'MENU_WAREHOUSE_LIST'   },
    ],
  },
  {
    key: 'platform-data',
    icon: <BarChartOutlined />,
    label: '平台数据',
    children: [
      { key: 'platform-products', icon: <AppstoreOutlined />, label: '平台产品',   code: 'MENU_PLATFORM_PRODUCTS' },
      { key: 'order-daily-dashboard', icon: <LineChartOutlined />, label: '订单日报', code: 'MENU_PLATFORM_ORDERS' },
      { key: 'fbe-shipments',     icon: <TruckOutlined />,    label: 'FBE发货', code: 'MENU_FBE_SHIPMENTS'     },
    ],
  },
  {
    key: 'supply-chain',
    icon: <ShoppingCartOutlined />,
    label: '供应采购',
    children: [
      { key: 'sc-planning',   icon: <FileTextOutlined />, label: '采购计划', code: 'MENU_PURCHASE_PLAN'   },
      { key: 'sc-management', icon: <SettingOutlined />,  label: '采购管理', code: 'MENU_PURCHASE_MANAGE' },
    ],
  },
  {
    key: 'user-center',
    icon: <TeamOutlined />,
    label: '用户管理',
    children: [
      { key: 'users', icon: <UserOutlined />,              label: '分配账号', code: 'MENU_ASSIGN_ACCOUNT' },
      { key: 'roles', icon: <SafetyCertificateOutlined />, label: '角色管理', code: 'MENU_ROLE_MANAGE'    },
    ],
  },
  {
    key: 'sys-settings',
    icon: <SettingOutlined />,
    label: '系统设置',
    children: [
      { key: 'shop-auth',        icon: <ShopOutlined />, label: '店铺授权',  code: 'MENU_SHOP_AUTH'    },
      { key: 'alibaba-settings', icon: <ApiOutlined />,  label: '1688 配置', code: 'MENU_1688_CONFIG'   },
    ],
  },
];

/**
 * 从菜单配置动态生成权限分配树（供 RoleManagement 使用）。
 *
 * - 父级分组节点：key = `group:${item.key}`，title = label（不可勾选，仅展示分组）
 * - 叶子节点：key = code，title = label（可勾选，提交给后端）
 * - 带 code 的父节点：key = code，子节点挂在其下（如仪表盘）
 * - 叶子节点可携带 actions 作为子操作权限
 * - 无 code 且无 children 的节点不纳入权限树
 */
export interface PermTreeNode {
  key:       string;
  title:     string;
  children?: PermTreeNode[];
  /** 是否为分组节点（不对应后端权限，仅用于树的展开/折叠） */
  isGroup?:  boolean;
}

export function buildPermissionTree(items: AppMenuItem[], seenCodes = new Set<string>()): PermTreeNode[] {
  const result: PermTreeNode[] = [];
  for (const item of items) {
    if (item.children && item.children.length > 0) {
      const children = buildPermissionTree(item.children, seenCodes);
      if (children.length === 0) continue;
      if (item.code && !seenCodes.has(item.code)) {
        seenCodes.add(item.code);
        result.push({ key: item.code, title: item.label, children });
      } else if (!item.code) {
        result.push({
          key:     `group:${item.key}`,
          title:   item.label,
          isGroup: true,
          children,
        });
      }
    } else if (item.code && !seenCodes.has(item.code)) {
      seenCodes.add(item.code);
      const node: PermTreeNode = { key: item.code, title: item.label };
      if (item.actions && item.actions.length > 0) {
        node.children = item.actions.map((action) => ({
          key:   action.code,
          title: action.label,
        }));
      }
      result.push(node);
    }
  }
  return result;
}

/**
 * 递归收集树节点中所有分组节点的 key（用于回显时需要排除分组 key）。
 */
export function collectGroupKeys(nodes: PermTreeNode[]): string[] {
  const keys: string[] = [];
  for (const n of nodes) {
    if (n.isGroup) {
      keys.push(n.key);
      if (n.children) keys.push(...collectGroupKeys(n.children));
    }
  }
  return keys;
}
