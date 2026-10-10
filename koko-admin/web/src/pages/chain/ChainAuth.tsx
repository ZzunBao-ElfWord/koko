import { useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { chainApi, errText, type ChainResult } from '../../api/client';
import { Button, Card, Input, PageHeader } from '../../components/ui/primitives';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { ChainBanner, Field, ResultBox, useChainStatus, useIsSuper } from './chain-shared';

/** 授权列表行（后端 /auth/list 返回） */
interface AuthRow {
  authId: string;
  ipOwner: string;
  contractNo: string;
  workHash: string;
  startTime: string;
  endTime: string;
  scope: string;
  maxMint: string;
  mintedCount: string;
  revoked: boolean;
  valid: boolean;
}

const SCOPE_LABEL: Record<string, string> = { '0': '独家', '1': '非独家', '2': '可转授权' };

const fmtAddr = (a: string) =>
  a.startsWith('0x') && a.length > 12 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a || '-';

const fmtTs = (s: string) => {
  const n = Number(s);
  return n > 0 ? new Date(n * 1000).toLocaleDateString('zh-CN') : '-';
};

// NFT·B端授权：IP 授权上链登记 / 撤销 / 校验 / 详情（B2B 铸造的前置权利凭证）
export default function ChainAuth() {
  const { data: health } = useChainStatus();
  const isSuper = useIsSuper();
  const banner = health?.code === 200 ? health.data : undefined;
  const qc = useQueryClient();

  // 授权列表（链上全量遍历；dev 模式链未启用时仅显示错误）
  const listQuery = useQuery({
    queryKey: ['chain-auth-list'],
    queryFn: () => chainApi.get<AuthRow[]>('auth/list'),
    refetchOnWindowFocus: false,
  });

  // 登记表单（RegisterAuthRequest：startTime/endTime 为毫秒时间戳字符串）
  const [form, setForm] = useState({ ipOwner: '', contractNo: '', workHash: '', startTime: '', endTime: '', scope: '1', maxMint: '' });
  const [registerResult, setRegisterResult] = useState<ChainResult | null>(null);
  const register = useMutation({
    mutationFn: () =>
      chainApi.post('auth/register', {
        ipOwner: form.ipOwner,
        contractNo: form.contractNo,
        workHash: form.workHash,
        startTime: form.startTime,
        endTime: form.endTime,
        scope: Number(form.scope) || 1,
        maxMint: form.maxMint,
      }),
    onSuccess: (r) => {
      setRegisterResult(r);
      void qc.invalidateQueries({ queryKey: ['chain-auth-list'] });
    },
  });

  // 撤销
  const [revokeInput, setRevokeInput] = useState('');
  const [pendingRevoke, setPendingRevoke] = useState<string | null>(null);
  const [revokeResult, setRevokeResult] = useState<ChainResult | null>(null);
  const revoke = useMutation({
    mutationFn: () => chainApi.post(`auth/revoke/${pendingRevoke}`),
    onSuccess: (r) => {
      setRevokeResult(r);
      setPendingRevoke(null);
      void qc.invalidateQueries({ queryKey: ['chain-auth-list'] });
    },
  });

  // 查询
  const [queryId, setQueryId] = useState('');
  const [queryResult, setQueryResult] = useState<ChainResult | null>(null);
  const query = useMutation({
    mutationFn: () => chainApi.get(`auth/${queryId}`),
    onSuccess: (r) => setQueryResult(r),
  });

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div>
      <PageHeader title="NFT·B端授权" desc="IP 授权合同上链（授权即权利），B2B 铸造需绑定有效授权 ID" />
      <ChainBanner health={banner} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-gray-900">登记授权</h3>
          <div className="grid gap-3">
            <Field label="IP 持有方钱包地址（ipOwner）">
              <Input value={form.ipOwner} onChange={set('ipOwner')} placeholder="0x…（IP 方链上钱包地址）" />
            </Field>
            <Field label="合同编号（contractNo）">
              <Input value={form.contractNo} onChange={set('contractNo')} placeholder="如：IP-2026-001" />
            </Field>
            <Field label="作品哈希（workHash，选填）">
              <Input value={form.workHash} onChange={set('workHash')} placeholder="0x..." />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="生效时间（毫秒时间戳）">
                <Input value={form.startTime} onChange={set('startTime')} placeholder="1790000000000" />
              </Field>
              <Field label="到期时间（毫秒时间戳）">
                <Input value={form.endTime} onChange={set('endTime')} placeholder="1810000000000" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="授权范围（scope）">
                <Input value={form.scope} onChange={set('scope')} placeholder="1" />
              </Field>
              <Field label="最大铸造量（maxMint）">
                <Input value={form.maxMint} onChange={set('maxMint')} placeholder="10000" />
              </Field>
            </div>
            <div>
              <Button variant="primary" disabled={!isSuper || register.isPending} onClick={() => register.mutate()}>
                {register.isPending ? '提交中…' : '上链登记'}
              </Button>
              {!isSuper ? <span className="ml-3 text-xs text-gray-400">链上写操作仅超级管理员</span> : null}
            </div>
            <ResultBox result={registerResult} />
            {register.error ? <div className="text-sm text-red-600">{errText(register.error, '请求失败')}</div> : null}
          </div>
        </Card>

        <div className="grid gap-4">
          <Card>
            <h3 className="mb-4 text-sm font-semibold text-gray-900">查询授权详情</h3>
            <div className="flex gap-2">
              <Input value={queryId} onChange={(e) => setQueryId(e.target.value)} placeholder="授权 ID（authId）" />
              <Button disabled={!queryId || query.isPending} onClick={() => query.mutate()}>查询</Button>
            </div>
            <ResultBox result={queryResult} />
            {query.error ? <div className="mt-3 text-sm text-red-600">{errText(query.error, '查询失败')}</div> : null}
          </Card>

          <Card>
            <h3 className="mb-4 text-sm font-semibold text-gray-900">撤销授权</h3>
            <div className="flex gap-2">
              <Input value={revokeInput} onChange={(e) => setRevokeInput(e.target.value)} placeholder="授权 ID（authId）" />
              <Button variant="danger" disabled={!isSuper || !revokeInput} onClick={() => setPendingRevoke(revokeInput)}>
                撤销
              </Button>
            </div>
            <ResultBox result={revokeResult} />
            {revoke.error ? <div className="mt-3 text-sm text-red-600">{errText(revoke.error, '撤销失败')}</div> : null}
          </Card>
        </div>
      </div>

      {/* 授权列表（链上全量） */}
      <Card className="mt-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            授权列表
            {listQuery.data?.data ? (
              <span className="ml-2 text-xs font-normal text-gray-400">
                共 {listQuery.data.data.length} 条
              </span>
            ) : null}
          </h3>
          <Button variant="ghost" onClick={() => void listQuery.refetch()} disabled={listQuery.isFetching}>
            {listQuery.isFetching ? '刷新中…' : '刷新'}
          </Button>
        </div>
        {listQuery.error ? (
          <div className="text-sm text-red-600">{errText(listQuery.error, '列表加载失败（链服务未启用或不可达）')}</div>
        ) : !listQuery.data?.data?.length ? (
          <div className="py-6 text-center text-sm text-gray-400">暂无授权登记</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500">
                  <th className="px-2 py-2 font-medium">authId</th>
                  <th className="px-2 py-2 font-medium">合同编号</th>
                  <th className="px-2 py-2 font-medium">IP 方</th>
                  <th className="px-2 py-2 font-medium">范围</th>
                  <th className="px-2 py-2 font-medium">铸造进度</th>
                  <th className="px-2 py-2 font-medium">有效期</th>
                  <th className="px-2 py-2 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {listQuery.data.data.map((row) => (
                  <tr key={row.authId} className="border-b border-gray-100 last:border-0">
                    <td className="px-2 py-2 font-mono text-xs">#{row.authId}</td>
                    <td className="px-2 py-2">{row.contractNo}</td>
                    <td className="px-2 py-2 font-mono text-xs" title={row.ipOwner}>{fmtAddr(row.ipOwner)}</td>
                    <td className="px-2 py-2">{SCOPE_LABEL[row.scope] ?? row.scope}</td>
                    <td className="px-2 py-2">
                      <span className={Number(row.mintedCount) >= Number(row.maxMint) ? 'text-amber-600' : ''}>
                        {row.mintedCount} / {row.maxMint}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-500">
                      {fmtTs(row.startTime)} ~ {fmtTs(row.endTime)}
                    </td>
                    <td className="px-2 py-2">
                      {row.revoked ? (
                        <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-600">已撤销</span>
                      ) : row.valid ? (
                        <span className="rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-600">有效</span>
                      ) : (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">未生效/已过期/已满额</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!pendingRevoke}
        title="确认撤销该授权？"
        description={<span>授权 ID：<b>{pendingRevoke}</b><br />撤销后基于该授权的后续铸造将被拒绝，已铸 NFT 不受影响。</span>}
        confirmText="确认撤销"
        loading={revoke.isPending}
        onCancel={() => setPendingRevoke(null)}
        onConfirm={() => revoke.mutate()}
      />
    </div>
  );
}
