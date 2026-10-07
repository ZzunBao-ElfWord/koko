import type { ReactNode } from 'react';
import type { Role } from './api/client';
import Dashboard from './pages/Dashboard';
import Reports from './pages/Reports';
import Users from './pages/Users';
import Messages from './pages/Messages';
import Spaces from './pages/Spaces';
import Media from './pages/Media';
import BannedWords from './pages/BannedWords';
import Announcements from './pages/Announcements';
import VoiceRooms from './pages/VoiceRooms';
import Audit from './pages/Audit';
import System from './pages/System';
import Settings from './pages/Settings';

// 全站唯一的菜单 + 路由清单。
// 新增页面时在此登记：路径、标题、图标、可见角色、页面组件。
// 注意：这里的 roles 只是菜单/前端路由层，后端路由必须同步挂 RequireRole（见 AGENTS.md 第 4 节）。
export interface MenuItem {
  path: string;
  label: string;
  glyph: string;
  roles: Role[];
  element: ReactNode;
}

const all: Role[] = ['super_admin', 'moderator', 'operator'];
const mods: Role[] = ['super_admin', 'moderator'];

export const menuItems: MenuItem[] = [
  {
    path: '/',
    label: '数据看板',
    glyph: '📊',
    roles: all,
    element: <Dashboard />,
  },
  {
    path: '/reports',
    label: '举报队列',
    glyph: '🚨',
    roles: mods,
    element: <Reports />,
  },
  {
    path: '/users',
    label: '用户管理',
    glyph: '👥',
    roles: mods,
    element: <Users />,
  },
  {
    path: '/messages',
    label: '消息管理',
    glyph: '💬',
    roles: mods,
    element: <Messages />,
  },
  {
    path: '/spaces',
    label: '空间管理',
    glyph: '🏠',
    roles: mods,
    element: <Spaces />,
  },
  {
    path: '/media',
    label: '媒体文件',
    glyph: '🗂️',
    roles: mods,
    element: <Media />,
  },
  {
    path: '/banned-words',
    label: '敏感词库',
    glyph: '🚫',
    roles: mods,
    element: <BannedWords />,
  },
  {
    path: '/announcements',
    label: '运营公告',
    glyph: '📢',
    roles: mods,
    element: <Announcements />,
  },
  {
    path: '/voice-rooms',
    label: '语音房',
    glyph: '🔊',
    roles: mods,
    element: <VoiceRooms />,
  },
  {
    path: '/audit',
    label: '审计日志',
    glyph: '📋',
    roles: ['super_admin', 'operator'],
    element: <Audit />,
  },
  {
    path: '/system',
    label: '服务健康',
    glyph: '🩺',
    roles: all,
    element: <System />,
  },
  {
    path: '/settings',
    label: '后台账号',
    glyph: '⚙️',
    roles: ['super_admin'],
    element: <Settings />,
  },
];
