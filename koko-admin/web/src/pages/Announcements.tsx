import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAnnouncement,
  deleteAnnouncement,
  errText,
  fetchAnnouncements,
  setAnnouncementActive,
  updateAnnouncement,
  type Announcement,
} from '../api/client';
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, Textarea } from '../components/ui/primitives';
import ConfirmDialog from '../components/ui/ConfirmDialog';

// 运营公告板：公告的创建/编辑/启用/停用/删除。
// 触达说明：Stoat 无全局通知通道，公告目前仅作后台排期记录；
// 启用中的公告即为"当前生效"的运营口径，同一时刻最多一条。
export default function Announcements() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Announcement | null>(null);
  const [pendingToggle, setPendingToggle] = useState<Announcement | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['announcements'],
    queryFn: fetchAnnouncements,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['announcements'] });

  const createMutation = useMutation({
    mutationFn: () => createAnnouncement({ title: title.trim(), content: content.trim() }),
    onSuccess: () => {
      setTitle('');
      setContent('');
      void invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editing) return Promise.reject(new Error('no target'));
      return updateAnnouncement(editing.id, { title: editTitle.trim(), content: editContent.trim() });
    },
    onSuccess: () => {
      setEditing(null);
      void invalidate();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: () => {
      if (!pendingToggle) return Promise.reject(new Error('no target'));
      return setAnnouncementActive(pendingToggle.id, !pendingToggle.active);
    },
    onSuccess: () => {
      setPendingToggle(null);
      void invalidate();
    },
  });

  const delMutation = useMutation({
    mutationFn: () => {
      if (!pendingDelete) return Promise.reject(new Error('no target'));
      return deleteAnnouncement(pendingDelete.id);
    },
    onSuccess: () => {
      setPendingDelete(null);
      void invalidate();
    },
  });

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    createMutation.mutate();
  }

  function openEdit(a: Announcement) {
    setEditing(a);
    setEditTitle(a.title);
    setEditContent(a.content);
  }

  return (
    <div>
      <PageHeader title="运营公告" desc="公告排期管理；同一时刻最多一条处于启用状态，启用中的即当前生效口径" />

      <Card className="mb-4 p-4">
        <form onSubmit={onCreate} className="space-y-3">
          <Input
            placeholder="公告标题（最长 128 字符）"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            rows={3}
            placeholder="公告内容（最长 4096 字符）"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex justify-end">
            <Button variant="primary" type="submit" disabled={!title.trim() || !content.trim() || createMutation.isPending}>
              {createMutation.isPending ? '创建中…' : '新建公告'}
            </Button>
          </div>
        </form>
        {createMutation.error ? (
          <div className="mt-2 text-sm text-red-600">{errText(createMutation.error, '创建失败')}</div>
        ) : null}
      </Card>

      <Card>
        {error ? (
          <div className="p-6 text-sm text-red-600">{errText(error, '公告加载失败')}</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">状态</th>
                <th className="th">标题 / 内容</th>
                <th className="th">创建</th>
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
                data.items.map((a) => (
                  <tr key={a.id}>
                    <td className="td whitespace-nowrap">
                      {a.active ? <Badge tone="green">启用中</Badge> : <Badge tone="gray">已停用</Badge>}
                    </td>
                    <td className="td">
                      <div className="text-sm font-medium text-gray-900">{a.title}</div>
                      <div className="mt-0.5 max-w-lg truncate text-xs text-gray-500" title={a.content}>
                        {a.content}
                      </div>
                    </td>
                    <td className="td whitespace-nowrap text-xs text-gray-500">
                      <div>{new Date(a.created_at).toLocaleString('zh-CN', { hour12: false })}</div>
                      <div className="text-gray-400">by {a.created_by || '—'}</div>
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-3 text-sm">
                        <button className="text-indigo-600 hover:underline" onClick={() => openEdit(a)}>
                          编辑
                        </button>
                        <button
                          className={a.active ? 'text-amber-600 hover:underline' : 'text-green-600 hover:underline'}
                          onClick={() => setPendingToggle(a)}
                        >
                          {a.active ? '停用' : '启用'}
                        </button>
                        <button className="text-red-600 hover:underline" onClick={() => setPendingDelete(a)}>
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    <EmptyState text="暂无公告，先创建一条" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      {/* 编辑弹层 */}
      <Modal open={!!editing} title="编辑公告" onClose={() => setEditing(null)}>
        <div className="space-y-3">
          <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="公告标题" />
          <Textarea rows={5} value={editContent} onChange={(e) => setEditContent(e.target.value)} placeholder="公告内容" />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={!editTitle.trim() || !editContent.trim() || updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
            >
              {updateMutation.isPending ? '保存中…' : '保存'}
            </Button>
          </div>
          {updateMutation.error ? (
            <div className="text-sm text-red-600">{errText(updateMutation.error, '保存失败')}</div>
          ) : null}
        </div>
      </Modal>

      {/* 启用/停用确认（启用会影响全站生效口径，走高危确认） */}
      <ConfirmDialog
        open={!!pendingToggle}
        title={pendingToggle?.active ? '确认停用该公告？' : '确认启用该公告？'}
        description={
          pendingToggle ? (
            <span>
              公告：<b>{pendingToggle.title}</b>
              <br />
              {pendingToggle.active
                ? '停用后将不再有生效中的公告。'
                : '启用后将自动停用其他公告（同一时刻仅一条生效）。'}
            </span>
          ) : null
        }
        confirmText={pendingToggle?.active ? '确认停用' : '确认启用'}
        danger={!!pendingToggle?.active}
        loading={toggleMutation.isPending}
        onCancel={() => setPendingToggle(null)}
        onConfirm={() => toggleMutation.mutate()}
      />
      {toggleMutation.error ? (
        <div className="mt-3 text-sm text-red-600">{errText(toggleMutation.error, '状态切换失败')}</div>
      ) : null}

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!pendingDelete}
        title="确认删除该公告？"
        description={
          pendingDelete ? (
            <span>
              公告：<b>{pendingDelete.title}</b>
              <br />
              此操作无法撤销，删除记录审计日志。
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
