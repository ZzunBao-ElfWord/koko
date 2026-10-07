import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errText, fetchSpaceBans } from '../api/client';
import { Badge, Button, Card, EmptyState, Input, PageHeader } from '../components/ui/primitives';
import ConfirmDialog from '../components/ui/ConfirmDialog';

interface SpaceRow {
  id: string;
  name: string;
  owner: string;
  channels: number;
  members: number;
}

interface SpacePage {
  items: SpaceRow[];
  total: number;
  page: number;
  page_size: number;
}

interface MemberRow {
  user_id: string;
  username: string;
  nickname: string;
  roles: any[];
}

interface MemberPage {
  items: MemberRow[];
  total: number;
  page: number;
  page_size: number;
}

interface ChannelRow {
  id: string;
  name: string;
  type: string;
}

type View = 'list' | 'detail';
type Tab = 'members' | 'channels' | 'bans';

export default function Spaces() {
  const [view, setView] = useState<View>('list');
  const [selectedSpace, setSelectedSpace] = useState<SpaceRow | null>(null);
  const [q, setQ] = useState('');
  const [submittedQ, setSubmittedQ] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery<SpacePage>({
    queryKey: ['spaces', submittedQ, page],
    queryFn: async () => {
      const { data } = await api.get<SpacePage>('/spaces', {
        params: { q: submittedQ, page, page_size: 20 },
      });
      return data;
    },
  });

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setSubmittedQ(q.trim());
  }

  function openSpace(s: SpaceRow) {
    setSelectedSpace(s);
    setView('detail');
  }

  if (view === 'detail' && selectedSpace) {
    return <SpaceDetail space={selectedSpace} onBack={() => setView('list')} />;
  }

  return (
    <div>
      <PageHeader title="空间管理" desc="管理空间成员、频道与封禁" />

      <form onSubmit={onSearch} className="mb-4 flex gap-3">
        <Input className="max-w-xs" placeholder="按空间名搜索" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button variant="primary" type="submit">
          搜索
        </Button>
      </form>

      <Card>
        {error ? (
          <div className="p-6 text-sm text-red-600">{errText(error, '空间列表加载失败')}</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">空间名</th>
                <th className="th">频道数</th>
                <th className="th">成员数</th>
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
                data.items.map((s) => (
                  <tr key={s.id} className="cursor-pointer hover:bg-gray-50" onClick={() => openSpace(s)}>
                    <td className="td font-medium text-gray-900">{s.name}</td>
                    <td className="td text-gray-600">{s.channels}</td>
                    <td className="td text-gray-600">{s.members}</td>
                    <td className="td text-right">
                      <Button variant="ghost" onClick={(e) => { e.stopPropagation(); openSpace(s); }}>
                        查看 →
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    <EmptyState text="没有匹配的空间" />
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
    </div>
  );
}

// ===== 空间详情（成员 + 频道 + 操作） =====
function SpaceDetail({ space, onBack }: { space: SpaceRow; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('members');

  return (
    <div>
      <button className="mb-3 text-sm text-indigo-600 hover:underline" onClick={onBack}>
        ← 返回空间列表
      </button>
      <PageHeader title={space.name} desc={`${space.channels} 个频道 / ${space.members} 位成员 / ID: ${space.id.slice(0, 12)}…`} />

      <div className="mb-4 flex gap-2">
        <Button variant={tab === 'members' ? 'primary' : 'secondary'} onClick={() => setTab('members')}>
          成员管理
        </Button>
        <Button variant={tab === 'channels' ? 'primary' : 'secondary'} onClick={() => setTab('channels')}>
          频道管理
        </Button>
        <Button variant={tab === 'bans' ? 'primary' : 'secondary'} onClick={() => setTab('bans')}>
          封禁列表
        </Button>
      </div>

      {tab === 'members' ? (
        <MembersPanel spaceId={space.id} />
      ) : tab === 'channels' ? (
        <ChannelsPanel spaceId={space.id} />
      ) : (
        <BansPanel spaceId={space.id} />
      )}
    </div>
  );
}

function MembersPanel({ spaceId }: { spaceId: string }) {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<null | { user: MemberRow; type: 'ban' | 'unban' | 'kick' }>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<MemberPage>({
    queryKey: ['space-members', spaceId, page],
    queryFn: async () => {
      const { data } = await api.get<MemberPage>(`/spaces/${spaceId}/members`, {
        params: { page, page_size: 20 },
      });
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (!action) return Promise.reject(new Error('no target'));
      // 封禁经 BFF 透传 {}（Delta 要求合法 JSON 体）
      if (action.type === 'ban') return api.put(`/spaces/${spaceId}/bans/${action.user.user_id}`, {});
      if (action.type === 'unban') return api.delete(`/spaces/${spaceId}/bans/${action.user.user_id}`);
      return api.delete(`/spaces/${spaceId}/members/${action.user.user_id}`);
    },
    onSuccess: () => {
      setAction(null);
      void queryClient.invalidateQueries({ queryKey: ['space-members'] });
      void queryClient.invalidateQueries({ queryKey: ['space-bans'] });
    },
  });

  const label = action ? (action.type === 'ban' ? '封禁' : action.type === 'unban' ? '解封' : '移出') : '';

  return (
    <Card>
      {error ? (
        <div className="p-6 text-sm text-red-600">{errText(error, '成员加载失败')}</div>
      ) : (
        <>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">用户</th>
                <th className="th">昵称</th>
                <th className="th">角色数</th>
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
                data.items.map((m) => (
                  <tr key={m.user_id}>
                    <td className="td">
                      <div className="font-medium text-gray-900">{m.username}</div>
                      <div className="font-mono text-xs text-gray-400">{m.user_id.slice(0, 12)}…</div>
                    </td>
                    <td className="td text-gray-600">{m.nickname || '—'}</td>
                    <td className="td">
                      <Badge tone="gray">{m.roles.length}</Badge>
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-2">
                        <Button variant="danger" onClick={() => setAction({ user: m, type: 'kick' })}>
                          移出
                        </Button>
                        <Button variant="secondary" onClick={() => setAction({ user: m, type: 'ban' })}>
                          封禁
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    <EmptyState text="暂无成员" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {data && data.total > 20 ? (
            <div className="flex items-center justify-end gap-3 p-4 text-sm text-gray-500">
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
        </>
      )}

      <ConfirmDialog
        open={!!action}
        title={`确认${label}该成员？`}
        description={
          action ? (
            <span>
              用户：<b>{action.user.username}</b>
              <br />
              操作后自动写入审计日志，不可撤销。
            </span>
          ) : null
        }
        confirmText={`确认${label}`}
        loading={mutation.isPending}
        onCancel={() => setAction(null)}
        onConfirm={() => mutation.mutate()}
      />
      {mutation.error ? <div className="p-3 text-sm text-red-600">{errText(mutation.error)}</div> : null}
    </Card>
  );
}

function ChannelsPanel({ spaceId }: { spaceId: string }) {
  const [pendingDelete, setPendingDelete] = useState<ChannelRow | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<{ items: ChannelRow[]; total: number }>({
    queryKey: ['space-channels', spaceId],
    queryFn: async () => {
      const { data } = await api.get(`/spaces/${spaceId}/channels`);
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!pendingDelete) return Promise.reject(new Error('no target'));
      return api.delete(`/channels/${pendingDelete.id}`);
    },
    onSuccess: () => {
      setPendingDelete(null);
      void queryClient.invalidateQueries({ queryKey: ['space-channels'] });
    },
  });

  return (
    <Card>
      {error ? (
        <div className="p-6 text-sm text-red-600">{errText(error, '频道加载失败')}</div>
      ) : (
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="th">频道名</th>
              <th className="th">类型</th>
              <th className="th">频道 ID</th>
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
              data.items.map((ch) => (
                <tr key={ch.id}>
                  <td className="td font-medium text-gray-900">{ch.name}</td>
                  <td className="td">
                    <Badge tone={ch.type === 'Text' ? 'green' : 'indigo'}>{ch.type}</Badge>
                  </td>
                  <td className="td font-mono text-xs text-gray-400">{ch.id.slice(0, 12)}…</td>
                  <td className="td text-right">
                    <Button variant="danger" onClick={() => setPendingDelete(ch)}>
                      删除
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>
                  <EmptyState text="暂无频道" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="确认删除该频道？"
        description={
          pendingDelete ? (
            <span>
              频道名：<b>{pendingDelete.name}</b>
              <br />
              类型：{pendingDelete.type}
              <br />
              删除后无法恢复，频道内消息也会被清理。
            </span>
          ) : null
        }
        confirmText="确认删除"
        loading={deleteMutation.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => deleteMutation.mutate()}
      />
      {deleteMutation.error ? (
        <div className="p-3 text-sm text-red-600">{errText(deleteMutation.error)}</div>
      ) : null}
    </Card>
  );
}

// ===== 封禁列表（server_bans 数据，支持解封） =====
function BansPanel({ spaceId }: { spaceId: string }) {
  const [pendingUnban, setPendingUnban] = useState<null | { user_id: string; username: string }>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['space-bans', spaceId],
    queryFn: () => fetchSpaceBans(spaceId),
  });

  const unbanMutation = useMutation({
    mutationFn: () => {
      if (!pendingUnban) return Promise.reject(new Error('no target'));
      return api.delete(`/spaces/${spaceId}/bans/${pendingUnban.user_id}`);
    },
    onSuccess: () => {
      setPendingUnban(null);
      void queryClient.invalidateQueries({ queryKey: ['space-bans'] });
    },
  });

  return (
    <Card>
      {error ? (
        <div className="p-6 text-sm text-red-600">{errText(error, '封禁列表加载失败')}</div>
      ) : (
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="th">用户</th>
              <th className="th">封禁原因</th>
              <th className="th text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td className="td text-gray-400" colSpan={3}>
                  加载中…
                </td>
              </tr>
            ) : data && data.items.length > 0 ? (
              data.items.map((b) => (
                <tr key={b.user_id}>
                  <td className="td">
                    <div className="font-medium text-gray-900">{b.username || '(已注销用户)'}</div>
                    <div className="font-mono text-xs text-gray-400">{b.user_id.slice(0, 12)}…</div>
                  </td>
                  <td className="td text-gray-600">{b.reason || '—'}</td>
                  <td className="td text-right">
                    <Button variant="secondary" onClick={() => setPendingUnban(b)}>
                      解封
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3}>
                  <EmptyState text="该空间暂无封禁记录" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <ConfirmDialog
        open={!!pendingUnban}
        title="确认解除该用户的封禁？"
        description={
          pendingUnban ? (
            <span>
              用户：<b>{pendingUnban.username || pendingUnban.user_id.slice(0, 12) + '…'}</b>
              <br />
              解封后可重新加入空间，操作写入审计日志。
            </span>
          ) : null
        }
        confirmText="确认解封"
        loading={unbanMutation.isPending}
        onCancel={() => setPendingUnban(null)}
        onConfirm={() => unbanMutation.mutate()}
      />
      {unbanMutation.error ? (
        <div className="p-3 text-sm text-red-600">{errText(unbanMutation.error)}</div>
      ) : null}
    </Card>
  );
}
