/* ===== mock.js · NFT Generator Mock Data + Canvas Drawing ===== */

// ===== 图层数据（模拟 HashLips Art Engine 的 layer/trait 结构） =====
const MOCK_LAYERS = [
  {
    id: 'background', name: '背景', icon: '🖼️', order: 0,
    traits: [
      { id: 'bg1', name: '深空蓝', weight: 30, color: '#1a1a3e', type: 'gradient', to: '#0d0d20' },
      { id: 'bg2', name: '暗金',   weight: 20, color: '#3d2c0e', type: 'gradient', to: '#1a1606' },
      { id: 'bg3', name: '纯黑',   weight: 15, color: '#0a0906', type: 'solid' },
      { id: 'bg4', name: '紫雾',   weight: 35, color: '#2a1a3e', type: 'gradient', to: '#150d20' },
    ]
  },
  {
    id: 'body', name: '身体', icon: '🧑', order: 1,
    traits: [
      { id: 'bd1', name: '暖金',   weight: 35, color: '#d4a96a' },
      { id: 'bd2', name: '古铜',   weight: 25, color: '#8b6914' },
      { id: 'bd3', name: '冷白',   weight: 20, color: '#e8dcc8' },
      { id: 'bd4', name: '蓝调',   weight: 12, color: '#5a7a9e' },
      { id: 'bd5', name: '翡翠',   weight: 8,  color: '#4a9b7a' },
    ]
  },
  {
    id: 'eyes', name: '眼睛', icon: '👀', order: 2,
    traits: [
      { id: 'ey1', name: '常规',   weight: 40, color: '#1a1a1a', shape: 'normal' },
      { id: 'ey2', name: '圆睁',   weight: 25, color: '#1a1a1a', shape: 'wide' },
      { id: 'ey3', name: '墨镜',   weight: 15, color: '#0a0a0a', shape: 'shades' },
      { id: 'ey4', name: '金瞳',   weight: 12, color: '#ffd700', shape: 'normal' },
      { id: 'ey5', name: '红光',   weight: 8,  color: '#ff3333', shape: 'glow' },
    ]
  },
  {
    id: 'mouth', name: '嘴巴', icon: '👄', order: 3,
    traits: [
      { id: 'mo1', name: '微笑',   weight: 35, color: '#c0392b', shape: 'smile' },
      { id: 'mo2', name: '严肃',   weight: 25, color: '#8b0000', shape: 'flat' },
      { id: 'mo3', name: '咧嘴',   weight: 20, color: '#e74c3c', shape: 'grin' },
      { id: 'mo4', name: '小胡子', weight: 12, color: '#3d2b1f', shape: 'mustache' },
      { id: 'mo5', name: '獠牙',   weight: 8,  color: '#ffffff', shape: 'fangs' },
    ]
  },
  {
    id: 'accessory', name: '配饰', icon: '🎩', order: 4,
    traits: [
      { id: 'ac1', name: '无',     weight: 30, color: 'transparent', shape: 'none' },
      { id: 'ac2', name: '皇冠',   weight: 20, color: '#ffd700', shape: 'crown' },
      { id: 'ac3', name: '帽子',   weight: 18, color: '#5a3d2a', shape: 'hat' },
      { id: 'ac4', name: '耳机',   weight: 15, color: '#333333', shape: 'headphones' },
      { id: 'ac5', name: '光环',   weight: 10, color: '#fff9c4', shape: 'halo' },
      { id: 'ac6', name: '角',     weight: 7,  color: '#8b4513', shape: 'horns' },
    ]
  },
];

// ===== Canvas 绘制函数 =====

function drawTrait(ctx, layerId, trait, size, frame = 0) {
  switch (layerId) {
    case 'background': drawBg(ctx, trait, size); break;
    case 'body':       drawBody(ctx, trait, size); break;
    case 'eyes':       drawEyes(ctx, trait, size, frame); break;
    case 'mouth':      drawMouth(ctx, trait, size, frame); break;
    case 'accessory':  drawAccessory(ctx, trait, size, frame); break;
  }
}

function drawBg(ctx, trait, size) {
  if (trait.type === 'gradient' && trait.to) {
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, trait.color);
    g.addColorStop(1, trait.to);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = trait.color;
  }
  ctx.fillRect(0, 0, size, size);
  // 星点装饰
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  for (let i = 0; i < 15; i++) {
    const x = (i * 137.5) % size;
    const y = (i * 73.3) % size;
    ctx.beginPath();
    ctx.arc(x, y, 1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBody(ctx, trait, size) {
  const cx = size / 2;
  ctx.fillStyle = trait.color;
  // 头
  ctx.beginPath();
  ctx.arc(cx, size * 0.4, size * 0.18, 0, Math.PI * 2);
  ctx.fill();
  // 身体
  ctx.beginPath();
  ctx.ellipse(cx, size * 0.72, size * 0.22, size * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // 脖子连接
  ctx.fillRect(cx - size * 0.05, size * 0.52, size * 0.1, size * 0.12);
}

function drawEyes(ctx, trait, size, frame = 0) {
  const cx = size / 2;
  const ey = size * 0.36;
  const off = size * 0.06;
  const blink = frame > 0 && (frame % 8 === 0); // 眨眼
  if (trait.shape === 'shades') {
    ctx.fillStyle = trait.color;
    ctx.fillRect(cx - off - size * 0.05, ey - size * 0.02, size * 0.1, size * 0.05);
    ctx.fillRect(cx + off - size * 0.05, ey - size * 0.02, size * 0.1, size * 0.05);
    ctx.fillRect(cx - off, ey, off * 2, size * 0.01);
    return;
  }
  const r = trait.shape === 'wide' ? size * 0.05 : size * 0.035;
  const eyeR = blink ? r * 0.2 : r;
  ctx.fillStyle = trait.color;
  if (trait.shape === 'glow') {
    ctx.shadowBlur = 8; ctx.shadowColor = trait.color;
  }
  ctx.beginPath(); ctx.arc(cx - off, ey, eyeR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + off, ey, eyeR, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
}

function drawMouth(ctx, trait, size, frame = 0) {
  const cx = size / 2;
  const my = size * 0.46;
  ctx.strokeStyle = trait.color;
  ctx.fillStyle = trait.color;
  ctx.lineWidth = size * 0.018;
  ctx.lineCap = 'round';
  const offset = Math.sin(frame * 0.5) * size * 0.005; // 微动
  switch (trait.shape) {
    case 'smile':
      ctx.beginPath(); ctx.arc(cx, my + offset, size * 0.05, 0.2, Math.PI - 0.2); ctx.stroke(); break;
    case 'grin':
      ctx.beginPath(); ctx.arc(cx, my + offset, size * 0.06, 0.1, Math.PI - 0.1); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillRect(cx - size * 0.04, my + size * 0.02, size * 0.08, size * 0.015); break;
    case 'flat':
      ctx.beginPath(); ctx.moveTo(cx - size * 0.04, my); ctx.lineTo(cx + size * 0.04, my); ctx.stroke(); break;
    case 'mustache':
      ctx.beginPath(); ctx.moveTo(cx - size * 0.04, my); ctx.lineTo(cx + size * 0.04, my); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx - size * 0.02, my - size * 0.01, size * 0.03, 0, Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + size * 0.02, my - size * 0.01, size * 0.03, 0, Math.PI); ctx.stroke(); break;
    case 'fangs':
      ctx.beginPath(); ctx.arc(cx, my, size * 0.05, 0, Math.PI); ctx.stroke();
      ctx.fillStyle = trait.color;
      ctx.beginPath(); ctx.moveTo(cx - size * 0.02, my + size * 0.02); ctx.lineTo(cx - size * 0.01, my + size * 0.05); ctx.lineTo(cx, my + size * 0.02); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, my + size * 0.02); ctx.lineTo(cx + size * 0.01, my + size * 0.05); ctx.lineTo(cx + size * 0.02, my + size * 0.02); ctx.fill(); break;
  }
}

function drawAccessory(ctx, trait, size, frame = 0) {
  const cx = size / 2;
  if (trait.shape === 'none') return;
  const bounce = Math.sin(frame * 0.3) * size * 0.008;
  ctx.fillStyle = trait.color;
  ctx.strokeStyle = trait.color;
  switch (trait.shape) {
    case 'crown':
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.12, size * 0.28 + bounce);
      ctx.lineTo(cx - size * 0.08, size * 0.2 + bounce);
      ctx.lineTo(cx - size * 0.04, size * 0.26 + bounce);
      ctx.lineTo(cx, size * 0.18 + bounce);
      ctx.lineTo(cx + size * 0.04, size * 0.26 + bounce);
      ctx.lineTo(cx + size * 0.08, size * 0.2 + bounce);
      ctx.lineTo(cx + size * 0.12, size * 0.28 + bounce);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff3333'; ctx.beginPath(); ctx.arc(cx, size * 0.22 + bounce, size * 0.015, 0, Math.PI * 2); ctx.fill();
      break;
    case 'hat':
      ctx.fillRect(cx - size * 0.14, size * 0.26 + bounce, size * 0.28, size * 0.02);
      ctx.fillRect(cx - size * 0.09, size * 0.16 + bounce, size * 0.18, size * 0.12);
      break;
    case 'headphones':
      ctx.lineWidth = size * 0.02;
      ctx.beginPath(); ctx.arc(cx, size * 0.3 + bounce, size * 0.16, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.fillRect(cx - size * 0.17, size * 0.28 + bounce, size * 0.04, size * 0.06);
      ctx.fillRect(cx + size * 0.13, size * 0.28 + bounce, size * 0.04, size * 0.06);
      break;
    case 'halo':
      ctx.lineWidth = size * 0.012;
      ctx.strokeStyle = trait.color;
      ctx.shadowBlur = 8; ctx.shadowColor = trait.color;
      ctx.beginPath(); ctx.ellipse(cx, size * 0.16 + bounce, size * 0.1, size * 0.025, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
      break;
    case 'horns':
      ctx.beginPath(); ctx.moveTo(cx - size * 0.06, size * 0.26); ctx.lineTo(cx - size * 0.1, size * 0.18 + bounce); ctx.lineTo(cx - size * 0.03, size * 0.24); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx + size * 0.06, size * 0.26); ctx.lineTo(cx + size * 0.1, size * 0.18 + bounce); ctx.lineTo(cx + size * 0.03, size * 0.24); ctx.fill();
      break;
  }
}

// ===== 完整组合绘制 =====
function drawComposition(ctx, layers, size = 350, frame = 0) {
  ctx.clearRect(0, 0, size, size);
  for (const layer of layers) {
    if (layer._selected) {
      drawTrait(ctx, layer.id, layer._selected, size, frame);
    }
  }
}

// ===== 加权随机选择 =====
function weightedPick(traits) {
  const total = traits.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of traits) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return traits[traits.length - 1];
}

function randomCombination(layers) {
  const combo = layers.map(l => ({ ...l, _selected: weightedPick(l.traits) }));
  return combo;
}

// ===== 稀有度计算 =====
function calcRarity(combo) {
  let score = 1;
  const parts = [];
  for (const layer of combo) {
    const t = layer._selected;
    const total = layer.traits.reduce((s, x) => s + x.weight, 0);
    const prob = t.weight / total;
    score *= prob;
    parts.push({ layer: layer.name, trait: t.name, prob });
  }
  const rarityScore = Math.round((1 / score) * 100) / 100;
  let tier = 'common';
  if (rarityScore > 50) tier = 'rare';
  if (rarityScore > 200) tier = 'epic';
  if (rarityScore > 500) tier = 'legendary';
  return { score: rarityScore, tier, parts };
}

// ===== GIF 动画帧 =====
function startGifAnimation(canvas, layers, size) {
  let frame = 0;
  const ctx = canvas.getContext('2d');
  function tick() {
    drawComposition(ctx, layers, size, frame);
    frame++;
    canvas._gifAnim = requestAnimationFrame(tick);
  }
  tick();
}

function stopGifAnimation(canvas) {
  if (canvas._gifAnim) cancelAnimationFrame(canvas._gifAnim);
}

// ===== 生成结果数据 =====
function generateResults(count, layers) {
  const results = [];
  for (let i = 0; i < count; i++) {
    const combo = randomCombination(layers);
    const rarity = calcRarity(combo);
    results.push({
      id: i + 1,
      combo,
      rarity,
    });
  }
  return results;
}
