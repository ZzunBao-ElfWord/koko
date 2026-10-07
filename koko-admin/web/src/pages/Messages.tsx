import { useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  errText,
  fetchSpaceChannels,
  fetchSpacesLite,
  searchMessages,
  setUserFlag,
  type MessageSearchHit,
} from '../api/client';
import { Badge, Button, Card, EmptyState, Input, PageHeader } from '../components/ui/primitives';
import ConfirmDialog from '../components/ui/ConfirmDialog';

interface MessageRow {
  id: string;
  channel: string;
  author_id: string;
  author: string;
  content: string;
  hit_words: string[];
}

interface PageResult {
  items: MessageRow[];
  total: number;
  page: number;
  page_size: number;
  channel: string;
}

type Mode = 'channel' | 'global';

// 命中敏感词的内容高亮：把命中词片段标红加粗，其余原样。
function HitContent({ content, hitWords }: { content: string; hitWords: string[] }) {
  if (!content || hitWords.length === 0) {
    return <>{content || '—'}</>;
  }
  // 按命中词切分（不区分大小写，转义正则元字符）；词表极小，逐词 split 开销可忽略
  let parts: (string | ReactNode)[] = [content];
  hitWords.forEach((word, wi) => {
    const re = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const next: (string | ReactNode)[] = [];
    parts.forEach((p) => {
      if (typeof p !== 'string') {
        next.push(p);
        return;
      }
      p.split(re).forEach((seg, si) => {
        if (si % 2 === 1) {
          next.push(
            <mark key={`${wi}-${si}-${seg}`} className="rounded bg-red-100 px-0.5 font-semibold text-red-700">
              {seg}
            </mark>,
          );
        } else if (seg) {
          next.push(seg);
        }
      });
    });
    parts = next;
  });
  return <>{parts}</>;
}

// 处置目标：删消息 + 封禁作者 的联动信息
interface DisposeTarget {
  id: string;
  channel: string;
  author_id: string;
  author: string;
  content: string;
  hit_words: string[];
}

// 命中处置：先删消息（Delta 实时同步），再封禁作者（users.flags Banned 位）。
// 两步独立：消息删除成功但封禁失败时回报错误，由运营人工补封。
function useDisposeMutation(onDone: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (t: DisposeTarget) => {
      await api.delete(`/channels/${t.channel}/messages/${t.id}`);
      await setUserFlag(t.author_id, 'banned');
    },
    onSuccess: () => {
      onDone();
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
      void queryClient.invalidateQueries({ queryKey: ['message-search'] });
    },
  });
}

// 处置确认弹窗（频道浏览与全站搜索共用）
function DisposeConfirm({
  pending,
  loading,
  onCancel,
  onConfirm,
}: {
  pending: DisposeTarget | null;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={!!pending}
      title="确认处置这条违规消息？"
      description={
        pending ? (
          <span>
            作者：<b>{pending.author || pending.author_id || '—'}</b>
            <br />
            命中词：<b className="text-red-600">{pending.hit_words.join('、')}</b>
            <br />
            内容：<span className="text-xs">{pending.content?.slice(0, 80) || '—'}</span>
            <br />
            将依次执行：<b>删除消息</b>（全端实时同步）+ <b>封禁作者账号</b>。此操作无法撤销。
          </span>
        ) : null
      }
      confirmText="删除并封禁"
      loading={loading}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

export default function Messages() {
  // 深链支持：用户详情/媒体页"定位消息"带 ?channel= 跳转；
  // 敏感词库"查消息"带 ?mode=global&q= 直接进入全站搜索并预填关键字。
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(searchParams.get('mode') === 'global' ? 'global' : 'channel');

  return (
    <div>
      <PageHeader title="消息管理" desc="按频道浏览历史消息，或全站关键字搜索；删除通过 Delta API 实时同步所有客户端" />

      <div className="mb-4 flex gap-2">
        <Button variant={mode === 'channel' ? 'primary' : 'secondary'} onClick={() => setMode('channel')}>
          按频道浏览
        </Button>
        <Button variant={mode === 'global' ? 'primary' : 'secondary'} onClick={() => setMode('global')}>
          全站搜索
        </Button>
      </div>

      {mode === 'channel' ? (
        <ChannelBrowser initialChannel={searchParams.get('channel') ?? ''} />
      ) : (
        <GlobalSearch initialQ={searchParams.get('q') ?? ''} />
      )}
    </div>
  );
}

// ===== 按频道浏览（原逻辑） =====
function ChannelBrowser({ initialChannel }: { initialChannel: string }) {
  const [spaceId, setSpaceId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [manualChannel, setManualChannel] = useState(initialChannel);
  const [submittedChannel, setSubmittedChannel] = useState(initialChannel);
  const [searchQ, setSearchQ] = useState('');
  const [submittedQ, setSubmittedQ] = useState('');
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<MessageRow | null>(null);
  const [pendingDispose, setPendingDispose] = useState<MessageRow | null>(null);
  const queryClient = useQueryClient();

  const { data: spaces } = useQuery({
    queryKey: ['spaces-lite'],
    queryFn: fetchSpacesLite,
  });

  const { data: channels } = useQuery({
    queryKey: ['space-channels', spaceId],
    queryFn: () => fetchSpaceChannels(spaceId),
    enabled: !!spaceId,
  });

  const { data, isLoading, error } = useQuery<PageResult>({
    queryKey: ['messages', submittedChannel, submittedQ, page],
    queryFn: async () => {
      const { data } = await api.get<PageResult>(`/channels/${submittedChannel}/messages`, {
        params: { q: submittedQ, page, page_size: 20 },
      });
      return data;
    },
    enabled: !!submittedChannel,
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!pendingDelete) return Promise.reject(new Error('no target'));
      return api.delete(`/channels/${pendingDelete.channel}/messages/${pendingDelete.id}`);
    },
    onSuccess: () => {
      setPendingDelete(null);
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
      void queryClient.invalidateQueries({ queryKey: ['message-search'] });
    },
  });

  const disposeMutation = useDisposeMutation(() => setPendingDispose(null));

  const effectiveChannel = manualChannel.trim() || channelId;

  function onSearch(e: FormEvent) {
    e.preventDefault();
    if (!effectiveChannel) return;
    setPage(1);
    setSubmittedChannel(effectiveChannel);
    setSubmittedQ(searchQ.trim());
  }

  return (
    <>
      <Card className="mb-4 p-4">
        <form onSubmit={onSearch} className="flex flex-wrap items-center gap-3">
          <select
            className="input max-w-xs"
            value={spaceId}
            onChange={(e) => {
              setSpaceId(e.target.value);
              setChannelId('');
              setManualChannel('');
            }}
          >
            <option value="">选择空间…</option>
            {spaces?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            className="input max-w-xs"
            value={channelId}
            onChange={(e) => {
              setChannelId(e.target.value);
              setManualChannel('');
            }}
            disabled={!spaceId}
          >
            <option value="">{spaceId ? '选择频道…' : '请先选择空间'}</option>
            {channels?.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.type === 'Voice' ? '🔊 ' : '# '}
                {ch.name || ch.id}
              </option>
            ))}
          </select>

          <Input
            className="max-w-xs"
            placeholder="搜索消息内容（可选）"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
          <Button variant="primary" type="submit" disabled={!effectiveChannel}>
            查询
          </Button>
        </form>

        <details className="mt-3 text-sm text-gray-500" open={!!initialChannel}>
          <summary className="cursor-pointer select-none hover:text-gray-700">
            私信等不在空间内的频道？直接输入频道 ID
          </summary>
          <Input
            className="mt-2 max-w-xs font-mono text-xs"
            placeholder="频道 ID (ULID)"
            value={manualChannel}
            onChange={(e) => {
              setManualChannel(e.target.value);
              setChannelId('');
            }}
          />
        </details>
      </Card>

      {error ? (
        <Card className="p-6 text-sm text-red-600">{errText(error, '消息加载失败')}</Card>
      ) : !submittedChannel ? (
        <Card>
          <EmptyState text="选择空间和频道后开始浏览" />
        </Card>
      ) : (
        <Card>
          <div className="flex items-center justify-between px-4 py-2 text-xs text-gray-400">
            <span>
              频道 <span className="font-mono">{submittedChannel}</span>
              {submittedQ ? <span> · 关键词 “{submittedQ}”</span> : null}
            </span>
            <span>共 {data?.total ?? '…'} 条</span>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">消息 ID</th>
                <th className="th">作者</th>
                <th className="th">内容</th>
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
                  <tr key={m.id} className={m.hit_words?.length ? 'bg-red-50/60' : undefined}>
                    <td className="td font-mono text-xs text-gray-400">{m.id.slice(0, 12)}…</td>
                    <td className="td font-medium text-gray-900">{m.author}</td>
                    <td className="td max-w-lg">
                      <div className="truncate text-sm text-gray-700">
                        <HitContent content={m.content} hitWords={m.hit_words ?? []} />
                      </div>
                      {m.hit_words?.length ? (
                        <div className="mt-1">
                          <Badge tone="red">命中：{m.hit_words.join('、')}</Badge>
                        </div>
                      ) : null}
                    </td>
                    <td className="td text-right">
                      <div className="flex justify-end gap-2">
                        {m.hit_words?.length ? (
                          <Button variant="danger" onClick={() => setPendingDispose(m)}>
                            处置
                          </Button>
                        ) : null}
                        <Button variant="secondary" onClick={() => setPendingDelete(m)}>
                          删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    <EmptyState text="该频道暂无消息" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {data && data.total > 20 ? (
        <div className="mt-4 flex items-center justify-end gap-3 text-sm text-gray-500">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </Button>
          <span>
            第 {page} 页 / 共 {Math.ceil(data.total / 20)} 页
          </span>
          <Button variant="secondary" disabled={page >= Math.ceil(data.total / 20)} onClick={() => setPage((p) => p + 1)}>
            下一页
          </Button>
        </div>
      ) : null}

      <DeleteConfirm pending={pendingDelete} loading={deleteMutation.isPending} onCancel={() => setPendingDelete(null)} onConfirm={() => deleteMutation.mutate()} />
      <DisposeConfirm pending={pendingDispose} loading={disposeMutation.isPending} onCancel={() => setPendingDispose(null)} onConfirm={() => pendingDispose && disposeMutation.mutate(pendingDispose)} />
      {deleteMutation.error ? <div className="mt-3 text-sm text-red-600">{errText(deleteMutation.error)}</div> : null}
      {disposeMutation.error ? <div className="mt-3 text-sm text-red-600">{errText(disposeMutation.error, '处置失败（消息可能已删除，请人工补封作者）')}</div> : null}
    </>
  );
}

// ===== 全站搜索 =====
function GlobalSearch({ initialQ }: { initialQ: string }) {
  const [q, setQ] = useState(initialQ);
  const [author, setAuthor] = useState('');
  const [days, setDays] = useState(7);
  // 从敏感词库跳入时自动提交一次搜索
  const [submitted, setSubmitted] = useState<{ q: string; author: string; days: number } | null>(
    initialQ.trim().length >= 2 ? { q: initialQ.trim(), author: '', days: 7 } : null,
  );
  const [pendingDelete, setPendingDelete] = useState<MessageSearchHit | null>(null);
  const [pendingDispose, setPendingDispose] = useState<MessageSearchHit | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['message-search', submitted],
    queryFn: () =>
      searchMessages({
        q: submitted!.q,
        author: submitted!.author || undefined,
        days: submitted!.days,
      }),
    enabled: !!submitted,
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!pendingDelete) return Promise.reject(new Error('no target'));
      return api.delete(`/channels/${pendingDelete.channel}/messages/${pendingDelete.id}`);
    },
    onSuccess: () => {
      setPendingDelete(null);
      void queryClient.invalidateQueries({ queryKey: ['message-search'] });
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });

  const disposeMutation = useDisposeMutation(() => setPendingDispose(null));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const kw = q.trim();
    if (kw.length < 2) return;
    setSubmitted({ q: kw, author: author.trim(), days });
  }

  return (
    <>
      <Card className="mb-4 p-4">
        <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
          <Input
            className="max-w-sm"
            placeholder="消息关键字（至少 2 个字符，最长 32）"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Input
            className="max-w-56 font-mono text-xs"
            placeholder="作者用户 ID（可选，精确）"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
          <select className="input max-w-36" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>近 1 天</option>
            <option value={7}>近 7 天</option>
            <option value={30}>近 30 天</option>
            <option value={90}>近 90 天</option>
          </select>
          <Button variant="primary" type="submit" disabled={q.trim().length < 2 || isFetching}>
            搜索
          </Button>
        </form>
        <p className="mt-2 text-xs text-gray-400">
          全站范围检索（含私信与所有空间），单次最多返回 100 条最新匹配；结果过多时请缩小时间范围或加长关键字。
        </p>
      </Card>

      {error ? <Card className="p-6 text-sm text-red-600">{errText(error, '搜索失败')}</Card> : null}

      {data ? (
        <Card>
          <div className="flex items-center justify-between px-4 py-2 text-xs text-gray-400">
            <span>
              关键词 “{submitted?.q}” · 近 {data.days} 天 · {data.items.length} 条结果
            </span>
            {data.capped ? <Badge tone="amber">结果已达 100 条上限</Badge> : null}
          </div>
          {data.items.length === 0 ? (
            <EmptyState text="没有匹配的消息" />
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="th">空间 / 频道</th>
                  <th className="th">作者</th>
                  <th className="th">内容</th>
                  <th className="th">时间</th>
                  <th className="th text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td className="td text-gray-400" colSpan={5}>
                      加载中…
                    </td>
                  </tr>
                ) : (
                  data.items.map((m) => (
                    <tr key={m.id} className={m.hit_words?.length ? 'bg-red-50/60' : undefined}>
                      <td className="td">
                        <div className="text-sm font-medium text-gray-900">{m.server_name || '私信'}</div>
                        <div className="text-xs text-gray-400"># {m.channel_name || m.channel.slice(0, 10) + '…'}</div>
                      </td>
                      <td className="td text-sm text-gray-700">{m.author || '—'}</td>
                      <td className="td max-w-md">
                        <div className="truncate text-sm text-gray-700" title={m.content}>
                          <HitContent content={m.content} hitWords={m.hit_words ?? []} />
                        </div>
                        {m.hit_words?.length ? (
                          <div className="mt-1">
                            <Badge tone="red">命中：{m.hit_words.join('、')}</Badge>
                          </div>
                        ) : null}
                      </td>
                      <td className="td whitespace-nowrap text-xs text-gray-500">
                        {m.at ? new Date(m.at).toLocaleString('zh-CN', { hour12: false }) : '—'}
                      </td>
                      <td className="td">
                        <div className="flex justify-end gap-3 text-sm">
                          <a className="text-indigo-600 hover:underline" href={`/messages?channel=${m.channel}`}>
                            进频道
                          </a>
                          {m.hit_words?.length ? (
                            <button className="font-medium text-red-600 hover:underline" onClick={() => setPendingDispose(m)}>
                              处置
                            </button>
                          ) : null}
                          <button className="text-red-600 hover:underline" onClick={() => setPendingDelete(m)}>
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </Card>
      ) : !error ? (
        <Card>
          <EmptyState text="输入关键字后开始全站搜索" />
        </Card>
      ) : null}

      <DeleteConfirm
        pending={pendingDelete}
        loading={deleteMutation.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => deleteMutation.mutate()}
      />
      <DisposeConfirm
        pending={pendingDispose}
        loading={disposeMutation.isPending}
        onCancel={() => setPendingDispose(null)}
        onConfirm={() => pendingDispose && disposeMutation.mutate(pendingDispose)}
      />
      {deleteMutation.error ? <div className="mt-3 text-sm text-red-600">{errText(deleteMutation.error)}</div> : null}
      {disposeMutation.error ? <div className="mt-3 text-sm text-red-600">{errText(disposeMutation.error, '处置失败（消息可能已删除，请人工补封作者）')}</div> : null}
    </>
  );
}

// 删除确认弹窗（频道浏览与全站搜索共用）
function DeleteConfirm({
  pending,
  loading,
  onCancel,
  onConfirm,
}: {
  pending: { id: string; channel: string; author: string; content: string } | null;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={!!pending}
      title="确认删除这条消息？"
      description={
        pending ? (
          <span>
            作者：<b>{pending.author || '—'}</b>
            <br />
            内容：<span className="text-xs">{pending.content?.slice(0, 80) || '—'}</span>
            <br />
            此操作无法撤销，所有在线客户端会实时同步删除。
          </span>
        ) : null
      }
      confirmText="确认删除"
      loading={loading}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
