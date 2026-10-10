import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { chainApi, errText, type ChainResult } from '../../api/client';
import { Button, Card, Input, PageHeader, Textarea } from '../../components/ui/primitives';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { ChainBanner, Field, ResultBox, useChainStatus, useIsSuper } from './chain-shared';

type AiAction = 'create' | 'create-batch' | 'allocate' | 'execute' | 'price';

type AiField = { key: 'a' | 'b' | 'c'; label: string; placeholder: string; textarea?: boolean };

const ACTION_LABEL: Record<AiAction, { title: string; desc: string }> = {
  create: { title: '创建账户', desc: '为指定 controller 地址派生 AI 智能账户' },
  'create-batch': { title: '批量创建', desc: '每行一个 controller 地址' },
  allocate: { title: '分配 SCT', desc: '为 AI 账户分配算力词元预算' },
  execute: { title: '代执行', desc: 'Paymaster 代付 Gas，由 AI 账户执行目标合约调用' },
  price: { title: '操作定价', desc: '设置操作 selector 的服务定价' },
};

// NFT·AI账户：AIAccountFactory + Paymaster（AI 经济层自主运营）
export default function ChainAi() {
  const { data: health } = useChainStatus();
  const isSuper = useIsSuper();
  const banner = health?.code === 200 ? health.data : undefined;

  const [action, setAction] = useState<AiAction>('create');
  const [form, setForm] = useState({ a: '', b: '', c: '' });
  const [writePending, setWritePending] = useState(false);
  const [writeResult, setWriteResult] = useState<ChainResult | null>(null);

  const write = useMutation({
    mutationFn: () => {
      switch (action) {
        case 'create':
          return chainApi.post('ai/account/create', null, { controller: form.a });
        case 'create-batch':
          return chainApi.post(
            'ai/account/create-batch',
            form.a.split('\n').map((s) => s.trim()).filter(Boolean),
          );
        case 'allocate':
          return chainApi.post('ai/sct/allocate', null, { aiAccount: form.a, amount: form.b });
        case 'execute':
          return chainApi.post('ai/execute', null, { aiAccount: form.a, target: form.b, data: form.c });
        case 'price':
          return chainApi.post('ai/price', null, { selector: form.a, price: form.b });
      }
    },
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

  const FIELD_MAP: Record<AiAction, AiField[]> = {
    create: [{ key: 'a', label: 'Controller 地址', placeholder: '0x...' }],
    'create-batch': [{ key: 'a', label: 'Controller 地址列表', placeholder: '每行一个 0x...', textarea: true }],
    allocate: [
      { key: 'a', label: 'AI 账户地址', placeholder: '0x...' },
      { key: 'b', label: 'SCT 数量', placeholder: '1000' },
    ],
    execute: [
      { key: 'a', label: 'AI 账户地址', placeholder: '0x...' },
      { key: 'b', label: '目标合约地址', placeholder: '0x...' },
      { key: 'c', label: '调用数据（data）', placeholder: '0x...', textarea: true },
    ],
    price: [
      { key: 'a', label: '操作 selector', placeholder: 'mint(address,uint256)' },
      { key: 'b', label: '定价（price）', placeholder: '100' },
    ],
  };
  const fields = FIELD_MAP[action];

  return (
    <div>
      <PageHeader title="NFT·AI账户" desc="AI 智能账户（账户抽象）+ Paymaster 代付 Gas：AI 无感支付，自主铸造与运营" />
      <ChainBanner health={banner} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200">
            {(Object.keys(ACTION_LABEL) as AiAction[]).map((a) => (
              <button
                key={a}
                className={`px-3 py-2 text-sm font-medium ${action === a ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => {
                  setAction(a);
                  setForm({ a: '', b: '', c: '' });
                  setWriteResult(null);
                }}
              >
                {ACTION_LABEL[a].title}
              </button>
            ))}
          </div>
          <div className="mb-3 text-xs text-gray-400">{ACTION_LABEL[action].desc}</div>
          <div className="grid gap-3">
            {fields.map((f) => (
              <Field key={f.key} label={f.label}>
                {f.textarea ? (
                  <Textarea value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} />
                ) : (
                  <Input value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} />
                )}
              </Field>
            ))}
            <div>
              <Button
                variant="primary"
                disabled={!isSuper || writePending || fields.some((f) => !form[f.key].trim())}
                onClick={() => {
                  setWritePending(true);
                  write.mutate();
                }}
              >
                {writePending ? '提交中…' : ACTION_LABEL[action].title}
              </Button>
              {!isSuper ? <span className="ml-3 text-xs text-gray-400">链上写操作仅超级管理员</span> : null}
            </div>
            <ResultBox result={writeResult} />
            {write.error ? <div className="text-sm text-red-600">{errText(write.error, '请求失败')}</div> : null}
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold text-gray-900">查询（账户地址 / 账户总数）</h3>
          <div className="flex gap-2">
            <Input value={queryPath} onChange={(e) => setQueryPath(e.target.value)} placeholder="如 ai/account/count" />
            <Button disabled={!queryPath || query.isPending} onClick={() => query.mutate(queryPath)}>查询</Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {['ai/account/count', 'ai/account/'].map((p) => (
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
        title={`确认${ACTION_LABEL[action].title}？`}
        description={
          <span>
            {fields.map((f) => (
              <span key={f.key}>
                {f.label}：<b className="break-all">{form[f.key]}</b>
                <br />
              </span>
            ))}
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
