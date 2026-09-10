import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
// Tách React và bộ biểu tượng thành chunk riêng: hai phần này gần như không đổi giữa các bản cập nhật,
// nên trình duyệt giữ lại được cache khi chỉ mã nghiệp vụ thay đổi.
export default defineConfig({plugins:[react()],server:{proxy:{'/api':'http://127.0.0.1:4000'}},build:{outDir:'dist',rollupOptions:{output:{manualChunks:{react:['react','react-dom','react-dom/client'],icons:['lucide-react']}}}}});
