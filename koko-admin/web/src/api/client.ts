import axios from 'axios';

// ===== 类型（与 BFF 接口契约保持一致；一个接口一个类型，见 AGENTS.md） =====

export type Role = 'super_admin' | 'moderator' | 'operator';

export interface Me {
  id: string;
  username: string;
  role: Role;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface UserRow {
  id: string;
  username: string;
  flags: number;
  disabled?: boolean; // accounts.disabled：登录冻结（强拦截）
}

export interface SafetyReport {
  id: string;
  author_id?: string;
  target_id?: string;
  reason?: string;
  context?: string;
  notes?: string;
  status?: unknown;
}

export interface AuditEntry {
  id: string;
  actor_id: string;
  actor_name: string;
  role: string;
  method: string;
  path: string;
  status: number;
  ip: string;
  ua: string;
  created_at: string;
}

export interface AdminAccount {
  id: string;
  username: string;
  role: Role;
  created_at: string;
}

interface DayCount {
  date: string;
  count: number;
}

export interface StatsOverview {
  totals: {
    users: number;
    servers: number;
    channels: number;
    messages: number;
  };
  new_users_7d: DayCount[];
  new_spaces_7d: DayCount[];
  new_messages_7d: DayCount[];
  dau_7d: DayCount[];
  storage: {
    total_count: number;
    total_bytes: number;
    by_tag: { tag: string; count: number; bytes: number }[];
  };
  top_channels_7d: TopChannel[];
  recent_users: RecentUser[];
  generated_at: string;
}

export interface TopChannel {
  channel_id: string;
  channel: string;
  server: string;
  count: number;
}

export interface RecentUser {
  id: string;
  username: string;
  joined_at: string;
}

export interface SpaceLite {
  id: string;
  name: string;
}

export interface ChannelLite {
  id: string;
  name: string;
  type: string;
}

// 空间封禁记录（server_bans：_id 复合键 {server,user} + reason）
export interface BanRow {
  user_id: string;
  username: string;
  reason: string;
}

// 媒体文件（Autumn 落库：附件/头像/图标等，url 为相对路径）
export interface AttachmentRow {
  id: string;
  tag: string;
  filename: string;
  content_type: string;
  meta_type: string;
  size: number;
  uploaded_at: number; // 毫秒时间戳
  uploader_id: string;
  uploader_name: string;
  used_type: string;
  used_id: string;
  channel_id: string; // 非空表示可定位到消息
  url: string;
}

export interface AttachmentStats {
  total_count: number;
  total_bytes: number;
  by_tag: { tag: string; count: number; bytes: number }[];
}

// 敏感词（后台自有库 koko_admin.banned_words）
export interface BannedWord {
  id: string;
  word: string;
  created_at: string;
  created_by: string;
}

// 用户登录会话（revolt.sessions；token 永不下发前端）
export interface UserSession {
  id: string;
  name: string;
  last_seen: string;
}

// 下游服务健康探测结果
export interface ServiceHealth {
  name: string;
  target: string;
  ok: boolean;
  latency_ms: number;
  error?: string;
}

export interface UserDetail {
  id: string;
  username: string;
  flags: number;
  bio?: string;
  joined_at: string;
  spaces: SpaceLite[];
  recent_messages: {
    id: string;
    channel: string;
    content: string;
    at: string;
  }[];
}

// ===== HTTP 客户端（全应用唯一出口，禁止绕过） =====

export const TOKEN_KEY = 'koko_admin_token';

export const api = axios.create({
  baseURL: '/api/v1',
  timeout: 20000,
});

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});

// 401 统一回到登录页（登录页自身的 401 由页面自行处理提示）
let redirecting = false;
api.interceptors.response.use(
  (resp) => resp,
  (err) => {
    if (err?.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      if (!redirecting) {
        redirecting = true;
        localStorage.removeItem(TOKEN_KEY);
        window.location.assign('/login');
      }
    }
    return Promise.reject(err);
  },
);

// 统一错误文案
export function errText(err: unknown, fallback = '请求失败'): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { message?: string } | undefined)?.message ?? fallback;
  }
  return fallback;
}

// ===== 接口封装 =====

export async function login(username: string, password: Promise<string> | string) {
  const pwd = await password;
  const { data } = await api.post('/auth/login', { username, password: pwd });
  localStorage.setItem(TOKEN_KEY, data.token as string);
  return data.user as Me;
}

export const fetchMe = async (): Promise<Me> => (await api.get<Me>('/auth/me')).data;

export const fetchStats = async (): Promise<StatsOverview> =>
  (await api.get<StatsOverview>('/stats/overview')).data;

export async function fetchUsers(q: string, page: number): Promise<Page<UserRow>> {
  const { data } = await api.get<Page<UserRow>>('/users', {
    params: { q, page, page_size: 20 },
  });
  return data;
}

export function setUserFlag(id: string, flag: string) {
  return api.post(`/users/${id}/flag`, { flag });
}

export function clearUserFlag(id: string, flag: string) {
  return api.delete(`/users/${id}/flag/${flag}`);
}

// 冻结/解冻登录：写 accounts.disabled，冻结时后端同步删除全部会话
export function setAccountFrozen(id: string, frozen: boolean) {
  return api.post(`/users/${id}/freeze`, { frozen });
}

// 全站消息搜索结果（比频道列表多空间/频道名与时间）
export interface MessageSearchHit {
  id: string;
  channel: string;
  channel_name: string;
  server_name: string;
  author_id: string;
  author: string;
  content: string;
  at: string;
  hit_words: string[]; // 命中的敏感词；空数组 = 未命中
}

export async function searchMessages(params: {
  q: string;
  author?: string;
  days: number;
}): Promise<{ items: MessageSearchHit[]; days: number; capped: boolean; max_rows: number }> {
  const { data } = await api.get('/messages/search', { params });
  return data;
}

// 通过带认证头的 XHR 拉取 CSV 并触发浏览器下载（window.open 无法带 JWT 头）
export async function downloadCsv(path: string, params?: Record<string, string>): Promise<void> {
  const res = await api.get(path, { params, responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  const disp = (res.headers['content-disposition'] as string | undefined) ?? '';
  const m = /filename="?([^"]+)"?/.exec(disp);
  a.download = m ? m[1] : 'export.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function fetchReports(status: string): Promise<{ items: SafetyReport[] }> {
  const { data } = await api.get<{ items: SafetyReport[] }>('/reports', {
    params: { status },
  });
  return data;
}

// 举报状态流转：Resolved（核实处理）/ Rejected（驳回）
export function setReportStatus(id: string, status: 'Resolved' | 'Rejected', note: string) {
  return api.post(`/reports/${id}/status`, { status, note });
}

export async function fetchSpacesLite(): Promise<SpaceLite[]> {
  // 空间数量级很小，单页 100 足够；超出则循环拉取（上限 5 页兜底）
  const first = await api.get<Page<SpaceLite>>('/spaces', { params: { page: 1, page_size: 100 } });
  const items = [...first.data.items];
  const pages = Math.min(5, Math.ceil(first.data.total / 100));
  for (let p = 2; p <= pages; p++) {
    const next = await api.get<Page<SpaceLite>>('/spaces', { params: { page: p, page_size: 100 } });
    items.push(...next.data.items);
  }
  return items;
}

export async function fetchSpaceChannels(spaceId: string): Promise<ChannelLite[]> {
  const { data } = await api.get<{ items: ChannelLite[] }>(`/spaces/${spaceId}/channels`);
  return data.items;
}

export async function fetchSpaceBans(spaceId: string): Promise<{ items: BanRow[]; total: number }> {
  const { data } = await api.get(`/spaces/${spaceId}/bans`);
  return data;
}

export async function fetchAttachments(tag: string, page: number): Promise<Page<AttachmentRow>> {
  const { data } = await api.get<Page<AttachmentRow>>('/attachments', {
    params: { tag, page, page_size: 20 },
  });
  return data;
}

export async function fetchAttachmentStats(): Promise<AttachmentStats> {
  const { data } = await api.get<AttachmentStats>('/attachments/stats');
  return data;
}

// 文件服务主域（与客户端同源部署，Autumn 挂在主域 /autumn 路径下）
export const FILE_BASE = 'https://kokokongkong.com';

// 后端返回的 /autumn/{tag}/{id} 相对路径拼成可访问的绝对地址
export function fileUrl(path: string): string {
  return FILE_BASE + path;
}

export async function fetchUserDetail(id: string): Promise<UserDetail> {
  const { data } = await api.get<UserDetail>(`/users/${id}/profile`);
  return data;
}

export async function fetchAudit(page: number, f: AuditFilter = {}): Promise<Page<AuditEntry>> {
  const { data } = await api.get<Page<AuditEntry>>('/audit', {
    params: { page, page_size: 50, ...f },
  });
  return data;
}

// 审计日志筛选条件（空值不传给后端）
export interface AuditFilter {
  method?: string;
  actor?: string;
  q?: string;
}

export async function fetchAdminUsers(): Promise<{ items: AdminAccount[] }> {
  const { data } = await api.get<{ items: AdminAccount[] }>('/admin-users');
  return data;
}

export function createAdminUser(body: { username: string; password: string; role: Role }) {
  return api.post('/admin-users', body);
}

// super_admin 重置任意后台账号密码
export function resetAdminPassword(id: string, password: string) {
  return api.put(`/admin-users/${id}/password`, { password });
}

// super_admin 删除后台账号（禁止删自己；至少保留一个 super_admin）
export function deleteAdminUser(id: string) {
  return api.delete(`/admin-users/${id}`);
}

// ===== 敏感词命中统计 =====
export interface BannedWordStat {
  word: string;
  hits: number;
  users: number;
}

export interface BannedWordStats {
  items: BannedWordStat[];
  days: number;
  scanned: number;
  capped: boolean;
}

export function fetchBannedWordStats(days = 7) {
  return api
    .get<BannedWordStats>('/banned-words/stats', { params: { days } })
    .then((r) => r.data);
}

// ===== 语音房操作历史 =====
export interface VoiceHistoryItem {
  _id?: string;
  actor?: string;
  role?: string;
  method?: string;
  path?: string;
  status?: number;
  ip?: string;
  created_at?: string;
}

export function fetchVoiceHistory(page = 1, pageSize = 20) {
  return api
    .get<{ items: VoiceHistoryItem[]; total: number; page: number; page_size: number }>(
      '/voice/history',
      { params: { page, page_size: pageSize } },
    )
    .then((r) => r.data);
}

// 修改自己的密码（需验证旧密码）
export function changePassword(oldPassword: string, newPassword: string) {
  return api.post('/auth/change-password', {
    old_password: oldPassword,
    new_password: newPassword,
  });
}

// ===== 敏感词库 =====
export async function fetchBannedWords(): Promise<{ items: BannedWord[] }> {
  const { data } = await api.get<{ items: BannedWord[] }>('/banned-words');
  return data;
}

export function addBannedWord(word: string) {
  return api.post('/banned-words', { word });
}

export function removeBannedWord(id: string) {
  return api.delete(`/banned-words/${id}`);
}

// ===== 用户会话管理 =====
export async function fetchUserSessions(userId: string): Promise<{ items: UserSession[]; total: number }> {
  const { data } = await api.get<{ items: UserSession[]; total: number }>(`/users/${userId}/sessions`);
  return data;
}

// 删除会话 = 该设备立即被踢下线
export function deleteUserSession(userId: string, sessionId: string) {
  return api.delete(`/users/${userId}/sessions/${sessionId}`);
}

// 删除媒体文件（Autumn 会同时清理 Mongo 索引与 MinIO 对象）
export function deleteAttachment(id: string) {
  return api.delete(`/attachments/${id}`);
}

// ===== 服务健康 =====
export async function fetchSystemHealth(): Promise<{ items: ServiceHealth[]; checked_at: string }> {
  const { data } = await api.get<{ items: ServiceHealth[]; checked_at: string }>('/system/health');
  return data;
}

// ===== 运营公告板 =====
export interface Announcement {
  id: string;
  title: string;
  content: string;
  active: boolean;
  created_at: string;
  created_by: string;
  updated_at?: string;
}

export async function fetchAnnouncements(): Promise<{ items: Announcement[] }> {
  const { data } = await api.get<{ items: Announcement[] }>('/announcements');
  return data;
}

export function createAnnouncement(body: { title: string; content: string }) {
  return api.post('/announcements', body);
}

export function updateAnnouncement(id: string, body: { title: string; content: string }) {
  return api.patch(`/announcements/${id}`, body);
}

// 启用公告会自动停用其余（单公告位）
export function setAnnouncementActive(id: string, active: boolean) {
  return api.patch(`/announcements/${id}/active`, { active });
}

export function deleteAnnouncement(id: string) {
  return api.delete(`/announcements/${id}`);
}

// ===== 语音房管理（LiveKit） =====
export interface VoiceRoom {
  room: string; // LiveKit room name（= 频道 ID）
  channel_name: string;
  server_name: string;
  num_participants: number;
  created_at: string;
}

export interface VoiceParticipant {
  identity: string; // 用户 ULID
  username: string;
  state: string;
  joined_at: string;
}

export async function fetchVoiceRooms(): Promise<{ items: VoiceRoom[] }> {
  const { data } = await api.get<{ items: VoiceRoom[] }>('/voice/rooms');
  return data;
}

export async function fetchVoiceParticipants(room: string): Promise<{ items: VoiceParticipant[]; room: string }> {
  const { data } = await api.get<{ items: VoiceParticipant[]; room: string }>(
    `/voice/rooms/${encodeURIComponent(room)}/participants`,
  );
  return data;
}

// 解散房间：所有参与者被强制断开
export function deleteVoiceRoom(room: string) {
  return api.delete(`/voice/rooms/${encodeURIComponent(room)}`);
}

// 移出参与者（不封禁账号）
export function kickVoiceParticipant(room: string, identity: string) {
  return api.delete(`/voice/rooms/${encodeURIComponent(room)}/participants/${encodeURIComponent(identity)}`);
}

// ===== 连接精灵链（NFT 融合） =====

// linksprite-backend /api/health 返回的服务与链状态
export interface ChainHealth {
  service: string;
  status: string;
  chainEnabled: boolean;
  chainConnected: boolean;
  chainId: string;
  groupId: string;
  blockNumber: number;
}

// 链服务统一返回结构（Result<T>）
export interface ChainResult<T = unknown> {
  code: number;
  message: string;
  data: T;
}

// 链上写操作返回的交易凭据
export interface ChainTx {
  txHash?: string;
  blockNumber?: string;
  status?: string;
  message?: string;
}

// 统一走 BFF 透传代理 /api/v1/chain/<rest>（GET 查询 moderator+；写操作仅 super_admin，BFF 强制）
// params 拼到 query string；Spring @RequestParam 与 @PathVariable 均可直接命中
export const chainApi = {
  async get<T = unknown>(path: string, params?: Record<string, string | number>): Promise<ChainResult<T>> {
    const { data } = await api.get<ChainResult<T>>(`/chain/${path}`, { params });
    return data;
  },
  async post(
    path: string,
    body?: unknown,
    params?: Record<string, string | number | boolean>,
  ): Promise<ChainResult> {
    const { data } = await api.post<ChainResult>(`/chain/${path}`, body ?? {}, { params });
    return data;
  },
};

// ===== B 端合作申请（BFF 原生，非链代理） =====

export type B2bStatus = 'pending' | 'contacted' | 'signed' | 'active' | 'rejected';

export interface B2bApplication {
  id: string;
  company: string;
  contact: string;
  phone: string;
  ip_type: string;
  work_desc: string;
  expected_volume?: number;
  status: B2bStatus;
  created_at: string;
  updated_at?: string;
  handled_by?: string;
}

export async function fetchB2bApplications(): Promise<{ items: B2bApplication[] }> {
  const { data } = await api.get<{ items: B2bApplication[] }>('/b2b/applications');
  return data;
}

export async function updateB2bApplicationStatus(id: string, status: B2bStatus) {
  const { data } = await api.patch(`/b2b/applications/${id}`, { status });
  return data;
}
