import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { chainApi, errText, type ChainResult } from '../../api/client';
import { Button, Card, Input, PageHeader } from '../../components/ui/primitives';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { ChainBanner, Field, ResultBox, useChainStatus, useIsSuper } from './chain-shared';

type SctAction = 'mint' | 'burn' | 'pay-fee';

const ACTION_LABEL: Record<SctAction, string> = {
  mint: '铸造 SCT',
  burn: '销毁 SCT',
  'pay-fee': '抵扣服务费',
};

// NFT·算力词元：SCT（SpriteComputeToken）铸造/销毁/抵扣，仅 AI 智能账户间流转
export default function ChainSct() {
  const { data: health } = useChainStatus();
  const isSuper = useIsSuper();
  const banner = health?.code === 200 ? health.data : undefined;

  // 写操作（三动作共用表单）
  const [action, setAction] = useState<SctAction>('mint');
  const [form, setForm] = useState({ aiAccount: '', amount: '' });
  const [writePending, setWritePending] = useState(false);
  const [writeResult, setWriteResult] = useState<ChainResult | null>(null);
  const write = useMutation({
    mutationFn: () =>
      chainApi.post(`sct/${action}`, null, { aiAccount: form.aiAccount, amount: form.amount }),
    onSuccess: (r) => {
      setWriteResult(r);
      setWritePending(false);
    },
    onError: () => setWritePending(false),
  });

  // 查询
  const [queryPath, setQueryPath] = useState('');
  const [queryResult, setQueryResult] = useState<ChainResult | null>(null);
  const query = useMutation({
    mutationFn: (path: string) => chainApi.get(path),
    onSuccess: (r) => setQueryResult(r),
  });

  return (
    <div>
      <PageHeader
        title="NFT·算力词元"
        desc="SCT 是 AI 算力资源计量单位（生产资料定性）：仅可在 AI 智能账户间转移，人类钱包不可接收，禁止交易"
      />
      <ChainBanner health={banner} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex gap-1 border-b border-gray-200">
            {(Object.keys(ACTION_LABEL) as SctAction[]).map((a) => (
              <button
                key={a}
                className={`px-3 py-2 text-sm font-medium ${action === a ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setAction(a)}
              >
                {ACTION_LABEL[a]}
              </button>
            ))}
          </div>
          <div className="grid gap-3">
            <Field label="AI 智能账户地址">
              <Input value={form.aiAccount} onChange={(e) => setForm({ ...form, aiAccount: e.target.value })} placeholder="0x..." />
            </Field>
            <Field label="数量（amount）">
              <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="1000" />
            </Field>
            <div>
              <Button
                variant={action === 'mint' ? 'primary' : 'danger'}
                disabled={!isSuper || writePending || !form.aiAccount || !form.amount}
                onClick={() => {
                  setWritePending(true);
                  write.mutate();
                }}
              >
                {writePending ? '提交中…' : ACTION_LABEL[action]}
              </Button>
              {!isSuper ? <span className="ml-3 text-xs text-gray-400">链上写操作仅超级管理员</span> : null}
            </div>
            <ResultBox result={writeResult} />
            {write.error ? <div className="text-sm text-red-600">{errText(write.error, '请求失败')}</div> : null}
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold text-gray-900">查询（余额 / AI 判定 / 总量）</h3>
          <div className="flex gap-2">
            <Input value={queryPath} onChange={(e) => setQueryPath(e.target.value)} placeholder="如 sct/balance/0x..." />
            <Button disabled={!queryPath || query.isPending} onClick={() => query.mutate(queryPath)}>查询</Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {['sct/totalSupply', 'sct/balance/', 'sct/is-ai/'].map((p) => (
              <button key={p} className="rounded bg-gray-100 px-2 py-1 text-gray-500 hover:bg-gray-200" onClick={() => setQueryPath(p)}>
                {p}
              </button>
            ))}
          </div>
          <ResultBox result={queryResult} />
          {query.error ? <div className="mt-3 text-sm text-red-600">{errText(query.error, '查询失败')}</div> : null}
        </Card>
      </div>

      <ConfirmDialog
        open={writePending}
        title={`确认${ACTION_LABEL[action]}？`}
        description={
          <span>
            AI 账户：<b className="break-all">{form.aiAccount}</b>
            <br />
            数量：{form.amount}
          </span>
        }
        confirmText="确认执行"
        loading={write.isPending}
        onCancel={() => setWritePending(false)}
        onConfirm={() => write.mutate()}
      />
    </div>
  );
}
