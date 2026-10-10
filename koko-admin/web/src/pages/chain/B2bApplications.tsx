import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchB2bApplications,
  updateB2bApplicationStatus,
  errText,
  type B2bApplication,
  type B2bStatus,
} from '../../api/client';
import { Button, Card, PageHeader } from '../../components/ui/primitives';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const STATUS_META: Record<B2bStatus, { label: string; cls: string }> = {
  pending: { label: '待联系', cls: 'bg-gray-100 text-gray-600' },
  contacted: { label: '已联系', cls: 'bg-blue-50 text-blue-600' },
  signed: { label: '已签约', cls: 'bg-purple-50 text-purple-600' },
  active: { label: '已上线', cls: 'bg-green-50 text-green-600' },
  rejected: { label: '已拒绝', cls: 'bg-red-50 text-red-600' },
};

const ALL_STATUSES: B2bStatus[] = ['pending', 'contacted', 'signed', 'active', 'rejected'];

const fmtDate = (s: string) => {
  const d = new Date(s);
  return d.toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
};

export default function B2bApplications() {
  const qc = useQueryClient();
  const listQuery = useQuery({
    queryKey: ['b2b-applications'],
    queryFn: fetchB2bApplications,
    refetchOnWindowFocus: false,
  });

  const [pendingUpdate, setPendingUpdate] = useState<{ id: string; status: B2bStatus; company: string } | null>(null);
  const updateMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: B2bStatus }) =>
      updateB2bApplicationStatus(id, status),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['b2b-applications'] });
      setPendingUpdate(null);
    },
  });

  const items: B2bApplication[] = listQuery.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="B端合作申请"
        desc="nft.kokokongkong.com 公开合作申请的审核与状态流转"
      />

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            申请列表
            {items.length > 0 ? (
              <span className="ml-2 text-xs font-normal text-gray-400">共 {items.length} 条</span>
            ) : null}
          </h3>
          <Button variant="ghost" onClick={() => void listQuery.refetch()} disabled={listQuery.isFetching}>
            {listQuery.isFetching ? '刷新中…' : '刷新'}
          </Button>
        </div>

        {listQuery.error ? (
          <div className="text-sm text-red-600">{errText(listQuery.error, '列表加载失败')}</div>
        ) : items.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-400">暂无申请记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500">
                  <th className="px-2 py-2 font-medium">公司/机构</th>
                  <th className="px-2 py-2 font-medium">联系人</th>
                  <th className="px-2 py-2 font-medium">电话/微信</th>
                  <th className="px-2 py-2 font-medium">IP 类型</th>
                  <th className="px-2 py-2 font-medium">预期铸造量</th>
                  <th className="px-2 py-2 font-medium">作品描述</th>
                  <th className="px-2 py-2 font-medium">状态</th>
                  <th className="px-2 py-2 font-medium">提交时间</th>
                  <th className="px-2 py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const meta = STATUS_META[row.status] ?? STATUS_META.pending;
                  return (
                    <tr key={row.id} className="border-b border-gray-100 last:border-0 align-top">
                      <td className="px-2 py-2 font-medium text-gray-900">{row.company}</td>
                      <td className="px-2 py-2">{row.contact}</td>
                      <td className="px-2 py-2 text-xs">{row.phone}</td>
                      <td className="px-2 py-2">{row.ip_type}</td>
                      <td className="px-2 py-2">{row.expected_volume ? row.expected_volume.toLocaleString() : '-'}</td>
                      <td className="px-2 py-2 max-w-xs truncate" title={row.work_desc}>{row.work_desc}</td>
                      <td className="px-2 py-2">
                        <span className={`rounded px-1.5 py-0.5 text-xs ${meta.cls}`}>{meta.label}</span>
                      </td>
                      <td className="px-2 py-2 text-xs text-gray-500">{fmtDate(row.created_at)}</td>
                      <td className="px-2 py-2">
                        <select
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                          value={row.status}
                          onChange={(e) =>
                            setPendingUpdate({
                              id: row.id,
                              status: e.target.value as B2bStatus,
                              company: row.company,
                            })
                          }
                        >
                          {ALL_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_META[s].label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!pendingUpdate}
        title="确认变更申请状态？"
        description={
          pendingUpdate ? (
            <span>
              <b>{pendingUpdate.company}</b> → <b>{STATUS_META[pendingUpdate.status].label}</b>
            </span>
          ) : null
        }
        confirmText="确认"
        loading={updateMut.isPending}
        onCancel={() => setPendingUpdate(null)}
        onConfirm={() =>
          pendingUpdate &&
          updateMut.mutate({ id: pendingUpdate.id, status: pendingUpdate.status })
        }
      />
    </div>
  );
}
