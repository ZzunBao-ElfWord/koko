import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  clearUserFlag,
  deleteUserSession,
  downloadCsv,
  errText,
  fetchUserDetail,
  fetchUserSessions,
  fetchUsers,
  setAccountFrozen,
  setUserFlag,
  type UserRow,
  type UserSession,
} from '../api/client';
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader } from '../components/ui/primitives';
import ConfirmDialog from '../components/ui/ConfirmDialog';

// 与后端 model.FlagNames 保持一致
const BITS = {
  suspended: 1,
  deleted: 2,
  banned: 4,
  spammer: 8,
} as const;

type FlagKey = keyof typeof BITS;

const flagMeta: Record<FlagKey, { label: string; tone: 'amber' | 'gray' | 'red' | 'indigo' }> = {
  suspended: { label: '已停用', tone: 'amber' },
  deleted: { label: '已注销', tone: 'gray' },
  banned: { label: '已封禁', tone: 'red' },
  spammer: { label: '营销号', tone: 'indigo' },
};

export default function Users() {
  const [keyword, setKeyword] = useState('');
  const [submittedQ, setSubmittedQ] = useState('');
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<{ user: UserRow; flag: FlagKey; on: boolean } | null>(
    null,
  );
  const [pendingFreeze, setPendingFreeze] = useState<{ user: UserRow; frozen: boolean } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['users', submittedQ, page],
    queryFn: () => fetchUsers(submittedQ, page),
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (!pending) {
        return Promise.reject(new Error('no target'));
      }
      return pending.on
        ? setUserFlag(pending.user.id, pending.flag)
        : clearUserFlag(pending.user.id, pending.flag);
    },
    onSuccess: () => {
      setPending(null);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const freezeMutation = useMutation({
    mutationFn: () => {
      if (!pendingFreeze) return Promise.reject(new Error('no target'));
      return setAccountFrozen(pendingFreeze.user.id, pendingFreeze.frozen);
    },
    onSuccess: () => {
      setPendingFreeze(null);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const [exporting, setExporting] = useState(false);

  return (
    <div>
      <PageHeader title="用户管理" desc="停用/封禁会写入 users.flags 位，所有操作记录审计日志" />

      <div className="mb-4 flex items-center justify-between gap-3">
        <form
          className="flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSubmittedQ(keyword.trim());
          }}
        >
          <Input
            className="max-w-xs"
            placeholder="按用户名搜索"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Button variant="primary" type="submit">
            搜索
          </Button>
        </form>
        <Button
          variant="secondary"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              await downloadCsv('/users/export.csv', submittedQ ? { q: submittedQ } : undefined);
            } finally {
              setExporting(false);
            }
          }}
        >
          {exporting ? '导出中…' : '导出 CSV'}
        </Button>
      </div>

      <Card>
        {error ? (
          <div className="p-6 text-sm text-red-600">{errText(error, '用户列表加载失败')}</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">用户 ID</th>
                <th className="th">用户名</th>
                <th className="th">状态</th>
                <th className="th text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td className="td text-gray-400" colSpan={4}>
                    加载中…
                  </td>
                </tr>
              ) : data && data.items.length > 0 ? (
                data.items.map((u) => (
                  <tr key={u.id}>
                    <td className="td font-mono text-xs text-gray-400">{u.id.slice(0, 12)}…</td>
                    <td className="td font-medium text-gray-900">{u.username}</td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1.5">
                        {u.disabled ? <Badge tone="red">登录已冻结</Badge> : null}
                        {(Object.keys(BITS) as FlagKey[]).map((f) =>
                          u.flags & BITS[f] ? (
                            <Badge key={f} tone={flagMeta[f].tone}>
                              {flagMeta[f].label}
                            </Badge>
                          ) : null,
                        )}
                        {u.flags === 0 && !u.disabled ? <Badge tone="green">正常</Badge> : null}
                      </div>
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setDetailId(u.id)}>
                          详情
                        </Button>
                        <Button
                          variant={u.disabled ? 'secondary' : 'danger'}
                          onClick={() => setPendingFreeze({ user: u, frozen: !u.disabled })}
                        >
                          {u.disabled ? '解冻登录' : '冻结登录'}
                        </Button>
                        <FlagToggle user={u} flag="suspended" onToggle={(on) => setPending({ user: u, flag: 'suspended', on })} />
                        <FlagToggle user={u} flag="banned" onToggle={(on) => setPending({ user: u, flag: 'banned', on })} />
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    <EmptyState text="没有匹配的用户" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      {data && data.total > 20 ? (
        <div className="mt-4 flex items-center justify-end gap-3 text-sm text-gray-500">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </Button>
          <span>
            第 {page} 页 / 共 {Math.ceil(data.total / 20)} 页
          </span>
          <Button
            variant="secondary"
            disabled={page >= Math.ceil(data.total / 20)}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!pending}
        title={pending?.on ? `确认${flagLabel(pending.flag)}该用户？` : '确认解除处置？'}
        description={
          pending ? (
            <span>
              用户：<b>{pending.user.username}</b>
              <br />
              处置类型：{flagLabel(pending.flag)}
              <br />
              该操作会立即生效并记录审计日志。
            </span>
          ) : null
        }
        confirmText={pending?.on ? `确认${flagLabel(pending?.flag)}` : '解除'}
        loading={mutation.isPending}
        onCancel={() => setPending(null)}
        onConfirm={() => mutation.mutate()}
      />
      {mutation.error ? (
        <div className="mt-3 text-sm text-red-600">{errText(mutation.error)}</div>
      ) : null}

      <ConfirmDialog
        open={!!pendingFreeze}
        title={pendingFreeze?.frozen ? '确认冻结该用户的登录？' : '确认解冻该用户的登录？'}
        description={
          pendingFreeze ? (
            <span>
              用户：<b>{pendingFreeze.user.username}</b>
              <br />
              {pendingFreeze.frozen
                ? '冻结后该账号立即被踢下线，且无法再登录（已有会话全部作废）。历史消息与数据保留，可随时解冻。'
                : '解冻后该账号可正常登录。'}
            </span>
          ) : null
        }
        confirmText={pendingFreeze?.frozen ? '确认冻结' : '确认解冻'}
        loading={freezeMutation.isPending}
        onCancel={() => setPendingFreeze(null)}
        onConfirm={() => freezeMutation.mutate()}
      />
      {freezeMutation.error ? (
        <div className="mt-3 text-sm text-red-600">{errText(freezeMutation.error)}</div>
      ) : null}

      <Modal open={!!detailId} title="用户详情" onClose={() => setDetailId(null)}>
        {detailId ? <UserDetailView userId={detailId} /> : null}
      </Modal>
    </div>
  );
}

function UserDetailView({ userId }: { userId: string }) {
  const detail = useQuery({
    queryKey: ['user-detail', userId],
    queryFn: () => fetchUserDetail(userId),
    enabled: !!userId,
  });

  const sessions = useQuery({
    queryKey: ['user-sessions', userId],
    queryFn: () => fetchUserSessions(userId),
    enabled: !!userId,
  });

  const queryClient = useQueryClient();
  const [pendingSession, setPendingSession] = useState<UserSession | null>(null);
  const sessionDel = useMutation({
    mutationFn: () => {
      if (!pendingSession) return Promise.reject(new Error('no target'));
      return deleteUserSession(userId, pendingSession.id);
    },
    onSuccess: () => {
      setPendingSession(null);
      void queryClient.invalidateQueries({ queryKey: ['user-sessions', userId] });
    },
  });

  const d = detail.data;
  if (detail.isLoading) return <div className="py-8 text-center text-sm text-gray-400">加载中…</div>;
  if (detail.error) return <div className="py-4 text-sm text-red-600">{errText(detail.error, '详情加载失败')}</div>;
  if (!d) return null;

  return (
    <div className="space-y-5 text-sm">
      <div className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1.5">
        <span className="text-gray-400">用户名</span>
        <span className="font-medium text-gray-900">{d.username}</span>
        <span className="text-gray-400">用户 ID</span>
        <span className="break-all font-mono text-xs text-gray-600">{d.id}</span>
        <span className="text-gray-400">注册时间</span>
        <span className="text-gray-700">
          {d.joined_at ? new Date(d.joined_at).toLocaleString('zh-CN', { hour12: false }) : '—'}
        </span>
        <span className="text-gray-400">个性签名</span>
        <span className="text-gray-700">{d.bio || '—'}</span>
        <span className="text-gray-400">状态</span>
        <span className="flex flex-wrap gap-1.5">
          {d.flags === 0 ? <Badge tone="green">正常</Badge> : null}
          {d.flags & 1 ? <Badge tone="amber">已停用</Badge> : null}
          {d.flags & 2 ? <Badge tone="gray">已注销</Badge> : null}
          {d.flags & 4 ? <Badge tone="red">已封禁</Badge> : null}
          {d.flags & 8 ? <Badge tone="indigo">营销号</Badge> : null}
        </span>
      </div>

      <div>
        <h4 className="mb-2 font-semibold text-gray-900">所在空间（{d.spaces.length}）</h4>
        {d.spaces.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {d.spaces.map((s) => (
              <Badge key={s.id} tone="indigo">{s.name}</Badge>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-400">未加入任何空间</div>
        )}
      </div>

      <div>
        <h4 className="mb-2 font-semibold text-gray-900">登录会话（{sessions.data?.total ?? '…'}）</h4>
        {sessions.isLoading ? (
          <div className="text-xs text-gray-400">加载中…</div>
        ) : sessions.error ? (
          <div className="text-xs text-red-500">{errText(sessions.error, '会话加载失败')}</div>
        ) : sessions.data && sessions.data.items.length > 0 ? (
          <ul className="space-y-2">
            {sessions.data.items.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                <div>
                  <div className="font-mono text-xs text-gray-400">{s.name || s.id.slice(0, 12)}…</div>
                  <div className="text-xs text-gray-500">
                    最后活跃 {s.last_seen ? new Date(s.last_seen).toLocaleString('zh-CN', { hour12: false }) : '—'}
                  </div>
                </div>
                <Button variant="danger" onClick={() => setPendingSession(s)}>
                  下线
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-xs text-gray-400">当前无活跃会话</div>
        )}
      </div>

      <div>
        <h4 className="mb-2 font-semibold text-gray-900">最近消息（{d.recent_messages.length}）</h4>
        {d.recent_messages.length > 0 ? (
          <ul className="space-y-2">
            {d.recent_messages.map((m) => (
              <li key={m.id} className="rounded-lg bg-gray-50 px-3 py-2">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span className="font-mono">
                    频道 {m.channel.slice(0, 12)}…
                    <button
                      className="ml-2 text-indigo-500 hover:underline"
                      onClick={() => window.open(`/messages?channel=${m.channel}`, '_blank')}
                    >
                      查看
                    </button>
                  </span>
                  <span>{m.at ? new Date(m.at).toLocaleString('zh-CN', { hour12: false }) : ''}</span>
                </div>
                <div className="mt-1 break-all text-gray-700">{m.content || '（无文字内容，可能为图片/附件）'}</div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-xs text-gray-400">暂无消息记录</div>
        )}
      </div>

      <ConfirmDialog
        open={!!pendingSession}
        title="确认下线该会话？"
        description={
          pendingSession ? (
            <span>
              会话：<b>{pendingSession.name || pendingSession.id}</b>
              <br />
              该设备将立即被踢下线，需重新登录。
            </span>
          ) : null
        }
        confirmText="确认下线"
        loading={sessionDel.isPending}
        onCancel={() => setPendingSession(null)}
        onConfirm={() => sessionDel.mutate()}
      />
      {sessionDel.error ? (
        <div className="mt-3 text-sm text-red-600">{errText(sessionDel.error, '下线失败')}</div>
      ) : null}
    </div>
  );
}

function FlagToggle({
  user,
  flag,
  onToggle,
}: {
  user: UserRow;
  flag: FlagKey;
  onToggle: (on: boolean) => void;
}) {
  const active = (user.flags & BITS[flag]) !== 0;
  return (
    <Button variant={active ? 'secondary' : 'danger'} onClick={() => onToggle(!active)}>
      {active ? `解除${flagLabel(flag)}` : flagLabel(flag)}
    </Button>
  );
}

function flagLabel(flag?: FlagKey): string {
  if (!flag) {
    return '';
  }
  return flag === 'suspended' ? '停用' : flag === 'banned' ? '封禁' : flagMeta[flag].label;
}
