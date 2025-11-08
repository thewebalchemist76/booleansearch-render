# Boolean Search - Qwant Scraper

Scraping automatico di Qwant con Puppeteer su Render.com

## Deploy

### Backend
1. Vai su [render.com](https://render.com/)
2. New → Web Service
3. Connect repository → seleziona la cartella `backend`
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Deploy!

### Frontend  
1. Render.com → New → Static Site
2. Connect repository → seleziona la cartella `frontend`
3. Build Command: `npm install && npm run build`
4. Publish Directory: `dist`
5. Environment Variable: `VITE_API_URL` = URL del backend (es: `https://your-backend.onrender.com`)
6. Deploy!