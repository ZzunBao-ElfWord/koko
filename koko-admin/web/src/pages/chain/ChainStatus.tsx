import type { ReactNode } from 'react';
import { errText, type ChainHealth } from '../../api/client';
import { Badge, Card, EmptyState, PageHeader } from '../../components/ui/primitives';
import { ChainBanner, useChainStatus } from './chain-shared';

// NFT·链状态：linksprite-backend 服务与 FISCO BCOS 链连接状态总览
export default function ChainStatus() {
  const { data, isLoading, error, dataUpdatedAt } = useChainStatus();
  const h = data?.code === 200 ? data.data : undefined;

  return (
    <div>
      <PageHeader title="NFT·链状态" desc="连接精灵链后端服务与区块链连接状态（30 秒自动刷新）" />
      <ChainBanner health={h} />

      <Card>
        {error ? (
          <div className="p-6 text-sm text-red-600">{errText(error, '链状态加载失败')}</div>
        ) : isLoading ? (
          <EmptyState text="加载中…" />
        ) : h ? (
          <StatusGrid h={h} />
        ) : (
          <EmptyState text="链服务无响应" />
        )}
        <div className="mt-4 text-xs text-gray-400">
          更新于 {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleString('zh-CN', { hour12: false }) : '—'} ·
          上游 nft.kokokongkong.com
        </div>
      </Card>
    </div>
  );
}

function StatusGrid({ h }: { h: ChainHealth }) {
  const rows: { label: string; node: ReactNode }[] = [
    {
      label: '服务状态',
      node: <Badge tone={h.status === 'UP' ? 'green' : 'red'}>{h.status}</Badge>,
    },
    {
      label: '链功能（fisco.enabled）',
      node: <Badge tone={h.chainEnabled ? 'green' : 'amber'}>{h.chainEnabled ? '已启用' : '未启用'}</Badge>,
    },
    {
      label: '节点连接',
      node: <Badge tone={h.chainConnected ? 'green' : 'gray'}>{h.chainConnected ? '已连接' : '未连接'}</Badge>,
    },
    { label: '链 ID', node: <span className="font-mono text-sm">{h.chainId || '—'}</span> },
    { label: '群组', node: <span className="font-mono text-sm">{h.groupId || '—'}</span> },
    {
      label: '区块高度',
      node: <span className="font-mono text-sm">{h.blockNumber >= 0 ? h.blockNumber : '—'}</span>,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 p-6 md:grid-cols-3">
      {rows.map((r) => (
        <div key={r.label} className="rounded-md border border-gray-100 bg-gray-50/60 p-4">
          <div className="text-xs text-gray-400">{r.label}</div>
          <div className="mt-2">{r.node}</div>
        </div>
      ))}
    </div>
  );
}
