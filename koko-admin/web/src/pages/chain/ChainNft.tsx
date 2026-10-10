import { useState, type ChangeEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { chainApi, errText, type ChainResult } from '../../api/client';
import { Button, Card, Input, PageHeader } from '../../components/ui/primitives';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { ChainBanner, Field, ResultBox, useChainStatus, useIsSuper } from './chain-shared';

// NFT·数字藏品：B2B/UGC 铸造、转赠、暂停、查询
export default function ChainNft() {
  const { data: health } = useChainStatus();
  const isSuper = useIsSuper();
  const banner = health?.code === 200 ? health.data : undefined;

  // ===== 铸造 =====
  const emptyMint = { to: '', tokenId: '', tokenURI: '', authId: '', dciId: '', ipfsHash: '', workHash: '' };
  const [tab, setTab] = useState<'b2b' | 'ugc'>('b2b');
  const [mint, setMint] = useState(emptyMint);
  const [mintPending, setMintPending] = useState(false);
  const [mintResult, setMintResult] = useState<ChainResult | null>(null);
  const mintMutation = useMutation({
    mutationFn: () => {
      // tokenId 留空 = 服务端自动分配（totalSupply+1）
      const base: Record<string, string> = { to: mint.to, tokenURI: mint.tokenURI, ipfsHash: mint.ipfsHash, workHash: mint.workHash };
      if (mint.tokenId) base.tokenId = mint.tokenId;
      return tab === 'b2b'
        ? chainApi.post('nft/mint/b2b', { ...base, authId: mint.authId })
        : chainApi.post('nft/mint/ugc', { ...base, tokenId: mint.tokenId, dciId: mint.dciId, antTxHash: '' });
    },
    onSuccess: (r) => {
      setMintResult(r);
      setMintPending(false);
    },
    onError: () => setMintPending(false),
  });

  // ===== 转赠 =====
  const [transfer, setTransfer] = useState({ from: '', to: '', tokenId: '' });
  const [transferPending, setTransferPending] = useState(false);
  const [transferResult, setTransferResult] = useState<ChainResult | null>(null);
  const transferMutation = useMutation({
    mutationFn: () => chainApi.post('nft/transfer', null, { from: transfer.from, to: transfer.to, tokenId: transfer.tokenId }),
    onSuccess: (r) => {
      setTransferResult(r);
      setTransferPending(false);
    },
    onError: () => setTransferPending(false),
  });

  // ===== 查询 =====
  const [queryPath, setQueryPath] = useState('');
  const [queryResult, setQueryResult] = useState<ChainResult | null>(null);
  const query = useMutation({
    mutationFn: (path: string) => chainApi.get(path),
    onSuccess: (r) => setQueryResult(r),
  });

  const set = (k: keyof typeof mint) => (e: ChangeEvent<HTMLInputElement>) =>
    setMint({ ...mint, [k]: e.target.value });

  return (
    <div>
      <PageHeader title="NFT·数字藏品" desc="统一 NFT：B 端授权铸造（绑定 authId）与 UGC 确权铸造（绑定 DCI），支持转赠与暂停" />
      <ChainBanner health={banner} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex gap-1 border-b border-gray-200">
            {(['b2b', 'ugc'] as const).map((t) => (
              <button
                key={t}
                className={`px-3 py-2 text-sm font-medium ${tab === t ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setTab(t)}
              >
                {t === 'b2b' ? 'B端铸造' : 'UGC铸造'}
              </button>
            ))}
          </div>
          <div className="grid gap-3">
            <Field label="接收地址（to）">
              <Input value={mint.to} onChange={set('to')} placeholder="0x..." />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Token ID（B端铸造可留空自动分配）">
                <Input value={mint.tokenId} onChange={set('tokenId')} placeholder="留空自动分配" />
              </Field>
              <Field label={tab === 'b2b' ? '授权 ID（authId）' : 'DCI 编号（dciId）'}>
                <Input value={tab === 'b2b' ? mint.authId : mint.dciId} onChange={set(tab === 'b2b' ? 'authId' : 'dciId')} />
              </Field>
            </div>
            <Field label="Token URI（元数据地址，选填）">
              <Input value={mint.tokenURI} onChange={set('tokenURI')} placeholder="ipfs://..." />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="IPFS 哈希（选填）">
                <Input value={mint.ipfsHash} onChange={set('ipfsHash')} />
              </Field>
              <Field label="作品哈希（选填）">
                <Input value={mint.workHash} onChange={set('workHash')} />
              </Field>
            </div>
            <div>
              <Button
                variant="primary"
                disabled={
                  !isSuper ||
                  mintPending ||
                  !mint.to ||
                  !mint.tokenURI ||
                  (tab === 'b2b' ? !mint.authId : !mint.dciId || !mint.tokenId)
                }
                onClick={() => {
                  setMintPending(true);
                  mintMutation.mutate();
                }}
              >
                {mintPending ? '提交中…' : '铸造'}
              </Button>
              {!isSuper ? <span className="ml-3 text-xs text-gray-400">链上写操作仅超级管理员</span> : null}
            </div>
            <ResultBox result={mintResult} />
            {mintMutation.error ? <div className="text-sm text-red-600">{errText(mintMutation.error, '请求失败')}</div> : null}
          </div>
        </Card>

        <div className="grid gap-4">
          <Card>
            <h3 className="mb-4 text-sm font-semibold text-gray-900">转赠 NFT</h3>
            <div className="grid gap-3">
              <div className="grid grid-cols-3 gap-3">
                <Field label="转出地址">
                  <Input value={transfer.from} onChange={(e) => setTransfer({ ...transfer, from: e.target.value })} />
                </Field>
                <Field label="转入地址">
                  <Input value={transfer.to} onChange={(e) => setTransfer({ ...transfer, to: e.target.value })} />
                </Field>
                <Field label="Token ID">
                  <Input value={transfer.tokenId} onChange={(e) => setTransfer({ ...transfer, tokenId: e.target.value })} />
                </Field>
              </div>
              <div>
                <Button
                  variant="danger"
                  disabled={!isSuper || transferPending || !transfer.from || !transfer.to || !transfer.tokenId}
                  onClick={() => {
                    setTransferPending(true);
                    transferMutation.mutate();
                  }}
                >
                  {transferPending ? '提交中…' : '转赠'}
                </Button>
              </div>
              <ResultBox result={transferResult} />
              {transferMutation.error ? <div className="text-sm text-red-600">{errText(transferMutation.error, '请求失败')}</div> : null}
            </div>
          </Card>

          <Card>
            <h3 className="mb-4 text-sm font-semibold text-gray-900">查询（持有者 / 余额 / 元数据 / 权利证明 / 总量）</h3>
            <div className="flex gap-2">
              <Input value={queryPath} onChange={(e) => setQueryPath(e.target.value)} placeholder="如 nft/owner/10001" />
              <Button disabled={!queryPath || query.isPending} onClick={() => query.mutate(queryPath)}>查询</Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {['nft/totalSupply', 'nft/balance/', 'nft/uri/', 'nft/proof/'].map((p) => (
                <button key={p} className="rounded bg-gray-100 px-2 py-1 text-gray-500 hover:bg-gray-200" onClick={() => setQueryPath(p)}>
                  {p}
                </button>
              ))}
            </div>
            <ResultBox result={queryResult} />
            {query.error ? <div className="mt-3 text-sm text-red-600">{errText(query.error, '查询失败')}</div> : null}
          </Card>
        </div>
      </div>

      {/* 铸造确认 */}
      <ConfirmDialog
        open={mintPending}
        title={`确认${tab === 'b2b' ? 'B端' : 'UGC'}铸造？`}
        description={
          <span>
            接收地址：<b className="break-all">{mint.to}</b>
            <br />
            Token ID：{mint.tokenId}
            <br />
            {tab === 'b2b' ? `绑定授权：${mint.authId || '（未填）'}` : `绑定 DCI：${mint.dciId || '（未填）'}`}
          </span>
        }
        confirmText="确认铸造"
        loading={mintMutation.isPending}
        onCancel={() => setMintPending(false)}
        onConfirm={() => mintMutation.mutate()}
      />

      {/* 转赠确认 */}
      <ConfirmDialog
        open={transferPending}
        title="确认转赠 NFT？"
        description={
          <span>
            Token ID：<b>{transfer.tokenId}</b>
            <br />
            <span className="break-all">{transfer.from} → {transfer.to}</span>
            <br />
            受 TransferPolicy 冷却期与频次限制约束。
          </span>
        }
        confirmText="确认转赠"
        loading={transferMutation.isPending}
        onCancel={() => setTransferPending(false)}
        onConfirm={() => transferMutation.mutate()}
      />
    </div>
  );
}
