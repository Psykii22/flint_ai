CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  phone_number TEXT UNIQUE,
  billing_plan_id INTEGER DEFAULT 1 CHECK (billing_plan_id = ANY (ARRAY[1, 2, 3])),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Cloud Accounts table
CREATE TABLE public.cloud_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL CHECK (provider = ANY (ARRAY['aws'::text, 'gcp'::text, 'azure'::text])),
  account_name TEXT,
  external_account_id TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  credentials JSONB,
  CONSTRAINT cloud_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- Billing Data table (with S3 URL for raw data)
CREATE TABLE public.billing_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL,
  user_id UUID NOT NULL,
  cost_usd NUMERIC NOT NULL CHECK (cost_usd >= '-100000'::integer::numeric AND cost_usd <= 1000000::numeric),
  event_time TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_anomaly BOOLEAN,
  raw_data_url TEXT,
  cost_saved_usd NUMERIC,
  CONSTRAINT billing_data_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.cloud_accounts(id) ON DELETE CASCADE,
  CONSTRAINT billing_data_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- Audit Log table
CREATE TABLE public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID,
  user_id UUID,
  action TEXT NOT NULL,
  performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  success BOOLEAN NOT NULL,
  error_code TEXT,
  metadata_url JSONB,
  CONSTRAINT audit_log_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.cloud_accounts(id),
  CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Users can manage own profile" ON public.profiles 
  FOR ALL USING (auth.uid() = id);

-- Cloud Accounts Policies
CREATE POLICY "Users can select own cloud accounts" ON public.cloud_accounts 
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cloud accounts" ON public.cloud_accounts 
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own cloud accounts" ON public.cloud_accounts 
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own cloud accounts" ON public.cloud_accounts 
  FOR DELETE USING (auth.uid() = user_id);

-- Billing Data Policies (hide raw_data_url from frontend)
CREATE POLICY "Users can view own billing data" ON public.billing_data 
  FOR SELECT USING (auth.uid() = user_id);

-- Audit Log Policies
CREATE POLICY "Users can view own audit logs" ON public.audit_log 
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service can insert audit logs" ON public.audit_log 
  FOR INSERT WITH CHECK (TRUE);

-- Trigger: Create profile on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Index for performance
CREATE INDEX idx_billing_data_user_time ON public.billing_data(user_id, event_time DESC);
CREATE INDEX idx_billing_data_anomaly ON public.billing_data(user_id, is_anomaly) WHERE is_anomaly = TRUE;
CREATE INDEX idx_audit_log_user ON public.audit_log(user_id);
CREATE INDEX idx_cloud_accounts_user ON public.cloud_accounts(user_id);