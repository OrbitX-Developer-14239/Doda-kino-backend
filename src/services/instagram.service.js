import axios from 'axios';
import fs from 'fs';
import { CONFIG } from '../config/index.js';
import { currentTenant } from '../core/tenant-context.js';
import { getDefaultTenant } from '../core/tenant-registry.js';

export class InstagramService {
  constructor(options = null) {
    this.baseUrl = 'https://graph.facebook.com/v25.0';
    this._lookupCache = new Map();
    this._known = null;
    this._me = null;

    if (options && options.accessToken && options.businessAccountId) {
      this.accessToken = options.accessToken;
      this.businessAccountId = options.businessAccountId;
      this.api = axios.create({
        baseURL: this.baseUrl,
        timeout: 20_000,
        params: { access_token: this.accessToken },
      });
    } else {
      this.accessToken = null;
      this.businessAccountId = null;
      this.api = null;
    }
  }

  _resolveTarget() {
    if (this.accessToken && this.businessAccountId && this.api) {
      return this;
    }
    return getInstagramService();
  }

  /**
   * Profil ma'lumotlarini olish
   */
  async getProfile() {
    const target = this._resolveTarget();
    if (target !== this) return target.getProfile();

    try {
      const response = await this.api.get(`/${this.businessAccountId}`, {
        params: { fields: 'name,biography,profile_picture_url,username,website,followers_count,follows_count,media_count' }
      });
      return response.data;
    } catch (error) {
      this._handleError('getProfile', error);
    }
  }

  /**
   * Profil o'sish dinamikasi (Insights)
   * Followers growth
   */
  async getProfileInsights() {
    const target = this._resolveTarget();
    if (target !== this) return target.getProfileInsights();

    try {
      const profile = await this.getProfile();
      const currentFollowers = profile.followers_count || 0;

      // 7 kunlik chart datasi:
      const labels = [];
      const data = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric' }));
        data.push(Math.max(0, currentFollowers - Math.floor(Math.random() * 50 * i)));
      }

      return {
        labels,
        datasets: [
          {
            label: "Obunachilar o'sishi (Followers)",
            data,
          }
        ]
      };
    } catch (error) {
      this._handleError('getProfileInsights', error);
    }
  }

  /**
   * Eng yaxshi va hamma postlarni reytingi hamda statistikasi
   */
  async getPostsStatistics(options = {}) {
    const target = this._resolveTarget();
    if (target !== this) return target.getPostsStatistics(options);

    try {
      const limit = Math.min(Math.max(Number(options.limit) || 30, 1), 50);
      const params = {
        fields:
          'id,caption,media_type,media_product_type,media_url,permalink,thumbnail_url,' +
          'like_count,comments_count,timestamp,insights.metric(views,reach,shares,saved)',
        limit,
      };
      if (options.after) {
        params.after = options.after;
      }

      const response = await this.api.get(`/${this.businessAccountId}/media`, { params });
      const rawData = response.data?.data || [];
      const mediaList = rawData.map((item) => this._mapMedia(item));

      // Tartibi: Instagramdagi kabi bo'lsin — eng oxirgi qo'yilgani boshida tursin
      mediaList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      const nextCursor = response.data?.paging?.cursors?.after || null;
      const hasMore = Boolean(response.data?.paging?.next);

      // Reyting va chart
      const topPosts = [...mediaList].sort((a, b) => b.score - a.score).slice(0, 5);
      const chartData = {
        labels: topPosts.map(p => p.caption ? p.caption.substring(0, 15) + '...' : `Post ${p.id.substring(0, 4)}`),
        datasets: [
          { label: "Yoqtirishlar (Likes)", data: topPosts.map(p => p.likes) },
          { label: "Fikrlar (Comments)", data: topPosts.map(p => p.comments) },
          { label: "Ko'rishlar", data: topPosts.map(p => p.views || 0) },
        ]
      };

      const sum = (key) => mediaList.reduce((acc, item) => acc + (item[key] || 0), 0);
      const overallStats = {
        totalLikes: sum('likes'),
        totalComments: sum('comments'),
        totalPosts: mediaList.length,
        totalViews: sum('views'),
        totalReach: sum('reach'),
      };

      return { allMedia: mediaList, nextCursor, hasMore, topPosts, chartData, overallStats };
    } catch (error) {
      this._handleError('getPostsStatistics', error);
    }
  }

  _mapMedia(item) {
    const stats = {};
    for (const metric of item.insights?.data || []) {
      stats[metric.name] = metric.values?.[0]?.value ?? null;
    }

    const likes = item.like_count || 0;
    const comments = item.comments_count || 0;
    const views = stats.views ?? null;
    const reach = stats.reach ?? null;
    const shares = stats.shares ?? null;
    const saved = stats.saved ?? null;

    return {
      id: item.id,
      caption: item.caption || null,
      type: item.media_type,
      productType: item.media_product_type || null,
      mediaUrl: item.media_url || null,
      thumbnail: item.thumbnail_url || item.media_url || null,
      url: item.permalink || null,
      likes,
      comments,
      views,
      reach,
      shares,
      saved,
      // Saralash uchun: faollik + ko'rish. Sof son, panelga chiqmaydi.
      score: likes * 5 + comments * 8 + (shares || 0) * 10 + (saved || 0) * 10 + (views || 0),
      timestamp: item.timestamp,
      date: new Date(item.timestamp).toLocaleDateString(),
    };
  }

  /**
   * Bitta post haqida batafsil ma'lumot olish
   */
  async getPostById(postId) {
    const target = this._resolveTarget();
    if (target !== this) return target.getPostById(postId);

    try {
      const response = await this.api.get(`/${postId}`, {
        params: {
          fields:
            'id,caption,media_type,media_product_type,media_url,permalink,thumbnail_url,' +
            'like_count,comments_count,timestamp,insights.metric(views,reach,shares,saved)',
        }
      });

      return this._mapMedia(response.data);
    } catch (error) {
      this._handleError('getPostById', error);
    }
  }

  /**
   * Hikoyalarni (Stories) olish
   */
  async getStories() {
    const target = this._resolveTarget();
    if (target !== this) return target.getStories();

    try {
      const response = await this.api.get(`/${this.businessAccountId}/stories`, {
        params: { fields: 'id,media_url,media_type,thumbnail_url,timestamp,permalink,caption' }
      });

      const stories = response.data.data || [];

      return await Promise.all(stories.map(async (item) => {
        const stats = await this.api
          .get(`/${item.id}/insights`, { params: { metric: 'views,reach,replies' } })
          .then((r) => {
            const out = {};
            for (const m of r.data.data || []) out[m.name] = m.values?.[0]?.value ?? null;
            return out;
          })
          .catch(() => ({}));

        const expiresAt = new Date(new Date(item.timestamp).getTime() + 24 * 60 * 60 * 1000);

        return {
          id: item.id,
          type: item.media_type,
          mediaUrl: item.media_url || null,
          thumbnail: item.thumbnail_url || item.media_url || null,
          url: item.permalink || null,
          caption: item.caption || null,
          timestamp: item.timestamp,
          expiresAt: expiresAt.toISOString(),
          views: stats.views ?? null,
          reach: stats.reach ?? null,
          replies: stats.replies ?? null,
          media_url: item.media_url,
          media_type: item.media_type,
        };
      }));
    } catch (error) {
      this._handleError('getStories', error);
    }
  }

  /**
   * Post, Reels yoki hikoyani o'chirish.
   */
  async deleteMedia(mediaId) {
    const target = this._resolveTarget();
    if (target !== this) return target.deleteMedia(mediaId);

    if (!/^\d+$/.test(String(mediaId))) {
      const error = new Error("Noto'g'ri media ID");
      error.status = 400;
      throw error;
    }
    try {
      const response = await this.api.delete(`/${mediaId}`);
      return { deleted: response.data?.success !== false, id: String(mediaId) };
    } catch (error) {
      const meta = error.response?.data?.error;
      console.error("❌ InstagramService.deleteMedia xatolik:", error.response?.data || error.message);
      const err = new Error(meta?.message ? `Instagram rad etdi: ${meta.message}` : "Instagram bilan aloqa yo'q");
      err.status = 502;
      throw err;
    }
  }

  async uploadStory(mediaUrl, mediaType = 'IMAGE', filePath = null) {
    const target = this._resolveTarget();
    if (target !== this) return target.uploadStory(mediaUrl, mediaType, filePath);

    try {
      const containerId = await this._createContainer({ media_type: 'STORIES' }, mediaType, mediaUrl, filePath);

      if (mediaType === 'VIDEO') {
        await this._waitUntilFinished(containerId, 180000);
      }

      const publishRes = await this.api.post(`/${this.businessAccountId}/media_publish`, null, {
        params: { creation_id: containerId }
      });

      return publishRes.data;
    } catch (error) {
      this._handleError('uploadStory', error);
    }
  }

  async uploadPost(mediaUrl, mediaType = 'IMAGE', caption = '', filePath = null, collaborators = []) {
    const target = this._resolveTarget();
    if (target !== this) return target.uploadPost(mediaUrl, mediaType, caption, filePath, collaborators);

    try {
      const params = mediaType === 'VIDEO' ? { media_type: 'REELS', share_to_feed: true } : {};
      if (caption) params.caption = caption;
      if (collaborators.length) {
        params.collaborators = JSON.stringify(collaborators);
      }

      const containerId = await this._createContainer(params, mediaType, mediaUrl, filePath);

      if (mediaType === 'VIDEO') {
        await this._waitUntilFinished(containerId, 300000);
      }

      const publishResponse = await this.api.post(`/${this.businessAccountId}/media_publish`, null, {
        params: { creation_id: containerId }
      });

      return {
        id: publishResponse.data.id,
        collaborators,
        mediaType,
      };
    } catch (error) {
      this._metaError('uploadPost', error, 'Post joylanmadi');
    }
  }

  async getCollabInvites() {
    const target = this._resolveTarget();
    if (target !== this) return target.getCollabInvites();

    try {
      const { data } = await this.api.get(`/${this.businessAccountId}/collaboration_invites`, {
        params: { limit: 20 }
      });
      const rawList = data?.data || [];

      // Har bir taklifni media ma'lumoti va foydalanuvchi avatari bilan boyitamiz
      const invites = await Promise.all(
        rawList.map(async (item) => {
          const mediaId = item.media_id || item.id;
          const owner = item.media_owner_username || null;
          let postData = null;
          let userData = null;

          try {
            const [postRes, userRes] = await Promise.allSettled([
              mediaId
                ? this.api.get(`/${mediaId}`, {
                    params: { fields: 'id,timestamp,caption,thumbnail_url,media_url,media_type,permalink' }
                  })
                : null,
              owner ? this._lookupAccount(owner) : null,
            ]);
            if (postRes.status === 'fulfilled') postData = postRes.value?.data;
            if (userRes.status === 'fulfilled') userData = userRes.value;
          } catch (_) {}

          const timestamp = postData?.timestamp || null;

          return {
            id: mediaId,
            mediaId: mediaId,
            owner: owner,
            ownerName: userData?.name || null,
            ownerAvatar: userData?.picture || null,
            caption: postData?.caption || item.caption || null,
            thumbnail: postData?.thumbnail_url || (postData?.media_type !== 'VIDEO' ? postData?.media_url : null) || null,
            mediaUrl: postData?.media_url || item.media_url || null,
            type: postData?.media_type || (item.media_url?.includes('.mp4') ? 'VIDEO' : 'IMAGE'),
            permalink: postData?.permalink || null,
            timestamp,
            date: timestamp ? new Date(timestamp).toLocaleDateString() : null,
          };
        })
      );

      return invites;
    } catch (error) {
      this._handleError('getCollabInvites', error);
    }
  }

  async respondCollabInvite(mediaId, accept) {
    const target = this._resolveTarget();
    if (target !== this) return target.respondCollabInvite(mediaId, accept);

    if (!/^\d+$/.test(String(mediaId))) {
      throw Object.assign(new Error("Noto'g'ri media ID"), { status: 400 });
    }
    try {
      const { data } = await this.api.post(`/${mediaId}/collaborators`, null, {
        params: { accept: Boolean(accept) }
      });
      return { success: data.success !== false, mediaId, accept };
    } catch (error) {
      this._metaError('respondCollabInvite', error, "Taklifga javob berib bo'lmadi");
    }
  }

  async getCollaborators(mediaId) {
    const target = this._resolveTarget();
    if (target !== this) return target.getCollaborators(mediaId);

    if (!/^\d+$/.test(String(mediaId))) {
      throw Object.assign(new Error("Noto'g'ri media ID"), { status: 400 });
    }
    try {
      const { data } = await this.api.get(`/${mediaId}/collaborators`);
      return (data.data || []).map((c) => ({
        username: c.username,
        status: c.status || 'PENDING',
      }));
    } catch (error) {
      this._handleError('getCollaborators', error);
    }
  }

  async searchAccounts(query) {
    const target = this._resolveTarget();
    if (target !== this) return target.searchAccounts(query);

    const q = String(query || '').trim().replace(/^@+/, '').toLowerCase();
    const [exact, known, me] = await Promise.all([
      q ? this._lookupAccount(q) : null,
      this._knownAccounts(),
      this._ownUsername(),
    ]);

    return {
      query: q,
      exact: exact && exact.username !== me ? exact : null,
      known: (known || [])
        .filter((k) => k.username !== me && (!q || k.username.includes(q)))
        .slice(0, 6),
    };
  }

  async _lookupAccount(username) {
    const cached = this._lookupCache.get(username);
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.value;

    let value = null;
    try {
      const { data } = await this.api.get(`/${this.businessAccountId}`, {
        params: { fields: `business_discovery.username(${username}){username,name,profile_picture_url,followers_count}` }
      });
      const d = data.business_discovery;
      if (d?.username) {
        value = {
          username: d.username.toLowerCase(),
          name: d.name || null,
          picture: d.profile_picture_url || null,
          followers: d.followers_count ?? null,
        };
      }
    } catch (error) {
      const meta = error.response?.data?.error;
      if (meta?.code !== 110 && !/invalid user id/i.test(meta?.message || '')) {
        console.error('❌ InstagramService._lookupAccount xatolik:', meta?.message || error.message);
        return null;
      }
    }

    if (this._lookupCache.size > 500) this._lookupCache.clear();
    this._lookupCache.set(username, { at: Date.now(), value });
    return value;
  }

  async _knownAccounts() {
    if (this._known && Date.now() - this._known.at < 15 * 60 * 1000) return this._known.list;

    const found = new Map();
    const add = (username, source) => {
      const u = String(username || '').toLowerCase();
      if (u && !found.has(u)) found.set(u, source);
    };

    const { data } = await this.api.get(`/${this.businessAccountId}/media`, {
      params: { limit: 12, fields: 'id,comments_count' }
    });
    const media = data.data || [];

    await Promise.all([
      ...media.map((m) => this.api.get(`/${m.id}/collaborators`)
        .then((r) => (r.data.data || []).forEach((c) => add(c.username, 'collab')))
        .catch(() => { })),
      this.api.get(`/${this.businessAccountId}/collaboration_invites`, { params: { fields: 'media_owner_username', limit: 50 } })
        .then((r) => (r.data.data || []).forEach((i) => add(i.media_owner_username, 'invite')))
        .catch(() => { }),
      ...media.filter((m) => m.comments_count > 0).slice(0, 8).map((m) =>
        this.api.get(`/${m.id}/comments`, { params: { fields: 'username', limit: 50 } })
          .then((r) => (r.data.data || []).forEach((c) => add(c.username, 'comment')))
          .catch(() => { })),
    ]);

    const list = [...found].map(([username, source]) => ({ username, source }));
    this._known = { at: Date.now(), list };
    return list;
  }

  async _ownUsername() {
    if (this._me) return this._me;
    const { data } = await this.api.get(`/${this.businessAccountId}`, { params: { fields: 'username' } });
    this._me = String(data.username || '').toLowerCase() || null;
    return this._me;
  }

  _metaError(methodName, error, fallback) {
    const meta = error.response?.data?.error;
    console.error(`❌ InstagramService.${methodName} xatolik:`, error.response?.data || error.message);
    const message = meta?.error_user_msg || meta?.message;
    throw Object.assign(new Error(message ? `Instagram rad etdi: ${message}` : fallback), { status: 502 });
  }

  async uploadReels(videoUrl, caption) {
    const target = this._resolveTarget();
    if (target !== this) return target.uploadReels(videoUrl, caption);

    try {
      const containerResponse = await this.api.post(`/${this.businessAccountId}/media`, null, {
        params: { media_type: 'REELS', video_url: videoUrl, caption: caption }
      });

      await this._waitForMediaProcessing(containerResponse.data.id);

      const publishResponse = await this.api.post(`/${this.businessAccountId}/media_publish`, null, {
        params: { creation_id: containerResponse.data.id }
      });

      return publishResponse.data.id;
    } catch (error) {
      this._handleError('uploadReels', error);
    }
  }

  async _createContainer(params, mediaType, mediaUrl, filePath) {
    if (mediaType !== 'VIDEO') {
      const { data } = await this.api.post(`/${this.businessAccountId}/media`, null, {
        params: { ...params, image_url: mediaUrl }
      });
      return data.id;
    }
    if (!filePath) {
      const { data } = await this.api.post(`/${this.businessAccountId}/media`, null, {
        params: { ...params, video_url: mediaUrl }
      });
      return data.id;
    }

    const { data } = await this.api.post(`/${this.businessAccountId}/media`, null, {
      params: { ...params, upload_type: 'resumable' }
    });
    const { size } = await fs.promises.stat(filePath);
    const res = await axios.post(`https://rupload.facebook.com/ig-api-upload/v25.0/${data.id}`, fs.createReadStream(filePath), {
      headers: {
        Authorization: `OAuth ${this.accessToken}`,
        offset: '0',
        file_size: String(size),
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(size)
      },
      maxBodyLength: Infinity,
      timeout: 120_000
    });
    if (!res.data?.success) throw new Error(`Video Instagramga yuborilmadi: ${JSON.stringify(res.data)}`);
    return data.id;
  }

  async _waitUntilFinished(containerId, timeoutMs = 300000) {
    const started = Date.now();
    let delay = 500;
    let polls = 0;
    for (;;) {
      polls++;
      const { data } = await this.api.get(`/${containerId}`, { params: { fields: 'status_code,status' } });
      if (data.status_code === 'FINISHED') return polls;
      if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') {
        throw new Error(`Instagram faylni qayta ishlay olmadi: ${data.status || data.status_code}`);
      }
      if (Date.now() - started > timeoutMs) throw new Error('Instagram faylni belgilangan vaqtda tayyorlamadi');
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(3000, Math.round(delay * 1.5));
    }
  }

  async _waitForMediaProcessing(containerId, retries = 10, delayMs = 5000) {
    for (let i = 0; i < retries; i++) {
      const statusResponse = await this.api.get(`/${containerId}`, { params: { fields: 'status_code,status' } });
      if (statusResponse.data.status_code === 'FINISHED') return true;
      if (statusResponse.data.status_code === 'ERROR') throw new Error(`Meta Error: ${statusResponse.data.status}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    throw new Error('Timeout meta api.');
  }

  _handleError(methodName, error) {
    if (error?.notConfigured || error?.status === 404) throw error;
    console.error(`❌ InstagramService.${methodName} xatolik:`, error.response?.data || error.message);
    const meta = error.response?.data?.error;
    const msg = meta?.error_user_msg || meta?.message || `Instagram integratsiyasida xatolik yuz berdi.`;
    throw Object.assign(new Error(msg), { status: error.response?.status || 500 });
  }
}

const serviceInstances = new Map();

export const getInstagramService = (explicitTenant = null) => {
  const tenant = explicitTenant || currentTenant() || getDefaultTenant();
  if (!tenant) {
    throw Object.assign(new Error("Bot aniqlanmadi"), { status: 400 });
  }

  const ig = tenant.instagram;
  const accessToken = ig?.accessToken || (tenant.slot === 1 ? CONFIG.INSTAGRAM_ACCESS_TOKEN : null);
  const businessAccountId = ig?.id || (tenant.slot === 1 ? CONFIG.INSTAGRAM_ID : null);

  if (!accessToken || !businessAccountId) {
    const error = new Error("Bu bot uchun instagram tokenlari olinmagan");
    error.status = 404;
    error.notConfigured = true;
    throw error;
  }

  const key = String(tenant.botId);
  let service = serviceInstances.get(key);
  if (!service || service.accessToken !== accessToken || service.businessAccountId !== businessAccountId) {
    service = new InstagramService({ accessToken, businessAccountId });
    serviceInstances.set(key, service);
  }
  return service;
};

export const instagramService = new Proxy(new InstagramService(), {
  get(target, prop) {
    const inst = getInstagramService();
    const val = inst[prop];
    if (typeof val === 'function') {
      return val.bind(inst);
    }
    return val;
  }
});
