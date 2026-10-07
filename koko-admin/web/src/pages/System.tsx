import { useQuery } from '@tanstack/react-query';
import { errText, fetchSystemHealth } from '../api/client';
import { Badge, Button, Card, PageHeader } from '../components/ui/primitives';

// 服务健康：BFF 从容器网络内部并发探测各下游服务，
// 用于值班时快速定位"哪一环挂了"。每 30 秒自动刷新。
export default function System() {
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['system-health'],
    queryFn: fetchSystemHealth,
    refetchInterval: 30000,
  });

  const okCount = data?.items.filter((i) => i.ok).length ?? 0;
  const total = data?.items.length ?? 0;

  return (
    <div>
      <PageHeader title="服务健康" desc="从容器网络内部探测各下游服务连通性，30 秒自动刷新" />

      <div className="mb-4 flex items-center justify-between text-sm text-gray-500">
        <span>
          {data ? (
            <>
              共 {total} 个服务，
              {okCount === total ? (
                <span className="text-green-600">全部正常</span>
              ) : (
                <span className="text-red-600">{total - okCount} 个异常</span>
              )}
              {' · 最近检查 '}
              {new Date(dataUpdatedAt).toLocaleTimeString('zh-CN', { hour12: false })}
            </>
          ) : (
            '检查中…'
          )}
        </span>
        <Button variant="secondary" disabled={isFetching} onClick={() => void refetch()}>
          {isFetching ? '刷新中…' : '立即刷新'}
        </Button>
      </div>

      {error ? (
        <Card className="p-6 text-sm text-red-600">{errText(error, '健康检查失败')}</Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.items ?? []).map((s) => (
            <Card key={s.name} className="p-5">
              <div className="flex items-center justify-between">
                <div className="font-medium text-gray-900">{s.name}</div>
                {s.ok ? <Badge tone="green">正常</Badge> : <Badge tone="red">异常</Badge>}
              </div>
              <div className="mt-2 font-mono text-xs text-gray-400">{s.target}</div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-gray-500">延迟 {s.latency_ms} ms</span>
                {s.error ? (
                  <span className="max-w-40 truncate text-red-500" title={s.error}>
                    {s.error}
                  </span>
                ) : null}
              </div>
            </Card>
          ))}
          {isLoading ? (
            <Card className="p-5 text-sm text-gray-400">正在探测…</Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
