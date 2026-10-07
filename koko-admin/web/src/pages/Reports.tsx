import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  errText,
  fetchReports,
  setReportStatus,
  type SafetyReport,
} from '../api/client';
import { Badge, Button, Card, EmptyState, PageHeader, Textarea } from '../components/ui/primitives';
import ConfirmDialog from '../components/ui/ConfirmDialog';

type Tab = 'waiting' | 'resolved' | 'all';
type Action = 'Resolved' | 'Rejected';

const tabs: { key: Tab; label: string }[] = [
  { key: 'waiting', label: '待处理' },
  { key: 'resolved', label: '已处理' },
  { key: 'all', label: '全部' },
];

export default function Reports() {
  const [tab, setTab] = useState<Tab>('waiting');
  const [pending, setPending] = useState<{ report: SafetyReport; action: Action } | null>(null);
  const [note, setNote] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', tab],
    queryFn: () => fetchReports(tab),
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (!pending) {
        return Promise.reject(new Error('no target'));
      }
      return setReportStatus(pending.report.id, pending.action, note);
    },
    onSuccess: () => {
      setPending(null);
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });

  function openDialog(report: SafetyReport, action: Action) {
    setPending({ report, action });
    setNote('');
  }

  return (
    <div>
      <PageHeader title="举报队列" desc="数据来自 safety_reports 集合；处理结果同步写入审计日志" />

      <div className="mb-4 flex gap-2">
        {tabs.map((t) => (
          <Button key={t.key} variant={tab === t.key ? 'primary' : 'secondary'} onClick={() => setTab(t.key)}>
            {t.label}
          </Button>
        ))}
      </div>

      <Card>
        {error ? (
          <div className="p-6 text-sm text-red-600">{errText(error, '举报列表加载失败')}</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">举报 ID</th>
                <th className="th">理由</th>
                <th className="th">对象 ID</th>
                <th className="th">举报人</th>
                <th className="th">状态</th>
                <th className="th text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td className="td text-gray-400" colSpan={6}>
                    加载中…
                  </td>
                </tr>
              ) : data && data.items.length > 0 ? (
                data.items.map((r) => {
                  const st = statusOf(r.status);
                  return (
                    <tr key={r.id}>
                      <td className="td font-mono text-xs text-gray-400">{r.id.slice(0, 12)}…</td>
                      <td className="td max-w-xs">
                        <div className="truncate font-medium text-gray-900">{r.reason || '—'}</div>
                        {r.context ? (
                          <div className="truncate text-xs text-gray-400">{r.context}</div>
                        ) : null}
                      </td>
                      <td className="td font-mono text-xs text-gray-500">
                        {r.target_id ? r.target_id.slice(0, 12) + '…' : '—'}
                      </td>
                      <td className="td font-mono text-xs text-gray-500">
                        {r.author_id ? r.author_id.slice(0, 12) + '…' : '—'}
                      </td>
                      <td className="td">
                        {st === 'resolved' ? (
                          <Badge tone="green">已处理</Badge>
                        ) : st === 'rejected' ? (
                          <Badge tone="gray">已驳回</Badge>
                        ) : (
                          <Badge tone="amber">待处理</Badge>
                        )}
                      </td>
                      <td className="td text-right">
                        {st === 'waiting' ? (
                          <div className="flex justify-end gap-2">
                            <Button variant="primary" onClick={() => openDialog(r, 'Resolved')}>
                              处理
                            </Button>
                            <Button variant="secondary" onClick={() => openDialog(r, 'Rejected')}>
                              驳回
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6}>
                    <EmptyState text="暂无举报" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      <ConfirmDialog
        open={!!pending}
        title={pending?.action === 'Rejected' ? '驳回举报' : '处理举报'}
        description={
          pending ? (
            <span>
              举报 ID：<span className="font-mono">{pending.report.id}</span>
              <br />
              理由：{pending.report.reason || '—'}
              <br />
              {pending.action === 'Rejected'
                ? '驳回表示该举报无效或无需处置，将标记为已驳回。'
                : '标记为已处理表示已完成核查与处置。'}
            </span>
          ) : null
        }
        confirmText={pending?.action === 'Rejected' ? '确认驳回' : '标记为已处理'}
        danger={pending?.action === 'Rejected'}
        loading={mutation.isPending}
        onCancel={() => {
          setPending(null);
          setNote('');
        }}
        onConfirm={() => mutation.mutate()}
      >
        <label className="mb-1.5 block text-sm font-medium text-gray-700">处理备注（可选）</label>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：已核查，警告用户 / 已删除违规消息 / 与事实不符" />
      </ConfirmDialog>
      {mutation.error ? <div className="mt-3 text-sm text-red-600">{errText(mutation.error)}</div> : null}
    </div>
  );
}

// 兼容 status 为字符串或对象的不同版本（见 AGENTS.md 第 5 节）
// 返回 waiting / resolved / rejected 三态用于展示
function statusOf(status: unknown): 'waiting' | 'resolved' | 'rejected' {
  const s =
    typeof status === 'string'
      ? status
      : status && typeof status === 'object'
        ? Object.values(status as Record<string, unknown>).filter((v) => typeof v === 'string').join(' ')
        : '';
  const lower = s.toLowerCase();
  if (lower.includes('reject')) return 'rejected';
  if (lower.includes('resolv')) return 'resolved';
  return 'waiting';
}
