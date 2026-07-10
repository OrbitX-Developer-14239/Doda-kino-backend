import '../config/index.js'; // Bu konfiguratsiyani va dotenv'ni avtomatik ishga tushiradi
import { InstagramService } from '../services/instagram.service.js';

async function runTest() {
  try {
    const instagram = new InstagramService();
    
    const testVideo = 'https://www.w3schools.com/html/mov_bbb.mp4';
    const caption = 'Doda Kino backend orqali avtomatik yuklangan ilk Reels! #dodakino #node #api';

    console.log('🚀 Test yuklanishi boshlandi...');
    const postId = await instagram.uploadReels(testVideo, caption);
    console.log(`✨ Zo'r! Reels muvaffaqiyatli chiqdi. Post ID: ${postId}`);
  } catch (error) {
    console.error('❌ Testda xatolik:', error.message);
  }
}

runTest();