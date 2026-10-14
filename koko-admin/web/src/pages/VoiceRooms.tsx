import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteVoiceRoom,
  errText,
  fetchVoiceHistory,
  fetchVoiceParticipants,
  fetchVoiceRooms,
  kickVoiceParticipant,
  type VoiceHistoryItem,
  type VoiceParticipant,
  type VoiceRoom,
} from '../api/client';
import { Badge, Button, Card, EmptyState, Modal, PageHeader } from '../components/ui/primitives';
import ConfirmDialog from '../components/ui/ConfirmDialog';

// 语音房管理：实时列出声网 Agora 频道（频道名 = Stoat 频道 ID），
// 支持查看参与者、移出参与者、解散房间。30 秒自动刷新。
export default function VoiceRooms() {
  const [selected, setSelected] = useState<VoiceRoom | null>(null);
  const [pendingClose, setPendingClose] = useState<VoiceRoom | null>(null);
  const [pendingKick, setPendingKick] = useState<{ room: string; p: VoiceParticipant } | null>(null);
  const [tab, setTab] = useState<'rooms' | 'history'>('rooms');
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['voice-rooms'],
    queryFn: fetchVoiceRooms,
    refetchInterval: 30000,
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['voice-history'],
    queryFn: () => fetchVoiceHistory(),
    enabled: tab === 'history',
  });

  const closeMutation = useMutation({
    mutationFn: () => {
      if (!pendingClose) return Promise.reject(new Error('no target'));
      return deleteVoiceRoom(pendingClose.room);
    },
    onSuccess: () => {
      setPendingClose(null);
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: ['voice-rooms'] });
    },
  });

  const kickMutation = useMutation({
    mutationFn: () => {
      if (!pendingKick) return Promise.reject(new Error('no target'));
      return kickVoiceParticipant(pendingKick.room, pendingKick.p.identity);
    },
    onSuccess: () => {
      setPendingKick(null);
      void queryClient.invalidateQueries({ queryKey: ['voice-rooms'] });
      void queryClient.invalidateQueries({ queryKey: ['voice-participants'] });
    },
  });

  return (
    <div>
      <PageHeader title="语音房" desc="实时语音房状态（30 秒自动刷新）；解散/移出操作即时生效" />

      {/* Tab 切换 */}
      <div className="mb-4 flex gap-1 border-b border-gray-200">
        <button
          className={`px-4 py-2 text-sm font-medium ${tab === 'rooms' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => setTab('rooms')}
        >
          实时房间
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium ${tab === 'history' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => setTab('history')}
        >
          操作历史
        </button>
      </div>

      {tab === 'rooms' ? (
        <Card>
        {error ? (
          <div className="p-6 text-sm text-red-600">{errText(error, '语音房加载失败')}</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">空间 / 频道</th>
                <th className="th">房间 ID</th>
                <th className="th">人数</th>
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
                data.items.map((r) => (
                  <tr key={r.room}>
                    <td className="td">
                      <div className="text-sm font-medium text-gray-900">{r.server_name || '—'}</div>
                      <div className="text-xs text-gray-400">🔊 {r.channel_name || '未关联频道'}</div>
                    </td>
                    <td className="td font-mono text-xs text-gray-400">{r.room.slice(0, 14)}…</td>
                    <td className="td">
                      {r.num_participants > 0 ? (
                        <Badge tone="green">{r.num_participants} 人</Badge>
                      ) : (
                        <Badge tone="gray">空房</Badge>
                      )}
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-3 text-sm">
                        <button className="text-indigo-600 hover:underline" onClick={() => setSelected(r)}>
                          参与者
                        </button>
                        <button className="text-red-600 hover:underline" onClick={() => setPendingClose(r)}>
                          解散
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    <EmptyState text="当前没有进行中的语音房" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        </Card>
      ) : (
        <Card>
          {historyLoading ? (
            <div className="py-8 text-center text-sm text-gray-400">加载中…</div>
          ) : history && history.items.length > 0 ? (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="th">操作人</th>
                  <th className="th">操作</th>
                  <th className="th">目标</th>
                  <th className="th">状态</th>
                  <th className="th">IP</th>
                  <th className="th">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.items.map((h: VoiceHistoryItem, i: number) => (
                  <tr key={h._id || i}>
                    <td className="td text-sm font-medium text-gray-900">{h.actor || '—'}</td>
                    <td className="td text-sm">
                      {h.method === 'DELETE' ? (
                        <span className="text-red-600">解散/移出</span>
                      ) : (
                        h.method || '—'
                      )}
                    </td>
                    <td className="td font-mono text-xs text-gray-400">
                      {h.path?.replace('/api/v1/voice/rooms/', '').slice(0, 20) || '—'}
                    </td>
                    <td className="td">
                      <Badge tone={h.status && h.status < 400 ? 'green' : 'red'}>{h.status || '—'}</Badge>
                    </td>
                    <td className="td text-xs text-gray-500">{h.ip || '—'}</td>
                    <td className="td whitespace-nowrap text-xs text-gray-500">
                      {h.created_at ? new Date(h.created_at).toLocaleString('zh-CN', { hour12: false }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState text="暂无语音房操作记录" />
          )}
        </Card>
      )}

      {/* 参与者弹层 */}
      <ParticipantsModal
        room={selected}
        onClose={() => setSelected(null)}
        onKick={(p) => setPendingKick({ room: selected!.room, p })}
      />

      {/* 解散确认 */}
      <ConfirmDialog
        open={!!pendingClose}
        title="确认解散该语音房？"
        description={
          pendingClose ? (
            <span>
              频道：<b>{pendingClose.channel_name || pendingClose.room}</b>
              {pendingClose.server_name ? (
                <>
                  <br />
                  所属空间：{pendingClose.server_name}
                </>
              ) : null}
              <br />
              房内 {pendingClose.num_participants} 名参与者将被强制断开，且 1 分钟内无法重新加入；频道本身不受影响，之后可重新发起语音。
            </span>
          ) : null
        }
        confirmText="确认解散"
        loading={closeMutation.isPending}
        onCancel={() => setPendingClose(null)}
        onConfirm={() => closeMutation.mutate()}
      />
      {closeMutation.error ? (
        <div className="mt-3 text-sm text-red-600">{errText(closeMutation.error, '解散失败')}</div>
      ) : null}

      {/* 移出确认 */}
      <ConfirmDialog
        open={!!pendingKick}
        title="确认移出该参与者？"
        description={
          pendingKick ? (
            <span>
              用户：<b>{pendingKick.p.username || `声网用户 ${pendingKick.p.identity}`}</b>
              <br />
              该用户将被移出当前语音房（不封禁账号，可重新加入）。
            </span>
          ) : null
        }
        confirmText="确认移出"
        loading={kickMutation.isPending}
        onCancel={() => setPendingKick(null)}
        onConfirm={() => kickMutation.mutate()}
      />
      {kickMutation.error ? (
        <div className="mt-3 text-sm text-red-600">{errText(kickMutation.error, '移出失败')}</div>
      ) : null}
    </div>
  );
}

// 参与者列表弹层（10 秒自动刷新，便于实时观察处置效果）
function ParticipantsModal({
  room,
  onClose,
  onKick,
}: {
  room: VoiceRoom | null;
  onClose: () => void;
  onKick: (p: VoiceParticipant) => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['voice-participants', room?.room],
    queryFn: () => fetchVoiceParticipants(room!.room),
    enabled: !!room,
    refetchInterval: 10000,
  });

  return (
    <Modal open={!!room} title={`参与者 · ${room?.channel_name || ''}`} onClose={onClose}>
      {error ? (
        <div className="text-sm text-red-600">{errText(error, '参与者加载失败')}</div>
      ) : isLoading ? (
        <div className="py-8 text-center text-sm text-gray-400">加载中…</div>
      ) : data && data.items.length > 0 ? (
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="th">用户</th>
              <th className="th">角色</th>
              <th className="th text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.items.map((p) => (
              <tr key={p.identity}>
                <td className="td">
                  <div className="text-sm font-medium text-gray-900">
                    {p.username || `声网用户 ${p.identity}`}
                  </div>
                  <div className="font-mono text-xs text-gray-400">
                    {p.user_id ? `${p.user_id.slice(0, 14)}…` : `uid ${p.identity}（未关联账号）`}
                  </div>
                </td>
                <td className="td">
                  <Badge tone={p.role === 'broadcaster' ? 'green' : 'gray'}>
                    {p.role === 'broadcaster' ? '主播' : '听众'}
                  </Badge>
                </td>
                <td className="td text-right">
                  <Button variant="danger" onClick={() => onKick(p)}>
                    移出
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState text="房间内暂无参与者" />
      )}
    </Modal>
  );
}
