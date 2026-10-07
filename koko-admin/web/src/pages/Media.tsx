import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  deleteAttachment,
  errText,
  fetchAttachments,
  fetchAttachmentStats,
  fileUrl,
  type AttachmentRow,
} from '../api/client';
import { Badge, Button, Card, EmptyState, PageHeader } from '../components/ui/primitives';
import ConfirmDialog from '../components/ui/ConfirmDialog';

const tagTone: Record<string, 'indigo' | 'green' | 'amber' | 'gray'> = {
  attachments: 'indigo',
  avatars: 'green',
  icons: 'amber',
};

const tagLabels: Record<string, string> = {
  attachments: '消息附件',
  avatars: '头像',
  icons: '图标',
  banners: '横幅',
};

const typeGlyph: Record<string, string> = {
  Image: '🖼️',
  Video: '🎬',
  Audio: '🎵',
};

function tagLabel(tag: string): string {
  return tagLabels[tag] ?? tag;
}

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function Media() {
  const [tag, setTag] = useState('');
  const [submittedTag, setSubmittedTag] = useState('');
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<AttachmentRow | null>(null);
  const queryClient = useQueryClient();

  const stats = useQuery({ queryKey: ['attachment-stats'], queryFn: fetchAttachmentStats });

  const delMutation = useMutation({
    mutationFn: () => {
      if (!pendingDelete) return Promise.reject(new Error('no target'));
      return deleteAttachment(pendingDelete.id);
    },
    onSuccess: () => {
      setPendingDelete(null);
      void queryClient.invalidateQueries({ queryKey: ['attachments'] });
      void queryClient.invalidateQueries({ queryKey: ['attachment-stats'] });
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['attachments', submittedTag, page],
    queryFn: () => fetchAttachments(submittedTag, page),
  });

  function onFilter(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setSubmittedTag(tag);
  }

  return (
    <div>
      <PageHeader title="媒体文件" desc="Autumn 存储运营：用量统计、文件预览与消息定位" />

      {/* 存储用量统计卡 */}
      {stats.data ? (
        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="p-5">
            <div className="text-sm text-gray-500">文件总数</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">{stats.data.total_count}</div>
          </Card>
          <Card className="p-5">
            <div className="text-sm text-gray-500">存储占用</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">
              {fmtBytes(stats.data.total_bytes)}
            </div>
          </Card>
          {stats.data.by_tag.slice(0, 2).map((t) => (
            <Card key={t.tag} className="p-5">
              <div className="text-sm text-gray-500">{tagLabel(t.tag)}</div>
              <div className="mt-2 text-2xl font-semibold text-gray-900">{fmtBytes(t.bytes)}</div>
              <div className="mt-1 text-xs text-gray-400">{t.count} 个文件</div>
            </Card>
          ))}
        </div>
      ) : null}
      {stats.error ? (
        <div className="mb-4 text-sm text-red-600">{errText(stats.error, '存储统计加载失败')}</div>
      ) : null}

      <form onSubmit={onFilter} className="mb-4 flex gap-3">
        <select className="input max-w-40" value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">全部分类</option>
          <option value="attachments">消息附件</option>
          <option value="avatars">头像</option>
          <option value="icons">图标</option>
          <option value="banners">横幅</option>
        </select>
        <Button variant="primary" type="submit">
          筛选
        </Button>
      </form>

      <Card>
        {error ? (
          <div className="p-6 text-sm text-red-600">{errText(error, '媒体文件加载失败')}</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">文件</th>
                <th className="th">分类</th>
                <th className="th">大小</th>
                <th className="th">上传者</th>
                <th className="th">时间</th>
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
                data.items.map((row) => (
                  <tr key={row.id}>
                    <td className="td">
                      <div className="max-w-56 truncate font-medium text-gray-900" title={row.filename}>
                        {typeGlyph[row.meta_type] ?? '📄'} {row.filename}
                      </div>
                      <div className="font-mono text-xs text-gray-400">{row.content_type}</div>
                    </td>
                    <td className="td">
                      <Badge tone={tagTone[row.tag] ?? 'gray'}>{tagLabel(row.tag)}</Badge>
                    </td>
                    <td className="td text-gray-600">{fmtBytes(row.size)}</td>
                    <td className="td text-gray-600">
                      {row.uploader_name || row.uploader_id.slice(0, 10) + '…'}
                    </td>
                    <td className="td whitespace-nowrap text-xs text-gray-500">
                      {row.uploaded_at
                        ? new Date(row.uploaded_at).toLocaleString('zh-CN', { hour12: false })
                        : '—'}
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-3 text-sm">
                        <a
                          className="text-indigo-600 hover:underline"
                          href={fileUrl(row.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          预览
                        </a>
                        {row.channel_id ? (
                          <Link className="text-indigo-600 hover:underline" to={`/messages?channel=${row.channel_id}`}>
                            定位消息
                          </Link>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                        <button
                          className="text-red-600 hover:underline"
                          onClick={() => setPendingDelete(row)}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <EmptyState text="没有匹配的文件" />
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
        open={!!pendingDelete}
        title="确认删除该媒体文件？"
        description={
          pendingDelete ? (
            <span>
              文件：<b>{pendingDelete.filename}</b>（{fmtBytes(pendingDelete.size)}）
              <br />
              将同时清理存储对象与数据库索引；已被消息/头像引用的文件删除后客户端会显示内容失效。
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
