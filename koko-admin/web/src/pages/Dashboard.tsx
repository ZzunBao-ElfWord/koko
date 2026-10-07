import { useQuery } from '@tanstack/react-query';
import { fetchStats, errText, type StatsOverview } from '../api/client';
import { Card, Badge, PageHeader } from '../components/ui/primitives';

const numberFmt = new Intl.NumberFormat('zh-CN');

export default function Dashboard() {
  const { data, isLoading, error } = useQuery<StatsOverview>({
    queryKey: ['stats-overview'],
    queryFn: fetchStats,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <PageSkeleton />;
  }
  if (error || !data) {
    return (
      <div>
        <PageHeader title="数据看板" />
        <Card className="p-6 text-sm text-red-600">{errText(error, '统计数据加载失败')}</Card>
      </div>
    );
  }

  const cards = [
    { label: '用户总数', value: data.totals.users },
    { label: '空间总数', value: data.totals.servers },
    { label: '频道总数', value: data.totals.channels },
    { label: '消息总数', value: data.totals.messages },
  ];

  return (
    <div>
      <PageHeader title="数据看板" desc="数据每分钟自动刷新" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5">
            <div className="text-sm text-gray-500">{c.label}</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">
              {numberFmt.format(c.value)}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">近 7 天新增用户</h2>
          <BarSeries data={data.new_users_7d} color="bg-indigo-500" />
        </Card>
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">近 7 天新增空间</h2>
          <BarSeries data={data.new_spaces_7d} color="bg-violet-500" />
        </Card>
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">近 7 天新增消息</h2>
          <BarSeries data={data.new_messages_7d} color="bg-emerald-500" />
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">近 7 天日活（DAU）</h2>
          <BarSeries data={data.dau_7d} color="bg-amber-500" />
        </Card>
        <Card className="col-span-2 p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">附件存储用量</h2>
          <StorageSummary
            totalCount={data.storage.total_count}
            totalBytes={data.storage.total_bytes}
            byTag={data.storage.by_tag}
          />
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">活跃频道 TOP5（近 7 天）</h2>
          <TopChannels data={data.top_channels_7d} />
        </Card>
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">最近注册用户</h2>
          <RecentUsers data={data.recent_users} />
        </Card>
      </div>
    </div>
  );
}

// 附件存储用量摘要：总量 + 按分类分桶
function StorageSummary({
  totalCount,
  totalBytes,
  byTag,
}: {
  totalCount: number;
  totalBytes: number;
  byTag: StatsOverview['storage']['by_tag'];
}) {
  const labels: Record<string, string> = {
    attachments: '消息附件',
    avatars: '头像',
    icons: '图标',
    banners: '横幅',
  };
  return (
    <div>
      <div className="flex items-baseline gap-4">
        <div className="text-2xl font-semibold text-gray-900">{fmtBytes(totalBytes)}</div>
        <div className="text-sm text-gray-500">共 {numberFmt.format(totalCount)} 个文件</div>
      </div>
      <div className="mt-4 space-y-2">
        {byTag.map((t) => (
          <div key={t.tag} className="flex items-center gap-3 text-sm">
            <Badge tone="gray">{labels[t.tag] ?? t.tag}</Badge>
            <span className="tabular-nums text-gray-600">{fmtBytes(t.bytes)}</span>
            <span className="text-xs text-gray-400">{numberFmt.format(t.count)} 个</span>
          </div>
        ))}
        {byTag.length === 0 ? <div className="text-sm text-gray-400">暂无文件</div> : null}
      </div>
    </div>
  );
}

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function TopChannels({ data }: { data: StatsOverview['top_channels_7d'] }) {
  if (data.length === 0) {
    return <div className="py-6 text-center text-sm text-gray-400">近 7 天暂无消息</div>;
  }
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="space-y-2.5">
      {data.map((ch) => (
        <div key={ch.channel_id} className="flex items-center gap-3">
          <div className="w-40 shrink-0 truncate text-sm text-gray-700" title={ch.channel}>
            {ch.server ? <span className="text-gray-400">{ch.server} / </span> : null}
            {ch.channel}
          </div>
          <div className="h-5 flex-1 rounded bg-gray-100">
            <div
              className="h-5 rounded bg-emerald-500"
              style={{ width: `${Math.max((ch.count / max) * 100, 3)}%` }}
            />
          </div>
          <div className="w-16 shrink-0 text-right text-xs tabular-nums text-gray-600">
            {numberFmt.format(ch.count)}
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentUsers({ data }: { data: StatsOverview['recent_users'] }) {
  if (data.length === 0) {
    return <div className="py-6 text-center text-sm text-gray-400">暂无数据</div>;
  }
  return (
    <ul className="divide-y divide-gray-100">
      {data.map((u) => (
        <li key={u.id} className="flex items-center justify-between py-2 text-sm">
          <span className="font-medium text-gray-900">{u.username || '(未命名用户)'}</span>
          <span className="text-xs text-gray-400">
            {u.joined_at ? new Date(u.joined_at).toLocaleString('zh-CN', { hour12: false }) : '—'}
          </span>
        </li>
      ))}
    </ul>
  );
}

function BarSeries({ data, color = 'bg-indigo-500' }: { data: StatsOverview['new_users_7d']; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.date} className="flex items-center gap-3">
          <div className="w-20 shrink-0 text-xs tabular-nums text-gray-400">
            {d.date.slice(5)}
          </div>
          <div className="h-5 flex-1 rounded bg-gray-100">
            <div
              className={`h-5 rounded ${color}`}
              style={{ width: `${Math.max(d.count === 0 ? 0 : 3, (d.count / max) * 100)}%` }}
            />
          </div>
          <div className="w-14 shrink-0 text-right text-xs tabular-nums text-gray-600">
            {numberFmt.format(d.count)}
          </div>
        </div>
      ))}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div>
      <PageHeader title="数据看板" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-28 animate-pulse p-5" />
        ))}
      </div>
    </div>
  );
}
