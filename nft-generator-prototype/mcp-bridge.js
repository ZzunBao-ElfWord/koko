/* ===== mcp-bridge.js · MCP 工具声明层 =====
 * 用 @modelcontextprotocol/ext-apps SDK 把 api.js 的 6 个函数暴露为 MCP 工具。
 * 外部 Agent 通过 document.modelContext 调用这些工具。
 * 若 SDK 不可用，自动回退到 window.kokoMCP 自定义接口。
 */
(function () {
  'use strict';

  function registerMcpTools() {
    const mc = document.modelContext;
    if (!mc || typeof mc.registerTool !== 'function') {
      console.error('[mcp-bridge] document.modelContext 不可用，回退 window.kokoMCP');
      registerFallback();
      return;
    }

    // 1. fetch_layers
    mc.registerTool('fetch_layers', {
      description: '获取图层与配件配置',
      inputSchema: { type: 'object', properties: {}, required: [] }
    }, async () => {
      const layers = await fetchLayers();
      return { layers };
    });

    // 2. update_weight
    mc.registerTool('update_weight', {
      description: '更新某图层某配件的稀有度权重',
      inputSchema: {
        type: 'object',
        properties: {
          layerId: { type: 'string' },
          traitId: { type: 'string' },
          weight: { type: 'number', minimum: 0, maximum: 100 }
        },
        required: ['layerId', 'traitId', 'weight']
      }
    }, async (args) => {
      const { layerId, traitId, weight } = args;
      const res = await updateWeight(layerId, traitId, weight);
      return { ok: res.ok, layerId, traitId, weight };
    });

    // 3. generate_preview
    mc.registerTool('generate_preview', {
      description: '随机生成一个预览组合',
      inputSchema: {
        type: 'object',
        properties: {
          layers: { type: 'array', description: '可选，指定图层配置；不传则用当前配置' }
        }
      }
    }, async (args) => {
      const layers = args?.layers || await fetchLayers();
      const combo = await generatePreview(layers);
      return { combo };
    });

    // 4. generate_batch
    mc.registerTool('generate_batch', {
      description: '批量生成 NFT 系列',
      inputSchema: {
        type: 'object',
        properties: {
          count: { type: 'number', minimum: 1, maximum: 100000 },
          format: { type: 'string', enum: ['2d', 'gif'] },
          layers: { type: 'array' }
        },
        required: ['count', 'format']
      }
    }, async (args) => {
      const { count, format, layers: layerArg } = args;
      const layers = layerArg || await fetchLayers();
      const res = await generateBatch(count, format, layers);
      return { results: res.results, format: res.format };
    });

    // 5. download_nft
    mc.registerTool('download_nft', {
      description: '下载单个 NFT',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          format: { type: 'string', enum: ['png', 'gif'] }
        },
        required: ['id', 'format']
      }
    }, async (args) => {
      const res = await downloadNft(args.id, args.format);
      return res;
    });

    // 6. download_batch
    mc.registerTool('download_batch', {
      description: '批量下载 NFT',
      inputSchema: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'number' } },
          format: { type: 'string', enum: ['png', 'gif'] }
        },
        required: ['ids', 'format']
      }
    }, async (args) => {
      const res = await downloadBatch(args.ids, args.format);
      return res;
    });

    console.log('[mcp-bridge] 6 个 MCP 工具已注册 (标准方案)');
  }

  // 回退方案：window.kokoMCP 自定义接口（不依赖 ext-apps SDK）
  function registerFallback() {
    window.kokoMCP = {
      listTools: async () => ([
        { name: 'fetch_layers', description: '获取图层与配件配置', inputSchema: { type: 'object', properties: {} } },
        { name: 'update_weight', description: '更新稀有度权重', inputSchema: { type: 'object', properties: { layerId: { type: 'string' }, traitId: { type: 'string' }, weight: { type: 'number' } }, required: ['layerId', 'traitId', 'weight'] } },
        { name: 'generate_preview', description: '随机生成预览组合', inputSchema: { type: 'object', properties: { layers: { type: 'array' } } } },
        { name: 'generate_batch', description: '批量生成 NFT 系列', inputSchema: { type: 'object', properties: { count: { type: 'number' }, format: { type: 'string' }, layers: { type: 'array' } }, required: ['count', 'format'] } },
        { name: 'download_nft', description: '下载单个 NFT', inputSchema: { type: 'object', properties: { id: { type: 'number' }, format: { type: 'string' } }, required: ['id', 'format'] } },
        { name: 'download_batch', description: '批量下载 NFT', inputSchema: { type: 'object', properties: { ids: { type: 'array' }, format: { type: 'string' } }, required: ['ids', 'format'] } },
      ]),
      callTool: async (name, args) => {
        switch (name) {
          case 'fetch_layers': return { layers: await fetchLayers() };
          case 'update_weight': {
            const r = await updateWeight(args.layerId, args.traitId, args.weight);
            return { ok: r.ok, layerId: args.layerId, traitId: args.traitId, weight: args.weight };
          }
          case 'generate_preview': {
            const layers = args?.layers || await fetchLayers();
            return { combo: await generatePreview(layers) };
          }
          case 'generate_batch': {
            const layers = args?.layers || await fetchLayers();
            const r = await generateBatch(args.count, args.format, layers);
            return { results: r.results, format: r.format };
          }
          case 'download_nft': return await downloadNft(args.id, args.format);
          case 'download_batch': return await downloadBatch(args.ids, args.format);
          default: throw new Error(`未知工具: ${name}`);
        }
      }
    };
    console.log('[mcp-bridge] 6 个 MCP 工具已注册 (回退方案 window.kokoMCP)');
  }

  // 等 DOM + api.js 就绪后注册
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerMcpTools);
  } else {
    registerMcpTools();
  }
})();
