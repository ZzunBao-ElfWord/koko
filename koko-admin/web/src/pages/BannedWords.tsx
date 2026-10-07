import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  addBannedWord,
  errText,
  fetchBannedWords,
  fetchBannedWordStats,
  removeBannedWord,
  type BannedWord,
} from '../api/client';
import { Button, Card, EmptyState, Input, PageHeader } from '../components/ui/primitives';
import ConfirmDialog from '../components/ui/ConfirmDialog';

// 敏感词库：运营维护的违规关键词清单。
// 列表中"查消息"把词带入消息管理全站搜索，用于人工核查命中情况。
export default function BannedWords() {
  const [word, setWord] = useState('');
  const [pendingDelete, setPendingDelete] = useState<BannedWord | null>(null);
  const [statsDays, setStatsDays] = useState(7);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['banned-words'],
    queryFn: fetchBannedWords,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['banned-word-stats', statsDays],
    queryFn: () => fetchBannedWordStats(statsDays),
  });

  const addMutation = useMutation({
    mutationFn: () => addBannedWord(word.trim()),
    onSuccess: () => {
      setWord('');
      void queryClient.invalidateQueries({ queryKey: ['banned-words'] });
    },
  });

  const delMutation = useMutation({
    mutationFn: () => {
      if (!pendingDelete) return Promise.reject(new Error('no target'));
      return removeBannedWord(pendingDelete.id);
    },
    onSuccess: () => {
      setPendingDelete(null);
      void queryClient.invalidateQueries({ queryKey: ['banned-words'] });
    },
  });

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!word.trim()) return;
    addMutation.mutate();
  }

  return (
    <div>
      <PageHeader title="敏感词库" desc="违规关键词清单；配合消息管理的全站搜索进行人工核查" />

      {/* 命中统计 */}
      <Card className="mb-4 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">近 {statsDays} 天命中统计</h2>
          <select
            className="input w-auto text-sm"
            value={statsDays}
            onChange={(e) => setStatsDays(Number(e.target.value))}
          >
            <option value={3}>近 3 天</option>
            <option value={7}>近 7 天</option>
            <option value={14}>近 14 天</option>
            <option value={30}>近 30 天</option>
          </select>
        </div>
        {stats?.capped ? (
          <div className="mb-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
            已扫描最近 {stats.scanned.toLocaleString()} 条消息（达到统计上限），更早的命中未计入
          </div>
        ) : null}
        {statsLoading ? (
          <div className="py-6 text-center text-sm text-gray-400">统计中…</div>
        ) : stats && stats.items.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">敏感词</th>
                <th className="th">命中次数</th>
                <th className="th">涉及作者</th>
                <th className="th text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.items.map((s) => (
                <tr key={s.word}>
                  <td className="td font-medium text-gray-900">{s.word}</td>
                  <td className="td">
                    <span className="font-semibold text-red-600">{s.hits}</span>
                  </td>
                  <td className="td text-sm text-gray-500">{s.users} 人</td>
                  <td className="td text-right">
                    <Link
                      className="text-sm text-indigo-600 hover:underline"
                      to={`/messages?mode=global&q=${encodeURIComponent(s.word)}`}
                    >
                      查消息
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-6 text-center text-sm text-gray-400">近 {statsDays} 天无敏感词命中</div>
        )}
      </Card>

      <Card className="mb-4 p-4">
        <form onSubmit={onAdd} className="flex gap-3">
          <Input
            className="max-w-xs"
            placeholder="新增敏感词（最长 128 字符）"
            value={word}
            onChange={(e) => setWord(e.target.value)}
          />
          <Button variant="primary" type="submit" disabled={!word.trim() || addMutation.isPending}>
            {addMutation.isPending ? '添加中…' : '添加'}
          </Button>
        </form>
        {addMutation.error ? (
          <div className="mt-2 text-sm text-red-600">{errText(addMutation.error, '添加失败')}</div>
        ) : null}
      </Card>

      <Card>
        {error ? (
          <div className="p-6 text-sm text-red-600">{errText(error, '敏感词加载失败')}</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">敏感词</th>
                <th className="th">添加时间</th>
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
                data.items.map((w) => (
                  <tr key={w.id}>
                    <td className="td font-medium text-gray-900">{w.word}</td>
                    <td className="td whitespace-nowrap text-xs text-gray-500">
                      {w.created_at
                        ? new Date(w.created_at).toLocaleString('zh-CN', { hour12: false })
                        : '—'}
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-3 text-sm">
                        <Link
                          className="text-indigo-600 hover:underline"
                          to={`/messages?mode=global&q=${encodeURIComponent(w.word)}`}
                        >
                          查消息
                        </Link>
                        <button
                          className="text-red-600 hover:underline"
                          onClick={() => setPendingDelete(w)}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3}>
                    <EmptyState text="敏感词库为空，先添加第一条" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      <ConfirmDialog
        open={!!pendingDelete}
        title="确认删除该敏感词？"
        description={
          pendingDelete ? (
            <span>
              敏感词：<b>{pendingDelete.word}</b>
              <br />
              删除后不再出现在核查清单中，此操作记录审计日志。
            </span>
          ) : null
        }
        confirmText="确认删除"
        loading={delMutation.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => delMutation.mutate()}
      />
      {delMutation.error ? (
        <div className="mt-3 text-sm text-red-600">{errText(delMutation.error, '删除失败')}</div>
      ) : null}
    </div>
  );
}
