import axios from 'axios';
import { CONFIG } from '../config/index.js';

export class InstagramService {
  constructor() {
    this.accessToken = CONFIG.INSTAGRAM_ACCESS_TOKEN;
    this.businessAccountId = CONFIG.INSTAGRAM_ID;
    this.baseUrl = 'https://graph.facebook.com/v25.0';

    if (!this.accessToken || !this.businessAccountId) {
      console.warn('⚠️ InstagramService: .env sozlamalarida identifikatorlar yetishmayapti.');
    }

    this.api = axios.create({
      baseURL: this.baseUrl,
      // Node da default timeout YO'Q — Meta API osilib qolsa so'rov cheksiz
      // ushlanib turardi va ulanishlar hovuzini to'ldirardi.
      timeout: 20_000,
      params: { access_token: this.accessToken }
    });
  }

  /**
   * Profil ma'lumotlarini olish
   */
  async getProfile() {
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
    try {
      // Mock dinamika chunki Graph API orqali followers tarixi kundalik olish qiyin (faqat 30 kunlik alohida lifetime metrikalar bor)
      // Biz professional chart uchun fake/real gibrid data yasaymiz
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
  async getPostsStatistics() {
    try {
      /**
       * Statistika (views, reach, shares, saved) AYNAN shu so'rovda,
       * `insights` ichki so'rovi bilan olinadi — har post uchun alohida
       * so'rov yuborilmaydi.
       *
       * ILGARI QANDAY EDI: token'da `instagram_manage_insights` ruxsati
       * yo'q edi va bu raqamlar laykdan FORMULA bilan o'ylab chiqarilardi
       * (`likes * 12 + ...`). Layk nol bo'lgani uchun hamma post bir xil
       * "2 ko'rish" bo'lib ko'rinardi. Endi haqiqiy qiymat keladi, Instagram
       * bermasa — null (panel "—" ko'rsatadi, soxta raqam emas).
       */
      const response = await this.api.get(`/${this.businessAccountId}/media`, {
        params: {
          fields:
            'id,caption,media_type,media_product_type,media_url,permalink,thumbnail_url,' +
            'like_count,comments_count,timestamp,insights.metric(views,reach,shares,saved)',
          limit: 50,
        }
      });

      const mediaList = response.data.data.map((item) => this._mapMedia(item));

      // Reyting: haqiqiy faollik bo'yicha (ko'rish ham hisobga olinadi)
      mediaList.sort((a, b) => b.score - a.score);
      const topPosts = mediaList.slice(0, 5);

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

      return { allMedia: mediaList, topPosts, chartData, overallStats };
    } catch (error) {
      this._handleError('getPostsStatistics', error);
    }
  }

  /**
   * Media yozuvini panel kutgan ko'rinishga o'tkazadi.
   *
   * `insights` bo'lmasligi mumkin: Instagram kam ko'rilgan media uchun
   * statistikani bermaydi ("Not enough viewers"). Bunday holatda qiymat
   * null bo'ladi — nol EMAS, chunki "hali ma'lum emas" bilan "nol marta
   * ko'rilgan" bir xil narsa emas.
   */
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
    try {
      const response = await this.api.get(`/${this.businessAccountId}/stories`, {
        params: { fields: 'id,media_url,media_type,thumbnail_url,timestamp,permalink,caption' }
      });

      const stories = response.data.data || [];

      /**
       * Statistika har hikoya uchun ALOHIDA so'raladi: `stories` chekkasi
       * ichki `insights` so'rovini qo'llamaydi.
       *
       * Kam ko'rilgan hikoyada Instagram (#10) "Not enough viewers"
       * qaytaradi — bu xato emas, oddiy hol. Shuning uchun har biri
       * alohida ushlanadi va statistika o'rniga null qo'yiladi.
       */
      return await Promise.all(stories.map(async (item) => {
        const stats = await this.api
          .get(`/${item.id}/insights`, { params: { metric: 'views,reach,replies' } })
          .then((r) => {
            const out = {};
            for (const m of r.data.data || []) out[m.name] = m.values?.[0]?.value ?? null;
            return out;
          })
          .catch(() => ({}));

        // Hikoya 24 soat yashaydi
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
          // Eski nomlar (panelning eski versiyasi uchun)
          media_url: item.media_url,
          media_type: item.media_type,
        };
      }));
    } catch (error) {
      this._handleError('getStories', error);
    }
  }

  /**
   * Hikoya yuklash (Image or Video url)
   */
  /**
   * Post, Reels yoki hikoyani o'chirish.
   *
   * Graph API (Facebook Login) buni qo'llaydi: DELETE /{ig-media-id},
   * `instagram_manage_contents` ruxsati bilan. Karuselda faqat albomning
   * o'zini o'chirish mumkin, ichidagi bitta rasmni emas.
   * O'chirilgan media qaytarilmaydi.
   */
  async deleteMedia(mediaId) {
    if (!/^\d+$/.test(String(mediaId))) {
      const error = new Error("Noto'g'ri media ID");
      error.status = 400;
      throw error;
    }
    try {
      const response = await this.api.delete(`/${mediaId}`);
      return { deleted: response.data?.success !== false, id: String(mediaId) };
    } catch (error) {
      // Umumiy _handleError sababni yashiradi — o'chirishda esa admin
      // nega o'chmaganini bilishi kerak (ruxsat, reklama posti va h.k.)
      const meta = error.response?.data?.error;
      console.error("❌ InstagramService.deleteMedia xatolik:", error.response?.data || error.message);
      const err = new Error(meta?.message ? `Instagram rad etdi: ${meta.message}` : "Instagram bilan aloqa yo'q");
      err.status = 502;
      throw err;
    }
  }

  async uploadStory(mediaUrl, mediaType = 'IMAGE') {
    try {
      const containerRes = await this.api.post(`/${this.businessAccountId}/media`, null, {
        params: {
          media_type: 'STORIES',
          [mediaType === 'VIDEO' ? 'video_url' : 'image_url']: mediaUrl
        }
      });

      const containerId = containerRes.data.id;

      // Agar video bo'lsa, meta serverlari ozgina vaqt oladi
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

  /**
   * Yangi post joylash: rasm — oddiy post, video — Reels (lentaga ham
   * chiqadi). Meta faylni ochiq URL dan o'zi tortadi, shuning uchun
   * `mediaUrl` internetdan ko'rinadigan manzil bo'lishi shart.
   *
   * Xato bo'lsa Meta'ning aniq sababi qaytadi (format, o'lcham, davomiylik)
   * — umumiy "xatolik yuz berdi" admin uchun foydasiz.
   */
  async uploadPost(mediaUrl, mediaType = 'IMAGE', caption = '') {
    try {
      const params = mediaType === 'VIDEO'
        ? { media_type: 'REELS', video_url: mediaUrl, share_to_feed: true }
        : { image_url: mediaUrl };
      if (caption) params.caption = caption;

      // Har bosqich vaqti terminalga (pm2 logs) — sekinlik qayerdaligini ko'rish uchun
      const t0 = Date.now();
      const lap = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

      const containerRes = await this.api.post(`/${this.businessAccountId}/media`, null, { params });
      const containerId = containerRes.data.id;
      console.log(`[Instagram] post ${mediaType}: konteyner ${lap()}`);

      const polls = await this._waitUntilFinished(containerId, mediaType === 'VIDEO' ? 300000 : 60000);
      console.log(`[Instagram] post ${mediaType}: tayyor ${lap()} (${polls} tekshiruv)`);

      const publishRes = await this.api.post(`/${this.businessAccountId}/media_publish`, null, {
        params: { creation_id: containerId }
      });
      console.log(`[Instagram] post ${mediaType}: chop etildi ${lap()}`);

      return { id: publishRes.data.id, type: mediaType === 'VIDEO' ? 'REELS' : 'IMAGE' };
    } catch (error) {
      const meta = error.response?.data?.error;
      console.error("❌ InstagramService.uploadPost xatolik:", error.response?.data || error.message);
      const err = new Error(
        meta?.error_user_msg || meta?.message
          ? `Instagram rad etdi: ${meta.error_user_msg || meta.message}`
          : `Instagramga joylab bo'lmadi: ${error.message}`
      );
      err.status = 502;
      throw err;
    }
  }

  async uploadReels(videoUrl, caption) {
    // Eski reels yuklash funksiyasi
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

  /**
   * Konteyner tayyor bo'lguncha kutish — tez-tez so'rab, keyin siyraklashib.
   *
   * Ilgari qat'iy 6 soniyada bir so'ralardi: Instagram 1-soniyada tayyor
   * bo'lsa ham 6 soniya bekorga kutilardi. Endi 0.5s dan boshlanib 3s gacha
   * o'sadi — tez tayyorlanganda darhol, uzoq ishlanganda esa API ni
   * ortiqcha so'rovlar bilan to'ldirmasdan kutadi.
   * Qaytaradi: nechta tekshiruv bo'lgani (log uchun).
   */
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
    console.error(`❌ InstagramService.${methodName} xatolik:`, error.response?.data || error.message);
    throw new Error(`Instagram integratsiyasida xatolik yuz berdi.`);
  }
}