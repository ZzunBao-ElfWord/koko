import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { chainApi, type ChainHealth, type ChainResult, type ChainTx } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

// 链服务健康状态（30 秒自动刷新）；六模块页共用
export function useChainStatus() {
  return useQuery({
    queryKey: ['chain-health'],
    queryFn: () => chainApi.get<ChainHealth>('health'),
    refetchInterval: 30000,
  });
}

// 当前登录者是否超级管理员（链上写操作仅 super 放行，BFF 强制校验）
export function useIsSuper(): boolean {
  const { me } = useAuth();
  return me?.role === 'super_admin';
}

// 链未启用横幅：开发模式（fisco.enabled=false）下所有链上操作都会返回明确错误
export function ChainBanner({ health }: { health?: ChainHealth }) {
  if (!health) return null;
  if (!health.chainEnabled) {
    return (
      <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        链未启用（开发模式，未接入 FISCO BCOS 节点）：服务本身可用，链上操作将返回明确错误。建链后自动恢复。
      </div>
    );
  }
  if (!health.chainConnected) {
    return (
      <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
        链已启用但未连接节点：请检查服务器 FISCO BCOS 节点与证书配置。
      </div>
    );
  }
  return null;
}

// 表单字段助手：label + 控件一行
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  );
}

// 链调用结果展示：成功显示交易凭据，失败显示后端 message
export function ResultBox({ result }: { result: ChainResult | null }) {
  if (!result) return null;
  const ok = result.code === 200;
  const tx = result.data as ChainTx | null;
  return (
    <div
      className={`mt-3 rounded-md border px-4 py-3 text-sm ${
        ok ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-700'
      }`}
    >
      <div className="font-medium">{ok ? '操作成功' : `失败（code ${result.code}）`}</div>
      {result.message && result.message !== 'success' ? <div className="mt-1 break-all">{result.message}</div> : null}
      {ok && tx && (tx.txHash || tx.blockNumber) ? (
        <div className="mt-1 font-mono text-xs break-all">
          {tx.txHash ? <div>txHash: {tx.txHash}</div> : null}
          {tx.blockNumber ? <div>block: {tx.blockNumber}</div> : null}
        </div>
      ) : null}
      {ok && result.data != null && !tx ? (
        <pre className="mt-1 overflow-x-auto font-mono text-xs">{JSON.stringify(result.data, null, 2)}</pre>
      ) : null}
    </div>
  );
}

// 只读查询结果展示（单值或 JSON）
export function QueryBox({ value }: { value: unknown }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-md border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-xs text-gray-700">
      {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}
