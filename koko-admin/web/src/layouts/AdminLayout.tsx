import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { changePassword, errText } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { menuItems } from '../menu';
import { Input, Modal } from '../components/ui/primitives';
import type { Role } from '../api/client';

const roleLabel: Record<Role, string> = {
  super_admin: '超级管理员',
  moderator: '审核员',
  operator: '运营',
};

export default function AdminLayout() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  // 修改密码弹层
  const [pwdOpen, setPwdOpen] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdDone, setPwdDone] = useState(false);

  const pwdMutation = useMutation({
    mutationFn: () => changePassword(oldPwd, newPwd),
    onSuccess: () => {
      setPwdDone(true);
      setPwdError('');
    },
    onError: (err) => setPwdError(errText(err, '修改失败')),
  });

  function closePwd() {
    setPwdOpen(false);
    setOldPwd('');
    setNewPwd('');
    setPwdError('');
    setPwdDone(false);
  }

  if (!me) {
    return null;
  }

  const visibleItems = menuItems.filter((item) => item.roles.includes(me.role));

  // 侧边栏分组渲染：group 字段变化时插入一行分组标题
  let prevGroup: string | undefined;

  return (
    <div className="flex min-h-screen bg-gray-50 text-gray-900">
      <aside className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-16 items-center gap-2 px-5">
          <span className="text-lg font-bold text-indigo-600">KOKO</span>
          <span className="text-sm font-medium text-gray-500">管理后台</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {visibleItems.map((item) => {
            const showGroup = item.group && item.group !== prevGroup;
            prevGroup = item.group;
            return (
              <div key={item.path}>
                {showGroup ? (
                  <div className="px-3 pb-1 pt-4 text-[11px] font-semibold tracking-wide text-gray-400">
                    {item.group}
                  </div>
                ) : null}
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`
                  }
                >
                  <span className="text-base leading-none">{item.glyph}</span>
                  {item.label}
                </NavLink>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-gray-200 px-5 py-4">
          <div className="text-sm font-medium text-gray-900">{me.username}</div>
          <div className="mt-0.5 text-xs text-gray-400">{roleLabel[me.role]}</div>
          <div className="mt-3 flex gap-3 text-xs">
            <button className="text-gray-400 hover:text-indigo-600" onClick={() => setPwdOpen(true)}>
              修改密码
            </button>
            <button
              className="text-gray-400 hover:text-red-600"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              退出登录
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Outlet />
        </div>
      </main>

      <Modal open={pwdOpen} title="修改密码" onClose={closePwd}>
        {pwdDone ? (
          <div className="text-sm">
            <div className="rounded-lg bg-green-50 px-4 py-3 text-green-700">密码已修改成功。</div>
            <div className="mt-4 flex justify-end">
              <button
                className="text-sm font-medium text-indigo-600 hover:underline"
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
              >
                使用新密码重新登录
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newPwd.length < 10) {
                setPwdError('新密码至少 10 位');
                return;
              }
              pwdMutation.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">旧密码</label>
              <Input
                type="password"
                className="w-full"
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">新密码（至少 10 位）</label>
              <Input
                type="password"
                className="w-full"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                required
              />
            </div>
            {pwdError ? <div className="text-sm text-red-600">{pwdError}</div> : null}
            <div className="flex justify-end gap-3">
              <button type="button" className="btn-secondary" onClick={closePwd}>
                取消
              </button>
              <button type="submit" className="btn-primary" disabled={pwdMutation.isPending}>
                {pwdMutation.isPending ? '提交中…' : '确认修改'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
