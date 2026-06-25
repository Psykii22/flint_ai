 # Security Architecture Review: Billing Watchman

As a senior solutions architect, I've identified **critical vulnerabilities** across your schema and architecture. Here's my assessment organized by severity:

---

## 🔴 CRITICAL VULNERABILITIES

### 1. **Credential Storage in Plain Text**
```sql
credentials text NOT NULL CHECK (credentials IS NOT NULL AND length(TRIM(BOTH FROM credentials)) > 100)
```

**Problem:** Cloud provider credentials stored in plaintext with only length validation.

**Attack Scenario:** 
- SQL injection → credential exfiltration → attacker owns customer AWS/GCP accounts
- Insider threat with DB read access harvests all credentials

**Recommendation:**
```sql
-- Remove credentials from cloud_accounts entirely
-- Store only reference to external secret manager
ALTER TABLE cloud_accounts DROP COLUMN credentials;
ALTER TABLE cloud_accounts ADD COLUMN credentials_secret_ref text NOT NULL;

-- Use AWS Secrets Manager / HashiCorp Vault / Azure Key Vault
-- Access via IAM role assumption, never long-term credentials
```

---

### 2. **Missing Row-Level Security (RLS) Enforcement**
```sql
-- audit_log table allows NULL account_id/user_id
account_id uuid,  -- nullable!
user_id uuid,     -- nullable!
```

**Problem:** Audit logs can be orphaned or cross-tenant accessible. No guarantee `user_id` in query matches `account_id` ownership.

**Schema Fix:**
```sql
-- Make relationships mandatory where appropriate
ALTER TABLE audit_log ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE audit_log ALTER COLUMN user_id SET NOT NULL;

-- Add explicit ownership chain
ALTER TABLE audit_log ADD CONSTRAINT audit_log_account_user_consistent 
  CHECK (user_id = (SELECT user_id FROM cloud_accounts WHERE id = account_id));
```

**Architecture Fix:** Enforce RLS policies in Postgres:
```sql
CREATE POLICY user_isolation ON cloud_accounts 
  FOR ALL USING (user_id = current_setting('app.current_user_id')::uuid);
```

---

### 3. **Unprotected `raw_metadata` JSONB Fields**
```sql
raw_metadata jsonb,      -- billing_data
metadata jsonb,          -- audit_log
```

**Problem:** No schema validation or PII scrubbing. Attackers can:
- Inject malicious nested structures (log injection, NoSQL-style attacks)
- Exfiltrate sensitive data embedded in vendor responses

**Recommendation:**
```sql
-- Add JSON Schema validation trigger or use domain type
CREATE DOMAIN sanitized_jsonb AS jsonb CHECK (
  -- Reject keys matching sensitive patterns
  NOT (value::text ~* '(password|secret|key|token|credential)')
);

-- Implement edge function to normalize/scrub before storage
```

---

## 🟠 HIGH SEVERITY

### 4. **Inconsistent Foreign Key Targets**
```sql
audit_log:      user_id → auth.users(id)      -- Supabase Auth
billing_data:   user_id → public.profiles(id)  -- Your table
```

**Problem:** Split identity sources create authorization confusion. `profiles.id` ≠ `auth.users.id` integrity risk.

**Recommendation:** Single source of truth:
```sql
-- All user_id FKs point to auth.users
-- Profiles becomes extension table with 1:1 relationship
ALTER TABLE billing_data DROP CONSTRAINT billing_data_user_id_fkey;
ALTER TABLE billing_data ADD CONSTRAINT billing_data_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- Add trigger to auto-create profile on auth user creation
```

---

### 5. **Cost Field Allows Negative Values**
```sql
cost_usd numeric CHECK (cost_usd >= '-100000'::integer::numeric)
```

**Problem:** Negative costs enable fraud (refund manipulation, balance inflation). The `-100000` floor is arbitrary business logic in schema.

**Recommendation:**
```sql
-- Separate refunds to explicit table with approval workflow
ALTER TABLE billing_data ADD CONSTRAINT cost_usd_positive 
  CHECK (cost_usd >= 0);

-- Refunds via billing_adjustments table with audit trail
CREATE TABLE billing_adjustments (
  id uuid PRIMARY KEY,
  original_billing_id uuid REFERENCES billing_data(id),
  adjustment_type text CHECK (adjustment_type IN ('refund', 'credit', 'correction')),
  amount_usd numeric NOT NULL CHECK (amount_usd > 0),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamp with time zone,
  -- require dual control for large amounts
  CONSTRAINT large_adjustment_requires_approval CHECK (
    amount_usd < 10000 OR approved_by IS NOT NULL
  )
);
```

---

### 6. **No Encryption at Rest for Sensitive Data**
```sql
external_account_id text NOT NULL,  -- AWS account IDs are sensitive
phone_number text UNIQUE,           -- PII
```

**Problem:** Regulatory compliance (GDPR, CCPA) violation. Data readable from backups, logs, replicas.

**Recommendation:** 
- Enable **TDE** on Tiger Cloud Postgres
- Column-level encryption for PII:
```sql
-- Use pgcrypto with KMS-managed keys
ALTER TABLE profiles ALTER COLUMN phone_number 
  TYPE bytea USING pgp_sym_encrypt(phone_number, current_setting('app.encryption_key'));
```

---

## 🟡 MEDIUM SEVERITY

### 7. **Architecture: Missing API Gateway / WAF**
```
Frontend → FastAPI (direct exposure)
```

**Problem:** No rate limiting, DDoS protection, or request validation layer. `credentials` endpoint particularly vulnerable.

**Recommendation:**
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   CloudFlare/    │────→│  AWS API    │────→│  FastAPI    │
│   AWS WAF       │     │  Gateway    │     │  (private)  │
│   + Rate Limit   │     │  + Validation│    │             │
└─────────────┘     └─────────────┘     └─────────────┘
```

---

### 8. **Missing Database Connection Security**
```
postgres.py (Supabase + TigerCloud connections)
```

**Problem:** Connection strings likely contain passwords. No mention of:
- mTLS certificate authentication
- Connection pooling with max connection limits
- Query timeout enforcement

**Recommendation:**
```python
# Use IAM authentication, never passwords
# Connection with SSL mode verify-full
DATABASE_URL = "postgresql://?sslmode=verify-full&sslrootcert=/path/to/ca"

# Implement query timeouts at layer level
async with async_timeout.timeout(30):  # Kill slow queries
    result = await conn.fetch(query)
```

---

### 9. **Agent Architecture: Privilege Escalation Risk**
```
src/agents/ (billing_agent, guard_agent)
```

**Problem:** "Agents" imply autonomous operations with cloud credentials. No described:
- Least-privilege IAM roles
- Approval workflows for destructive actions
- Agent action audit trail separate from application logs

**Recommendation:** Implement zero-trust agent model:
```
┌─────────────┐     ┌─────────────────────┐     ┌─────────────┐
│   Agent      │────→│  Temporary IAM      │────→│  Cloud API  │
│   Request    │     │  Credentials (STS)  │     │             │
│   (signed)   │     │  15-min expiration  │     │             │
└─────────────┘     └─────────────────────┘     └─────────────┘
         ↑
    ┌────┴────┐
    │ Human   │  ← Required for >$X spend or sensitive actions
    │ Approval │
    └─────────┘
```

---

### 10. **TimescaleDB Metrics: Potential Data Poisoning**
```
┌─────────────┐
│ TimescaleDB │
│  (Metrics)  │
└─────────────┘
```

**Problem:** If metrics drive anomaly detection (`is_anomaly` flag), compromised metrics → false negatives on attacks.

**Recommendation:** Metrics integrity verification:
```python
# Sign metrics at source, verify before anomaly detection
metric = {
    "timestamp": "2024-01-15T10:00:00Z",
    "value": 150.00,
    "signature": hmac_sha256(secret, canonical_json(metric_without_sig))
}
```

---

## 📋 PRIORITIZED REMEDIATION ROADMAP

| Priority | Item | Effort | Impact |
|---------|------|--------|--------|
| P0 | Move credentials to secret manager | 2 days | Critical |
| P0 | Implement RLS policies | 1 day | Critical |
| P1 | Unify auth schema (auth.users) | 2 days | High |
| P1 | Add API Gateway with rate limiting | 3 days | High |
| P2 | Column-level encryption for PII | 3 days | Medium |
| P2 | JSON schema validation | 2 days | Medium |
| P3 | Agent zero-trust architecture | 1 week | Medium |
| P3 | Metrics signing | 2 days | Low |

---

## Additional Architecture Recommendations

1. **Database per tenant** consideration for enterprise customers (currently row-level isolation only)

2. **Credential rotation automation**: Tiger Cloud supports automatic rotation—enable it

3. **Data residency**: `raw_metadata` may contain EU customer data; ensure Tiger Cloud region compliance

4. **Backup encryption**: Verify Tiger Cloud backups are encrypted with customer-managed keys

Want me to elaborate on any specific vulnerability or provide implementation code for the mitigations?