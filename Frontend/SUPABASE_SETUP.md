# Supabase Setup Guide

This guide explains how to configure Supabase authentication and collection sync for BibleFetch.

## Prerequisites

1. A Supabase account (sign up at [supabase.com](https://supabase.com))
2. A Supabase project created

---

## Step 1: Get Your Supabase Credentials

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Select your project
3. Navigate to **Settings** → **API**
4. Copy these two values:
   - **Project URL** (looks like `https://xxxxxxxxxxxxx.supabase.co`)
   - **anon public** key (long JWT token starting with `eyJhbGc...`)

> ⚠️ **Important**: Use the **anon/public** key, NOT the service_role key!

---

## Step 2: Run the Database Setup Script

1. In your Supabase project, go to the **SQL Editor**
2. Open the file `Frontend/supabase_setup.sql`
3. Copy the entire contents
4. Paste it into the Supabase SQL Editor
5. Click **Run** or press `Ctrl+Enter`

This creates:
- `user_collections` table
- Row Level Security (RLS) policies (users can only access their own data)
- Automatic `updated_at` timestamp triggers
- Proper indexes for performance

---

## Step 3: Configure the App

### For Local Development:

1. Navigate to `http://localhost:4200/auth` (or your dev server port)
2. You'll see a **Supabase konfiguráció** section (only shown if not configured yet)
3. Paste your:
   - **Supabase URL**
   - **Supabase Anon Key**
4. Click **"Mentés & Folytatás"**

The credentials are saved to `localStorage` for local testing.

### For Production (Vercel):

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add these two variables:

   | Name | Value |
   |------|-------|
   | `SUPABASE_URL` | Your project URL |
   | `SUPABASE_ANON_KEY` | Your anon public key |

4. Make sure to add them for all environments (Production, Preview, Development)
5. Redeploy your app (or trigger a new build)

Vercel will inject these as environment variables that the app will read via `window.__SB_URL__` and `window.__SB_KEY__`.

---

## Step 4: Test Authentication

1. Navigate to `/auth` on your app
2. Click **"Regisztráció"** to create a test account
3. Enter an email and password (min 6 characters)
4. Check your email for the confirmation link (if email confirmation is enabled in Supabase)
5. Try signing in with your credentials

---

## Step 5: Test Collection Sync

1. Sign in to your account
2. Go to `/bible` and add some verses to a collection (bookmark icon)
3. Go to `/profile` and click **"Szinkronizálás → Supabase"**
4. Verify in Supabase:
   - Go to **Table Editor** → `user_collections`
   - You should see your row with user_id and JSON data

---

## Troubleshooting

### "Supabase not configured" error
- Make sure you've run the SQL setup script
- Verify your credentials are correct (no extra spaces)
- Check browser console for detailed error messages

### "Auth session missing" error
- You're not logged in — go to `/auth` to sign in
- Session may have expired — sign out and sign in again

### Email confirmation issues
- In Supabase: **Authentication** → **Settings** → disable email confirmation for testing
- Or use a real email and check spam folder

### RLS policy errors
- Make sure the SQL script ran successfully
- Check **Authentication** → **Policies** in Supabase to see if policies exist
- The policies ensure users can only access their own collections

---

## How It Works

1. **LocalStorage**: Collections are always stored locally for offline access
2. **Supabase**: When logged in, you can sync collections to the cloud
3. **Merge Logic**: When syncing, newer collections (by `last_modified` timestamp) win
4. **Security**: Row Level Security ensures users can only access their own data

---

## Environment Variables Reference

### Development (localStorage-based)
```javascript
localStorage.setItem('supabase_url', 'https://xxx.supabase.co');
localStorage.setItem('supabase_anon_key', 'eyJhbGc...');
```

### Production (Vercel environment variables)
Set these in Vercel dashboard → Settings → Environment Variables:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Angular app reads them via injected globals:
```javascript
window.__SB_URL__
window.__SB_KEY__
```

---

## Security Best Practices

✅ **DO:**
- Use the anon/public key (safe for client-side)
- Enable RLS policies (already done in SQL script)
- Use environment variables for production
- Enable email verification in Supabase settings

❌ **DON'T:**
- Don't use the `service_role` key in the frontend
- Don't commit credentials to git
- Don't disable RLS policies

---

## Need Help?

- Supabase Docs: [https://supabase.com/docs](https://supabase.com/docs)
- Supabase Auth Guide: [https://supabase.com/docs/guides/auth](https://supabase.com/docs/guides/auth)
