/* ===== api.js · API Stubs (未来对接后端时的替换点) =====
 * Phase 1：返回值结构化为 MCP 工具响应格式。
 * 后续对接 linksprite-backend 时，仅替换函数体内的网络调用部分。
 */

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * 获取图层配置
 * TODO: replace with GET /api/wallet/layers
 */
async function fetchLayers() {
  await delay(200);
  return JSON.parse(JSON.stringify(MOCK_LAYERS));
}

/**
 * 更新稀有度权重
 * TODO: replace with PATCH /api/wallet/layers/{layerId}/traits/{traitId} — body: { weight }
 */
async function updateWeight(layerId, traitId, weight) {
  await delay(100);
  return { ok: true, layerId, traitId, weight, updatedAt: Date.now() };
}

/**
 * 生成预览（随机组合）
 * TODO: replace with POST /api/nft/preview — body: { layers }
 */
async function generatePreview(layers) {
  await delay(300);
  const combo = randomCombination(layers);
  const rarity = calcRarity(combo);
  return { combo, rarity };
}

/**
 * 批量生成
 * TODO: replace with POST /api/nft/generate — body: { count, format, layers, weights }
 * onProgress 回调模拟进度
 */
async function generateBatch(count, format, layers, onProgress) {
  const total = count;
  const results = [];
  const batchSize = Math.max(1, Math.ceil(count / 20)); // 20 批
  for (let i = 0; i < 20; i++) {
    await delay(120 + Math.random() * 80);
    const batch = generateResults(Math.min(batchSize, total - results.length), layers);
    results.push(...batch);
    if (onProgress) onProgress(results.length / total, results.length, total);
    if (results.length >= total) break;
  }
  return { results, format, count: results.length, generatedAt: Date.now() };
}

/**
 * 下载单个 NFT
 * TODO: replace with GET /api/nft/{id}/download?format=png|gif
 */
async function downloadNft(id, format) {
  await delay(200);
  return { ok: true, id, format, url: `#download-${id}-${format}`, expiresAt: Date.now() + 3600000 };
}

/**
 * 批量下载
 * TODO: replace with POST /api/nft/download-batch — body: { ids, format }
 */
async function downloadBatch(ids, format) {
  await delay(500);
  return { ok: true, ids, format, url: '#batch-download', count: ids.length, expiresAt: Date.now() + 3600000 };
}
