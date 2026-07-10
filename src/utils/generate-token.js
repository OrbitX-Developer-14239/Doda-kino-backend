import axios from 'axios';
import { CONFIG } from '../config/index.js';

async function generateLongLivedToken() {
    const { META_APP_ID, META_APP_SECRET, INSTAGRAM_TEMP_ACCESS_TOKEN } = CONFIG

    if (!META_APP_ID || !META_APP_SECRET || !INSTAGRAM_TEMP_ACCESS_TOKEN) {
        console.error('❌ Xatolik: .env faylida maʼlumotlar toʻliq emas!');
        return;
    }

    try {
        console.log('🔄 Meta API\'dan uzoq muddatli token soʻralmoqda...');

        const response = await axios.get('https://graph.facebook.com/v25.0/oauth/access_token', {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: META_APP_ID,
                client_secret: META_APP_SECRET,
                fb_exchange_token: INSTAGRAM_TEMP_ACCESS_TOKEN,
            },
        });

        const longLivedToken = response.data.access_token;

        console.log('\n================ 🎉 MUVAFFAQIYAT! ================');
        console.log('Quyidagi uzoq muddatli tokenni .env faylingizga INSTAGRAM_ACCESS_TOKEN sifatida saqlang:\n');
        console.log(longLivedToken);
        console.log('==================================================\n');

    } catch (error) {
        console.error('❌ Tokenni almashtirishda xatolik yuz berdi:', error.response?.data || error.message);
    }
}

generateLongLivedToken();