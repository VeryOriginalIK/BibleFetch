#!/usr/bin/env node

/**
 * inject-env.js
 * Replaces __SUPABASE_URL__ and __SUPABASE_ANON_KEY__ placeholders in index.html
 * with actual environment variables from Vercel or local .env
 */

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'dist', 'frontend', 'browser', 'index.html');

if (!fs.existsSync(indexPath)) {
  console.warn('⚠️  index.html not found at:', indexPath);
  console.warn('Skipping env injection (probably running in dev mode)');
  process.exit(0);
}

let html = fs.readFileSync(indexPath, 'utf8');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

html = html.replace('__SUPABASE_URL__', supabaseUrl);
html = html.replace('__SUPABASE_ANON_KEY__', supabaseKey);

fs.writeFileSync(indexPath, html, 'utf8');

console.log('✅ Environment variables injected into index.html');
if (supabaseUrl) console.log('   SUPABASE_URL:', supabaseUrl.substring(0, 30) + '...');
if (supabaseKey) console.log('   SUPABASE_ANON_KEY:', supabaseKey.substring(0, 30) + '...');
if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️  Missing Supabase credentials - users will need to configure manually');
}
