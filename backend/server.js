const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chromium = require('@sparticuz/chromium');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors({
  origin: [
    'https://booleansearch-frontend.onrender.com',  // Metti il tuo URL frontend qui
    'http://localhost:5173'  // Per sviluppo locale
  ],
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Boolean Search API is running' });
});

// Search endpoint
app.post('/api/search', async (req, res) => {
  const { domain, query } = req.body;

  if (!domain || !query) {
    return res.status(400).json({ error: 'Dominio e query sono richiesti' });
  }

  const cleanDomain = domain.replace(/\.\*$/, '').replace(/\*$/, '').replace(/\.$/, '').trim();
  const searchQuery = `site:${cleanDomain} "${query}"`;

  let browser = null;

  try {
    console.log(`Starting search for: ${searchQuery}`);

    // Launch browser with optimized settings for Render.com
    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      timeout: 60000
    });

    const page = await browser.newPage();

    // Aggressive optimization
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Set user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Build Qwant URL
    const qwantUrl = `https://www.qwant.com/?q=${encodeURIComponent(searchQuery)}&t=web`;

    console.log(`Navigating to: ${qwantUrl}`);

    // Navigate with relaxed conditions
    await page.goto(qwantUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });

    console.log('Page loaded, waiting for results...');

    // Wait longer for JS to render
    await page.waitForTimeout(5000);

    // DEBUG: Get page HTML
    const html = await page.content();
    console.log('📄 Page HTML length:', html.length);
    
    // Check if we got actual content or a block page
    if (html.includes('captcha') || html.includes('blocked') || html.length < 5000) {
      console.log('⚠️ Possible block detected');
    }

    // Extract data with multiple fallback selectors
    const result = await page.evaluate(() => {
      // Try multiple selector patterns for title
      let title = '';
      let titleElement = document.querySelector('.HhS7p.gW4ak span');
      if (!titleElement) titleElement = document.querySelector('.gW4ak span');
      if (!titleElement) titleElement = document.querySelector('[class*="gW4ak"] span');
      if (!titleElement) titleElement = document.querySelector('div[class*="HhS7p"] span');
      title = titleElement ? titleElement.textContent.trim() : '';

      // Try multiple selector patterns for link
      let url = '';
      let linkElement = document.querySelector('.Fqopp a.external');
      if (!linkElement) linkElement = document.querySelector('.Fqopp a[href]');
      if (!linkElement) linkElement = document.querySelector('a.external[href*="http"]');
      if (!linkElement) linkElement = document.querySelector('div[data-testid="webResult"] a[href*="http"]');
      url = linkElement ? linkElement.href : '';

      // Description selector
      let description = '';
      const descElement = document.querySelector('.aVNer');
      if (descElement) {
        description = descElement.textContent.trim();
      }

      return { title, url, description };
    });

    console.log('Extracted result:', result);

    await browser.close();
    browser = null;

    if (result.url && result.title) {
      console.log(`✅ Found: ${result.url}`);
      return res.json({
        url: result.url,
        title: result.title,
        description: result.description,
        error: null
      });
    }

    console.log('⚠️ No results found');
    return res.json({
      url: '',
      title: '',
      description: '',
      error: 'Nessun risultato trovato su Qwant'
    });

  } catch (error) {
    if (browser) {
      await browser.close().catch(() => {});
    }

    console.error('❌ Error:', error.message);
    return res.status(500).json({
      url: '',
      title: '',
      description: '',
      error: `Errore: ${error.message}`
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});