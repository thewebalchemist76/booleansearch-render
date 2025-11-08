const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
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
      timeout: 60000  // Increase browser launch timeout
    });

    const page = await browser.newPage();

    // Aggressive optimization
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      // Block unnecessary resources
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
      waitUntil: 'domcontentloaded',  // Less strict than networkidle
      timeout: 45000
    });

    console.log('Page loaded, waiting for results...');

    // Wait a bit for JS to render
    await page.waitForTimeout(3000);

    // Try to wait for results, but don't fail if not found
    try {
      await page.waitForSelector('.gW4ak span', { timeout: 5000 });
    } catch (e) {
      console.log('Selector not found immediately, continuing anyway...');
    }

    // Extract data using Web Scraper selectors
    const result = await page.evaluate(() => {
      // Title selector: .gW4ak span
      const titleElement = document.querySelector('.gW4ak span');
      const title = titleElement ? titleElement.textContent.trim() : '';

      // Link selector: .Fqopp a
      const linkElement = document.querySelector('.Fqopp a');
      const url = linkElement ? linkElement.href : '';

      // Description selector: div.aVNer
      const descElement = document.querySelector('div.aVNer');
      const description = descElement ? descElement.textContent.trim() : '';

      return { title, url, description };
    });

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