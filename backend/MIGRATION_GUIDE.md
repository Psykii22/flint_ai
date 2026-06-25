# ArcOps: FastAPI → TanStack Start + Supabase Migration Guide

## Executive Summary

You're planning to migrate from:
- **Current**: FastAPI backend + Vite frontend (two separate servers)
- **Target**: TanStack Start full-stack framework + Supabase (single deployment)

This guide covers the **optimal architecture** for your use case.

---

## 🏗️ Current Architecture Analysis

### Existing Components

| Component | Current Tech | Purpose |
|-----------|-------------|---------|
| **Auth** | FastAPI (`login_register.py`) | Email OTP, Mobile OTP, Phone update, Google OAuth |
| **Cloud Account Storage** | FastAPI + Supabase | AWS/GCP credentials management |
| **Background Jobs** | Python Worker (`worker.py`) | Billing sync, anomaly detection, WhatsApp alerts |
| **Frontend** | Vite (React) | Auth Modal, Cloud credentials UI |
| **Database** | Supabase (PostgreSQL) | User profiles, credentials, billing data |

### Current Flow Issues

1. **Separation of Concerns**: Auth logic split between FastAPI and Supabase
2. **Credential Handling**: AWS/GCP creds stored in Supabase, retrieved by FastAPI
3. **Worker Triggering**: Currently pull-based or scheduled (need to check cron config)
4. **Frontend-Backend Communication**: Multiple API calls, session management fragmented

---

## 🎯 Recommended Architecture: **Hybrid Approach**

### Option Comparison

```
┌─────────────────────────────────────────────────────────────┐
│                        OPTIONS                              │
├──────────────┬──────────────┬──────────────┬─────────────────┤
│  Criteria    │ Edge Funcs   │Server Files  │ Hybrid (✓ BEST) │
├──────────────┼──────────────┼──────────────┼─────────────────┤
│ Auth Flow    │ Poor         │ Excellent    │ Excellent       │
│ Session Mgmt │ Limited      │ Excellent    │ Excellent       │
│ DB Ops       │ Good         │ Excellent    │ Excellent       │
│ Worker Jobs  │ Poor*        │ Good         │ Excellent       │
│ Cost         │ Low          │ Moderate     │ Moderate        │
│ Latency      │ Low*         │ Higher       │ Optimal         │
│ Cold starts  │ ~1s          │ ~0.5s        │ Minimal         │
└──────────────┴──────────────┴──────────────┴─────────────────┘

* Edge Functions are not suitable for long-running workers (billing sync, anomaly detection)
  Max execution time: 10 seconds (Supabase limit)
```

### Recommended: **TanStack Start + Server Files + Supabase Triggers + Edge Functions**

```
┌─────────────────────────────────────────────────────────────┐
│                  PROPOSED ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │           Frontend (TanStack Start)                 │  │
│  │  - AuthModal (Login, Register, Phone Update)       │  │
│  │  - Cloud Credentials UI                            │  │
│  │  - Dashboard                                       │  │
│  └────────────────────┬────────────────────────────────┘  │
│                       │                                    │
│                       ↓                                    │
│  ┌─────────────────────────────────────────────────────┐  │
│  │    TanStack Start Server Files (API Routes)        │  │
│  │  /routes/api/auth/*.ts                             │  │
│  │  /routes/api/credentials/*.ts                      │  │
│  │  - Direct Supabase integration                     │  │
│  │  - Session management (via cookies)                │  │
│  │  - User profile creation                           │  │
│  └────────────────────┬────────────────────────────────┘  │
│                       │                                    │
│       ┌───────────────┼───────────────┐                   │
│       ↓               ↓               ↓                   │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐      │
│  │  Supabase   │  │  Postgres   │  │  Edge Funcs  │      │
│  │  Auth       │  │  Profiles   │  │  (optional)  │      │
│  │  Storage    │  │  Credentials│  │  - Webhooks  │      │
│  │  Real-time  │  │  Billing    │  │  - Post-auth │      │
│  └─────────────┘  └─────┬───────┘  └──────────────┘      │
│                         │                                 │
│          ┌──────────────┴──────────────┐                  │
│          ↓                             ↓                  │
│    ┌──────────────┐           ┌────────────────┐         │
│    │ pg_notify()  │           │ Cloud Worker   │         │
│    │ trigger      │           │ (Python/Node)  │         │
│    └──────────────┘           │ - Billing Sync │         │
│                               │ - Anomalies    │         │
│                               │ - WhatsApp     │         │
│                               └────────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 Implementation Roadmap

### Phase 1: Set Up TanStack Start Project

```bash
# 1. Initialize TanStack Start
npm create @tanstack/start@latest arcops-full-stack
cd arcops-full-stack

# 2. Install dependencies
npm install @supabase/supabase-js @supabase/auth-helpers-remix cookie

# 3. Configure environment variables
cat > .env.local << 'EOF'
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key (server-only)
WORKER_WEBHOOK_SECRET=your-secret-key
EOF
```

---

## 🔐 Migrating login_register.py to TanStack Start

### Auth Routes to Build

**File structure**:
```
landing_page/src/routes/api/auth/
├── send-email-otp.ts
├── verify-email-otp.ts
├── send-mobile-otp.ts
├── verify-mobile-otp.ts
├── login/
│   ├── email-otp.ts
│   └── verify.ts
└── google-verify.ts
```

**Quick snippets** for porting `login_register.py`:

```typescript
// src/routes/api/auth/send-email-otp.ts
import { supabaseServer } from '@/lib/supabase-server'

export async function POST({ request }: { request: Request }) {
  const { email } = await request.json()
  try {
    await supabaseServer.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })
    return Response.json({ message: 'OTP sent to your email' })
  } catch (err: any) {
    return Response.json({ detail: err.message }, { status: 400 })
  }
}
```

```typescript
// src/routes/api/auth/verify-email-otp.ts
import { supabaseServer } from '@/lib/supabase-server'

export async function POST({ request }: { request: Request }) {
  const { email, otp } = await request.json()
  try {
    const { data, error } = await supabaseServer.auth.verifyOtp({
      email,
      token: otp,
      type: 'signup',
    })

    if (error) throw error

    // Upsert profile
    await supabaseServer
      .from('profiles')
      .upsert({
        id: data.user.id,
        email: data.user.email,
        updated_at: new Date().toISOString(),
      })

    return Response.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user_id: data.user.id,
    })
  } catch (err: any) {
    return Response.json({ detail: err.message }, { status: 400 })
  }
}
```

```typescript
// src/routes/api/auth/send-mobile-otp.ts
import { supabaseServer } from '@/lib/supabase-server'

export async function POST({ request }: { request: Request }) {
  const { mobile, access_token, refresh_token } = await request.json()
  try {
    await supabaseServer.auth.setSession({
      access_token,
      refresh_token,
    })
    
    await supabaseServer.auth.signInWithOtp({
      phone: mobile,
    })
    
    return Response.json({ message: 'OTP sent to your mobile' })
  } catch (err: any) {
    return Response.json({ detail: err.message }, { status: 400 })
  }
}
```

```typescript
// src/routes/api/auth/verify-mobile-otp.ts
import { supabaseServer } from '@/lib/supabase-server'

export async function POST({ request }: { request: Request }) {
  const { mobile, otp, access_token, refresh_token } = await request.json()
  try {
    await supabaseServer.auth.setSession({
      access_token,
      refresh_token,
    })

    const { data, error } = await supabaseServer.auth.verifyOtp({
      phone: mobile,
      token: otp,
      type: 'phone_change',
    })

    if (error) throw error

    // Update profile
    await supabaseServer
      .from('profiles')
      .upsert({
        id: data.user.id,
        phone_number: data.user.phone,
        updated_at: new Date().toISOString(),
      })

    return Response.json({
      message: 'Phone verified',
      access_token,
      user_id: data.user.id,
    })
  } catch (err: any) {
    return Response.json({ detail: err.message }, { status: 400 })
  }
}
```

---

## 🔐 Auth Flow: TanStack Start Implementation

### Step 1: Create Auth Server Routes

**File**: `src/routes/api/auth/send-email-otp.ts`

```typescript
import { json } from '@tanstack/start'
import { supabase } from '@/lib/supabase-server'

export async function POST({ request }: { request: Request }) {
  const { email } = await request.json()

  if (!email) {
    return json({ detail: 'Email required' }, { status: 400 })
  }

  try {
    // Supabase Auth: Sign in with OTP (creates user if doesn't exist)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })

    if (error) throw error

    return json({ message: 'OTP sent to your email' })
  } catch (err: any) {
    return json(
      { detail: err.message || 'Failed to send OTP' },
      { status: 400 }
    )
  }
}
```

**File**: `src/routes/api/auth/verify-email-otp.ts`

```typescript
import { json } from '@tanstack/start'
import { supabase } from '@/lib/supabase-server'
import { setCookie } from 'cookie'

export async function POST({ request }: { request: Request }) {
  const { email, otp } = await request.json()

  try {
    // Verify OTP and get session
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'signup',
    })

    if (error) throw error
    if (!data.session) throw new Error('No session returned')

    // Ensure profile exists
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: data.user.id,
        email: data.user.email,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (profileError && profileError.code !== 'PGRST116') throw profileError

    // Set secure HTTP-only cookie
    const headers = new Headers({
      'Set-Cookie': setCookie('session', data.session.access_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      }),
    })

    return json(
      {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user_id: data.user.id,
      },
      { headers }
    )
  } catch (err: any) {
    return json(
      { detail: err.message || 'OTP verification failed' },
      { status: 400 }
    )
  }
}
```

---

### Step 2: Mobile OTP & Phone Update

**File**: `src/routes/api/auth/send-mobile-otp.ts`

```typescript
import { json } from '@tanstack/start'
import { supabase } from '@/lib/supabase-server'

export async function POST({ request }: { request: Request }) {
  const { mobile, access_token, refresh_token } = await request.json()

  try {
    // Set session from provided tokens
    const { error: setError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    })

    if (setError) throw setError

    // Send OTP to phone
    const { error } = await supabase.auth.signInWithOtp({
      phone: mobile,
      options: { shouldCreateUser: false },
    })

    if (error) throw error

    return json({ message: 'OTP sent to your mobile' })
  } catch (err: any) {
    return json(
      { detail: err.message || 'Failed to send mobile OTP' },
      { status: 400 }
    )
  }
}
```

---

### Step 3: Cloud Credentials Storage

**Database Schema** (Supabase):

```sql
-- cloud_credentials table
CREATE TABLE cloud_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('aws', 'gcp')),
  label TEXT NOT NULL,
  encrypted_creds JSONB NOT NULL, -- Encrypted AWS/GCP creds
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE (user_id, label)
);

-- Enable RLS
ALTER TABLE cloud_credentials ENABLE ROW LEVEL SECURITY;

-- Only user can see their own credentials
CREATE POLICY "Users see own credentials" ON cloud_credentials
  FOR SELECT USING (auth.uid() = user_id);

-- Audit trigger
CREATE TABLE cloud_credentials_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID REFERENCES cloud_credentials(id),
  user_id UUID,
  action TEXT,
  timestamp TIMESTAMP DEFAULT now()
);
```

**File**: `src/routes/api/credentials/add.ts`

```typescript
import { json } from '@tanstack/start'
import { getServerSession } from '@/lib/auth-server'
import { supabase } from '@/lib/supabase-server'
import { encryptCredentials } from '@/lib/encryption'

export async function POST({ request }: { request: Request }) {
  try {
    const session = await getServerSession(request)
    if (!session) return json({ detail: 'Unauthorized' }, { status: 401 })

    const { provider, label, credentials } = await request.json()

    // Encrypt credentials before storage
    const encrypted = encryptCredentials(credentials)

    const { data, error } = await supabase
      .from('cloud_credentials')
      .insert({
        user_id: session.user.id,
        provider,
        label,
        encrypted_creds: encrypted,
      })
      .select()
      .single()

    if (error) throw error

    // Trigger background worker via pg_notify
    await supabase.rpc('notify_billing_sync', {
      credential_id: data.id,
      user_id: session.user.id,
    })

    return json(
      { message: 'Credentials saved', id: data.id },
      { status: 201 }
    )
  } catch (err: any) {
    console.error(err)
    return json(
      { detail: err.message || 'Failed to save credentials' },
      { status: 400 }
    )
  }
}
```

---

## 🔄 Background Jobs: Worker Implementation

### Option A: PostgreSQL Triggers + External Worker (Recommended)

**Supabase PostgreSQL Function**:

```sql
-- Function to trigger background worker
CREATE OR REPLACE FUNCTION notify_billing_sync(
  credential_id UUID,
  user_id UUID
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Notify channel with job details
  PERFORM pg_notify(
    'billing_sync_jobs',
    json_build_object(
      'credential_id', credential_id,
      'user_id', user_id,
      'timestamp', now()
    )::text
  );
END;
$$;

-- Trigger on new credentials
CREATE OR REPLACE TRIGGER trigger_new_credential_sync
AFTER INSERT ON cloud_credentials
FOR EACH ROW
EXECUTE FUNCTION notify_billing_sync(NEW.id, NEW.user_id);
```

**Worker (Python/Node.js)** - Runs externally (Docker, Lambda, etc):

```python
# worker/listener.py
import asyncio
import json
import os
from supabase import create_client, Client
from src.services.aws import AWSService
from src.services.gcp import GCPService

class BillingWorker:
    def __init__(self):
        self.supabase: Client = create_client(
            os.getenv('SUPABASE_URL'),
            os.getenv('SUPABASE_SERVICE_KEY')
        )
        self.current_jobs = set()

    async def listen_for_jobs(self):
        """Listen to PostgreSQL channel for billing sync jobs"""
        try:
            # Subscribe to channel
            channel = self.supabase.realtime.channel('billing_sync_jobs')
            channel.on('*', self.process_job).subscribe()
            
            while True:
                await asyncio.sleep(1)
        except Exception as e:
            print(f"❌ Worker error: {e}")
            await asyncio.sleep(5)  # Retry after 5s
            await self.listen_for_jobs()

    async def process_job(self, payload):
        """Process a single billing sync job"""
        try:
            msg = json.loads(payload['payload'])
            job_id = f"{msg['user_id']}:{msg['credential_id']}"
            
            if job_id in self.current_jobs:
                return  # Skip if already processing
            
            self.current_jobs.add(job_id)
            
            # Fetch credential details
            creds = self.supabase.table('cloud_credentials') \
                .select('*') \
                .eq('id', msg['credential_id']) \
                .single() \
                .execute()
            
            if not creds.data:
                return
            
            # Decrypt credentials
            creds_dict = decrypt_credentials(creds.data['encrypted_creds'])
            
            # Run billing sync
            await self.sync_billing(
                creds.data['provider'],
                creds_dict,
                msg['user_id'],
                creds.data['id']
            )
            
            print(f"✅ Sync completed for {job_id}")
        except Exception as e:
            print(f"❌ Job failed: {e}")
        finally:
            self.current_jobs.discard(job_id)

    async def sync_billing(self, provider, creds, user_id, credential_id):
        """Execute actual billing sync"""
        if provider == 'aws':
            service = AWSService(creds)
        elif provider == 'gcp':
            service = GCPService(creds)
        else:
            return

        # Extract billing data
        enriched_data = service.get_enriched_billing(days=1)
        
        # Store in Supabase
        self.supabase.table('billing_data').insert([
            {
                'user_id': user_id,
                'credential_id': credential_id,
                'provider': provider,
                'data': item,
                'created_at': 'now()'
            }
            for item in enriched_data
        ]).execute()
        
        # Detect anomalies & send WhatsApp
        anomalies = [i for i in enriched_data if i.get('is_anomaly')]
        if anomalies:
            await self.send_alerts(user_id, anomalies, provider)

# Run worker
if __name__ == '__main__':
    worker = BillingWorker()
    asyncio.run(worker.listen_for_jobs())
```

---

### Option B: Supabase Edge Functions (Lightweight Jobs Only)

**Edge Function**: `supabase/functions/billing-sync/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
)

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { credential_id, user_id } = await req.json()

    // Only for lightweight tasks (< 10 seconds)
    // For heavy lifting, return job ID and trigger worker
    
    // Fetch credential
    const { data: cred } = await supabase
      .from('cloud_credentials')
      .select('*')
      .eq('id', credential_id)
      .single()

    // Decrypt & process
    // ... billing sync logic ...

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
```

---

## 🗄️ Database Schema & Migrations

Create migrations in TanStack Start:

**File**: `src/db/migrations/001_initial_schema.sql`

```sql
-- Profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  phone_number TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Cloud Credentials
CREATE TABLE cloud_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  encrypted_creds JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE (user_id, label)
);

-- Billing Data (Time-series)
CREATE TABLE billing_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  credential_id UUID REFERENCES cloud_credentials(id),
  provider TEXT,
  service_family TEXT,
  resource_id TEXT,
  cost_usd DECIMAL(10,2),
  is_anomaly BOOLEAN DEFAULT false,
  event_time TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  FOREIGN KEY (user_id) REFERENCES profiles(id)
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users see own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users see own credentials" ON cloud_credentials
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users see own billing" ON billing_data
  FOR SELECT USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_billing_user_time ON billing_data(user_id, event_time DESC);
CREATE INDEX idx_billing_anomaly ON billing_data(user_id, is_anomaly) WHERE is_anomaly = true;
```

---

## 🔒 Security Considerations

### 1. Credential Encryption

```typescript
// src/lib/encryption.ts
import crypto from 'crypto'

export function encryptCredentials(creds: Record<string, string>): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  let encrypted = cipher.update(JSON.stringify(creds), 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

export function decryptCredentials(encrypted: string): Record<string, string> {
  const [ivHex, authTagHex, encryptedHex] = encrypted.split(':')
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return JSON.parse(decrypted)
}
```

### 2. Environment Variables

```bash
# .env.local (never commit!)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=xxxxx
SUPABASE_SERVICE_ROLE_KEY=xxxxx (server only!)
ENCRYPTION_KEY=<32-byte hex key>
GOOGLE_CLIENT_ID=xxxxx
WORKER_WEBHOOK_SECRET=xxxxx
```

### 3. RLS & RBAC

Always enforce RLS policies on Supabase tables. No backend should bypass this.

---

## 📦 Migration Path: Step-by-Step

### Week 1: Setup & Auth
- [ ] Initialize TanStack Start project
- [ ] Create Supabase Auth routes
- [ ] Implement session management with cookies
- [ ] Test email/mobile OTP flows

### Week 2: Cloud Credentials
- [ ] Create cloud_credentials table & RLS
- [ ] Build encryption/decryption logic
- [ ] Implement `/api/credentials/*` routes
- [ ] Migrate credential storage logic

### Week 3: Worker & Background Jobs
- [ ] Set up PostgreSQL trigger & pg_notify
- [ ] Create Python/Node.js worker listener
- [ ] Implement billing sync in worker
- [ ] Test Postgres → Worker → WhatsApp flow

### Week 4: Frontend Migration
- [ ] Move AuthModal to TanStack Start
- [ ] Update API calls to new server routes
- [ ] Test full auth + credentials flow
- [ ] Performance testing & optimization

### Week 5: Deployment
- [ ] Deploy TanStack Start app (Vercel/Netlify)
- [ ] Deploy Worker (Docker/AWS Lambda/Railway)
- [ ] Configure Supabase Edge Functions (optional)
- [ ] Migrate existing data (data migration script)

---

## 📊 Architecture Comparison

### Current vs. Proposed

| Aspect | Current | Proposed |
|--------|---------|----------|
| **Deployment** | 2 servers (FastAPI + Vite) | 1 app (TanStack Start) + 1 worker |
| **Auth Session** | JWT tokens + cookies | Secure HTTP-only cookies + Supabase Session |
| **Database** | Supabase only | Supabase + PostgreSQL triggers |
| **Worker Jobs** | Unknown (need cron?) | Event-driven (pg_notify) |
| **Scaling** | Difficult | Easy (stateless functions) |
| **Cost** | Higher | Lower (no FastAPI server) |
| **Latency** | Slower (multiple hops) | Faster (co-located) |

---

## ✅ Key Advantages of This Approach

1. **Server Files** ✅
   - Full control over auth sessions
   - Can validate & sanitize input server-side
   - Access to environment variables securely
   - Built-in cookie management

2. **Supabase Real-time + Triggers** ✅
   - Event-driven worker (no polling)
   - Decoupled architecture
   - Scalable job queue

3. **Worker Service** ✅
   - Handles long-running jobs (billing sync)
   - Separate from request-response cycle
   - Can scale independently

4. **Edge Functions** ✅ (Optional)
   - Post-auth hooks
   - Lightweight transformations
   - Global distribution

---

## ⚠️ Gotchas & Solutions

### Gotcha 1: Long-running Jobs in Edge Functions
**Problem**: Supabase Edge Functions have 10-second timeout.  
**Solution**: Use external worker for billing sync. Edge Functions only for webhooks/triggers.

### Gotcha 2: Credential Security
**Problem**: Storing AWS/GCP keys in database.  
**Solution**: Encrypt with AES-256-GCM, use Supabase Vault for keys, enable RLS policies.

### Gotcha 3: Session Management Across Server Boundaries
**Problem**: Worker needs to access user data.  
**Solution**: Use `SUPABASE_SERVICE_ROLE_KEY` in worker (server-side only).

### Gotcha 4: Postgres Notification Delivery
**Problem**: pg_notify messages are ephemeral.  
**Solution**: If worker is down, messages are lost. Use queue table as fallback:

```sql
-- Job queue table (fallback)
CREATE TABLE billing_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID,
  user_id UUID,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT now(),
  processed_at TIMESTAMP
);

-- Insert into queue + trigger
CREATE OR REPLACE FUNCTION enqueue_billing_sync() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO billing_sync_queue (credential_id, user_id) VALUES (NEW.id, NEW.user_id);
  PERFORM pg_notify('billing_sync_jobs', json_build_object('credential_id', NEW.id)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 🚀 Deployment Targets

### TanStack Start App
- **Vercel** (recommended, native support)
- **Netlify**
- **AWS Amplify**
- **Self-hosted (Node.js)**

### Worker Service
- **AWS Lambda** (with Node.js or Python runtime)
- **Docker on ECS/Railway/Render**
- **Google Cloud Run**
- **Self-hosted (Docker)**

### Example: Docker Deployment

```dockerfile
# Dockerfile.worker
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY worker/ .
ENV PYTHONUNBUFFERED=1
CMD ["python", "listener.py"]
```

---

## 📝 Summary & Recommendation

### **Use This Stack:**

```
TanStack Start (Frontend + Server Routes)
    ↓
Supabase (Auth, PostgreSQL, Triggers, Real-time)
    ↓
Python/Node.js Worker (Long-running Jobs)
    ↓
External Services (AWS, GCP, WhatsApp, etc.)
```

### **Not This:**

❌ Edge Functions for billing sync  
❌ Single monolithic FastAPI + Vite  
❌ Pull-based workers (polling database)  
❌ Unencrypted cloud credentials in storage

### **Result:**

✅ Simpler deployment (1 app + 1 worker)  
✅ Better performance (co-located frontend + backend)  
✅ Event-driven architecture (scalable)  
✅ Secure credential handling  
✅ Easier to maintain & test

---

## 📚 Next Steps

1. **Read**: [TanStack Start Docs](https://tanstack.com/start/latest)
2. **Read**: [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
3. **Create**: Sample TanStack Start auth route (see Step 1 above)
4. **Test**: Local auth flow with Supabase
5. **Plan**: Worker deployment strategy

---

**Questions? Let's discuss the Worker implementation or security architecture!**
