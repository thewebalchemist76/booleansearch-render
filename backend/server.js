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
    // Launch browser with @sparticuz/chromium
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // Set user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Build Qwant URL
    const qwantUrl = `https://www.qwant.com/?q=${encodeURIComponent(searchQuery)}&t=web`;

    console.log(`Searching: ${qwantUrl}`);

    // Navigate to Qwant
    await page.goto(qwantUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for results
    await page.waitForSelector('.gW4ak span', { timeout: 10000 }).catch(() => null);

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

    if (result.url && result.title) {
      console.log(`Found: ${result.url}`);
      return res.json({
        url: result.url,
        title: result.title,
        description: result.description,
        error: null
      });
    }

    console.log('No results found');
    return res.json({
      url: '',
      title: '',
      description: '',
      error: 'Nessun risultato trovato su Qwant'
    });

  } catch (error) {
    if (browser) {
      await browser.close();
    }

    console.error('Error:', error.message);
    return res.status(500).json({
      url: '',
      title: '',
      description: '',
      error: `Errore Puppeteer: ${error.message}`
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});