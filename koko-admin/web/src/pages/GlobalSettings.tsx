import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errText, fetchGlobalSettings, updateGlobalSettings } from '../api/client';
import { Button, Card, Input, PageHeader } from '../components/ui/primitives';

// 全局设置：社区头部卡片的统一跳转链接。
// 所有空间共用一个链接，App 点击头部卡片时读取；留空表示不跳转。
export default function GlobalSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['global-settings'],
    queryFn: fetchGlobalSettings,
  });
  const [link, setLink] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setLink(data.header_link ?? '');
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => updateGlobalSettings(link.trim()),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['global-settings'] });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    mutation.mutate();
  }

  const preview = /^https?:\/\//i.test(link.trim()) ? link.trim() : '';

  return (
    <div>
      <PageHeader
        title="全局设置"
        desc="社区头部卡片点击后统一跳转的链接，所有空间共用；留空则点击不跳转"
      />

      <Card className="max-w-2xl p-6">
        <form onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-gray-700" htmlFor="header-link">
            头部跳转链接
          </label>
          <Input
            id="header-link"
            className="mt-2 w-full"
            type="url"
            placeholder="https://example.com/activity"
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setSaved(false);
            }}
          />
          <p className="mt-2 text-xs text-gray-500">
            必须以 http:// 或 https:// 开头。App 点击时读取，最长缓存 5 分钟。
          </p>

          {error ? (
            <div className="mt-3 text-sm text-red-600">{errText(error, '读取全局设置失败')}</div>
          ) : null}
          {mutation.error ? (
            <div className="mt-3 text-sm text-red-600">{errText(mutation.error, '保存失败')}</div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" disabled={isLoading || mutation.isPending}>
              {mutation.isPending ? '保存中…' : '保存'}
            </Button>
            {preview ? (
              <a
                className="text-sm text-indigo-600 hover:text-indigo-700"
                href={preview}
                target="_blank"
                rel="noreferrer"
              >
                预览链接
              </a>
            ) : null}
            {saved ? <span className="text-sm text-green-600">已保存</span> : null}
          </div>
        </form>

        {data?.updated_at ? (
          <p className="mt-5 text-xs text-gray-400">
            最近更新：{new Date(data.updated_at).toLocaleString('zh-CN')}
            {data.updated_by ? ` · ${data.updated_by}` : ''}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
