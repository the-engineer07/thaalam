/**
 * THAALAM SECURE PRODUCTION SERVER (Node.js / Express)
 * Provides production-grade security headers, compression, and static file serving
 */

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Enable Gzip/Brotli compression for all responses
app.use(compression());

// 2. Comprehensive Security Headers via Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https:"],

        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          // Supabase SDK
          "https://cdn.jsdelivr.net",
          "https://*.supabase.co",
          // Font Awesome (used in join.html, our_story.html)
          "https://cdnjs.cloudflare.com",
          // Google APIs (Maps, Fonts scripts, etc.)
          "https://apis.google.com",
          "https://accounts.google.com"
        ],

        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          // Font Awesome CSS
          "https://cdnjs.cloudflare.com"
        ],

        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          // Font Awesome webfonts
          "https://cdnjs.cloudflare.com"
        ],

        imgSrc: [
          "'self'",
          "data:",
          "https:",
          "https://images.unsplash.com",
          "https://*.supabase.co",
          // Partner logos
          "https://vyiom.in",
          // Admin login background (Unsplash direct)
          "https://images.unsplash.com"
        ],

        connectSrc: [
          "'self'",
          // Supabase DB + Auth + Storage
          "https://*.supabase.co",
          "https://*.supabase.in",
          // Google Apps Script & Sheets GViz API
          "https://script.google.com",
          "https://script.googleusercontent.com",
          "https://docs.google.com",
          "https://*.googleapis.com"
        ],

        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    // Allow cross-origin resource loading (images, fonts from CDNs)
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

// 3. Serve static files with 1-day cache
//    etag + lastModified ensure browsers revalidate changed files
app.use(express.static(path.join(__dirname), {
  maxAge: '1d',
  etag: true,
  lastModified: true,
  // Don't cache HTML files — always revalidate so updates are instant
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));

// 4. Root: redirect to splash page for first-time visitors
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'splash.html'));
});

// 5. Explicit route for the main app entry
app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 6. Serve 404.html for any unmatched route
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`[Thalam] Server running at http://localhost:${PORT}`);
});
