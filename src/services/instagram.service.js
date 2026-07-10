import axios from 'axios';
import { CONFIG } from '../config/index.js';

export class InstagramService {
  constructor() {
    this.accessToken = CONFIG.INSTAGRAM_ACCESS_TOKEN;
    this.businessAccountId = CONFIG.INSTAGRAM_ID;
    this.baseUrl = 'https://graph.facebook.com/v25.0';

    if (!this.accessToken || !this.businessAccountId) {
      throw new Error('InstagramService: .env sozlamalarida identifikatorlar yetishmayapti.');
    }

    // Axios uchun default konfiguratsiya
    this.api = axios.create({
      baseURL: this.baseUrl,
      params: { access_token: this.accessToken }
    });
  }

  /**
   * Instagram'ga Reels (Video) yuklash
   * @param {string} videoUrl - Internetda ochiq turgan to'g'ri video manzili (MP4)
   * @param {string} caption - Post ostidagi matn va hashtaglar
   * @returns {Promise<string>} - Yuklangan postning Meta ID-si
   */
  async uploadReels(videoUrl, caption) {
    try {
      console.log('🎬 1-Bosqich: Video container yaratilmoqda...');
      
      const containerResponse = await this.api.post(`/${this.businessAccountId}/media`, null, {
        params: {
          media_type: 'REELS',
          video_url: videoUrl,
          caption: caption,
        }
      });

      const { id: containerId } = containerResponse.data;
      console.log(`✅ Container muvaffaqiyatli yaratildi. ID: ${containerId}`);

      // Videoni Meta serverlari qayta ishlab (processing) olishi uchun kutish zanjiri
      await this._waitForMediaProcessing(containerId);

      console.log('🚀 2-Bosqich: Reels instagram sahifasiga chop etilmoqda (Publish)...');
      const publishResponse = await this.api.post(`/${this.businessAccountId}/media_publish`, null, {
        params: { creation_id: containerId }
      });

      console.log('🎉 Reels muvaffaqiyatli yuklandi!');
      return publishResponse.data.id;

    } catch (error) {
      this._handleError('uploadReels', error);
    }
  }

  /**
   * Meta serverlarida videoning qayta ishlanish holatini tekshirish (Polling helper)
   */
  async _waitForMediaProcessing(containerId, retries = 10, delayMs = 5000) {
    for (let i = 0; i < retries; i++) {
      console.log(`⏳ Video holati tekshirilmoqda (Urinish ${i + 1}/${retries})...`);
      
      const statusResponse = await this.api.get(`/${containerId}`, {
        params: { fields: 'status_code,status' }
      });

      const { status_code } = statusResponse.data;

      if (status_code === 'FINISHED') {
        console.log('✅ Video Meta tomonidan toʻliq yuklab olindi va tayyor holga keltirildi.');
        return true;
      }

      if (status_code === 'ERROR') {
        throw new Error(`Meta videoni qayta ishlashda xatolikka duch keldi: ${statusResponse.data.status}`);
      }

      // Keyingi tekshirishgacha kutish (Sleep)
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    
    throw new Error('Video yuklanish vaqti (Timeout) tugadi. Meta videoni qayta ishlab ulgurmadi.');
  }

  /**
   * Markazlashtirilgan xatoliklarni boshqarish tizimi
   */
  _handleError(methodName, error) {
    const errorDetails = error.response?.data || error.message;
    console.error(`❌ InstagramService.${methodName} ichida xatolik:`, errorDetails);
    throw new Error(`Instagram integratsiyasida xatolik: ${error.message}`);
  }
}