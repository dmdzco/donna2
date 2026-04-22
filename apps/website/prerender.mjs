import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Standard client build
await build();

// 2. SSR build — compiles React components into a Node-runnable module
await build({
  build: {
    ssr: 'src/entry-server.jsx',
    outDir: 'dist-server',
  },
});

// 3. Import the SSR module
const { render } = await import('./dist-server/entry-server.js');

const distDir = path.resolve(__dirname, 'dist');
const indexPath = path.resolve(distDir, 'index.html');
const template = fs.readFileSync(indexPath, 'utf-8');

// Per-route SEO metadata
const routes = [
  {
    route: '/',
    file: 'index.html',
    title: 'Donna — A Helpful AI Assistant for Your Aging Parents',
    description: 'Donna is an AI assistant that calls your loved ones every day — offering warm conversation, gentle reminders, and meaningful connection. $19/month. Download the app today.',
    canonical: 'https://calldonna.co/',
  },
  {
    route: '/privacypolicy',
    file: 'privacypolicy.html',
    title: 'Privacy Policy — Donna',
    description: 'Donna Privacy Policy. Learn how we collect, use, and protect your personal information.',
    canonical: 'https://calldonna.co/privacypolicy',
  },
  {
    route: '/support',
    file: 'support.html',
    title: 'Support — Donna',
    description: 'Contact Donna support for account help, privacy requests, cancellation requests, and app support.',
    canonical: 'https://calldonna.co/support',
  },
  {
    route: '/third-party',
    file: 'third-party.html',
    title: 'Third-Party Services — Donna',
    description: 'Third-party services Donna uses to operate calling, AI, app, account, hosting, and support infrastructure.',
    canonical: 'https://calldonna.co/third-party',
  },
  {
    route: '/termsofservice',
    file: 'termsofservice.html',
    title: 'Terms of Service — Donna',
    description: 'Donna Terms of Service. The legal terms governing your use of the Donna service.',
    canonical: 'https://calldonna.co/termsofservice',
  },
  {
    route: '/signup',
    file: 'signup.html',
    title: 'Sign Up — Donna',
    description: 'Create your Donna account and set up daily calls for your loved one. Get started in minutes.',
    canonical: 'https://calldonna.co/signup',
  },
];

for (const r of routes) {
  const appHtml = render(r.route);
  let html = template.replace(
    '<div id="root"></div>',
    `<div id="root">${appHtml}</div>`
  );
  // Replace title
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${r.title}</title>`
  );
  // Replace description meta
  html = html.replace(
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${r.description}" />`
  );
  // Replace canonical
  html = html.replace(
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${r.canonical}" />`
  );
  // Replace og:url
  html = html.replace(
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${r.canonical}" />`
  );
  // Replace og:title
  html = html.replace(
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${r.title}" />`
  );

  fs.writeFileSync(path.resolve(distDir, r.file), html);
  console.log(`✓ Pre-rendered ${r.file}`);
}

// 4. Clean up the server build
fs.rmSync(path.resolve(__dirname, 'dist-server'), { recursive: true, force: true });

console.log('✓ All pages pre-rendered');
