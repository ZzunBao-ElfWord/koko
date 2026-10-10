import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { chainApi, errText, type ChainResult } from '../../api/client';
import { Button, Card, Input, PageHeader } from '../../components/ui/primitives';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { ChainBanner, Field, ResultBox, useChainStatus, useIsSuper } from './chain-shared';

// NFT·实名认证：KYCRegistry 上链实名状态管理（链上合规强制项）
export default function ChainKyc() {
  const { data: health } = useChainStatus();
  const isSuper = useIsSuper();
  const banner = health?.code === 200 ? health.data : undefined;

  // 认证
  const [form, setForm] = useState({ user: '', proofHash: '' });
  const [verifyPending, setVerifyPending] = useState(false);
  const [verifyResult, setVerifyResult] = useState<ChainResult | null>(null);
  const verify = useMutation({
    mutationFn: () => chainApi.post('kyc/verify', null, { user: form.user, proofHash: form.proofHash }),
    onSuccess: (r) => {
      setVerifyResult(r);
      setVerifyPending(false);
    },
    onError: () => setVerifyPending(false),
  });

  // 撤销
  const [revokeInput, setRevokeInput] = useState('');
  const [pendingRevoke, setPendingRevoke] = useState<string | null>(null);
  const [revokeResult, setRevokeResult] = useState<ChainResult | null>(null);
  const revoke = useMutation({
    mutationFn: () => chainApi.post(`kyc/revoke/${pendingRevoke}`),
    onSuccess: (r) => {
      setRevokeResult(r);
      setPendingRevoke(null);
    },
  });

  // 查询
  const [queryUser, setQueryUser] = useState('');
  const [queryResult, setQueryResult] = useState<ChainResult | null>(null);
  const query = useMutation({
    mutationFn: () => chainApi.get<boolean>(`kyc/verified/${queryUser}`),
    onSuccess: (r) => setQueryResult(r),
  });

  return (
    <div>
      <PageHeader title="NFT·实名认证" desc="KYCRegistry 链上实名状态；TransferPolicy 流转前置校验依赖此状态" />
      <ChainBanner health={banner} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-gray-900">实名认证</h3>
          <div className="grid gap-3">
            <Field label="用户地址（user）">
              <Input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} placeholder="0x..." />
            </Field>
            <Field label="实名凭证哈希（proofHash）">
              <Input value={form.proofHash} onChange={(e) => setForm({ ...form, proofHash: e.target.value })} placeholder="0x..." />
            </Field>
            <div>
              <Button
                variant="primary"
                disabled={!isSuper || verifyPending || !form.user || !form.proofHash}
                onClick={() => {
                  setVerifyPending(true);
                  verify.mutate();
                }}
              >
                {verifyPending ? '提交中…' : '上链认证'}
              </Button>
              {!isSuper ? <span className="ml-3 text-xs text-gray-400">链上写操作仅超级管理员</span> : null}
            </div>
            <ResultBox result={verifyResult} />
            {verify.error ? <div className="text-sm text-red-600">{errText(verify.error, '请求失败')}</div> : null}
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold text-gray-900">查询实名状态</h3>
          <div className="flex gap-2">
            <Input value={queryUser} onChange={(e) => setQueryUser(e.target.value)} placeholder="用户地址" />
            <Button disabled={!queryUser || query.isPending} onClick={() => query.mutate()}>查询</Button>
          </div>
          <ResultBox result={queryResult} />
          {query.error ? <div className="mt-3 text-sm text-red-600">{errText(query.error, '查询失败')}</div> : null}
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold text-gray-900">撤销认证</h3>
          <div className="flex gap-2">
            <Input value={revokeInput} onChange={(e) => setRevokeInput(e.target.value)} placeholder="用户地址" />
            <Button variant="danger" disabled={!isSuper || !revokeInput} onClick={() => setPendingRevoke(revokeInput)}>
              撤销
            </Button>
          </div>
          <ResultBox result={revokeResult} />
          {revoke.error ? <div className="mt-3 text-sm text-red-600">{errText(revoke.error, '撤销失败')}</div> : null}
        </Card>
      </div>

      <ConfirmDialog
        open={verifyPending}
        title="确认上链实名认证？"
        description={<span>用户：<b className="break-all">{form.user}</b><br />凭证哈希：{form.proofHash}</span>}
        confirmText="确认认证"
        loading={verify.isPending}
        onCancel={() => setVerifyPending(false)}
        onConfirm={() => verify.mutate()}
      />

      <ConfirmDialog
        open={!!pendingRevoke}
        title="确认撤销该用户实名状态？"
        description={<span>用户：<b className="break-all">{pendingRevoke}</b><br />撤销后该用户将无法执行链上流转操作。</span>}
        confirmText="确认撤销"
        loading={revoke.isPending}
        onCancel={() => setPendingRevoke(null)}
        onConfirm={() => revoke.mutate()}
      />
    </div>
  );
}
