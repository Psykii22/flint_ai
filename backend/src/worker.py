import os
import time
import random
from datetime import datetime, timezone

# Resilient imports to support any python launch path
try:
    from src.database.postgres import supabase
    from src.services.aws import AWSService
    from src.services.gcp import GCPService
    from src.services.autopilot import AutopilotQueue
except ImportError:
    from backend.src.database.postgres import supabase
    from backend.src.services.aws import AWSService
    from backend.src.services.gcp import GCPService
    from backend.src.services.autopilot import AutopilotQueue

class IngestionWorker:
    def __init__(self):
        self.autopilot = AutopilotQueue()
        print("🚀 Finguard Stateless Ingestion Worker initialized.")

    def run_sync_cycle(self) -> dict:
        """
        Executes a single stateless scheduler cycle:
          1. Evaluates due auto-downgrades from Upstash Redis.
          2. Pulls all due cloud accounts from the staggered schedule.
          3. Runs keyless extraction and registers cost anomalies.
          4. Staggers the next execution dynamically with jitter.
        """
        now_epoch = int(time.time())
        summary = {
            "processed_accounts_count": 0,
            "applied_optimizations_count": 0,
            "registered_alerts_count": 0,
            "errors": []
        }

        # ─── STEP 1: EVALUATE DUE AUTOPILOT DOWNGRADES ───
        try:
            print("⏳ Checking due autopilot resizes in Redis...")
            applied_opts = self.autopilot.process_due_optimizations()
            summary["applied_optimizations_count"] = len(applied_opts)
            for opt in applied_opts:
                print(f"⚡ [AUTOPILOT TRIGGER] Processing downscale for resource {opt['resource_id']} to {opt['target_size']}...")
                
                # Fetch fresh credentials from Supabase to run downgrade keylessly
                acc_res = supabase.table("cloud_accounts").select("*").eq("id", opt["cloud_account_id"]).execute()
                if acc_res.data:
                    account_data = acc_res.data[0]
                    provider = account_data["provider"]
                    credentials = account_data["credentials"]
                    
                    # Run actual downscale
                    success = False
                    if provider == "aws":
                        service = AWSService(credentials)
                        success = service.downgrade_instance(opt["resource_id"], opt["target_size"])
                    elif provider == "gcp":
                        service = GCPService(credentials)
                        success = service.downgrade_instance(opt["resource_id"], opt["target_size"])
                    
                    if success:
                        print(f"⚡ [AUTOPILOT SUCCESS] Safe physical downscale completed for {opt['resource_id']}!")
                    else:
                        print(f"⚠️ [AUTOPILOT WARNING] Physical downscale execution skipped/simulated for {opt['resource_id']}.")
                
                # Log audit entry to Supabase
                supabase.table("alerts").insert({
                    "cloud_account_id": opt["cloud_account_id"],
                    "severity": "info",
                    "message": f"Autopilot downscaled idle resource {opt['resource_id']} from {opt['current_size']} to {opt['target_size']} safely.",
                    "button": None,
                    "service": opt["service_name"]
                }).execute()
        except Exception as e:
            err_msg = f"Failed during autopilot processing: {e}"
            print(f"⚠️ {err_msg}")
            summary["errors"].append(err_msg)

        # ─── STEP 2: PROCESS DUE CLOUD ACCOUNTS INGESTION ───
        if not self.autopilot.enabled:
            # Local dev fallback when Redis is off: Pull all accounts from Supabase directly
            print("🔌 Upstash Redis offline. Running direct active sync fallback...")
            try:
                res = supabase.table("cloud_accounts").select("*").execute()
                due_accounts = [{"id": acc["id"], "account_name": acc["account_name"]} for acc in (res.data or [])]
            except Exception as e:
                print(f"❌ Supabase query failed: {e}")
                due_accounts = []
        else:
            try:
                # ZRANGEBYSCORE to pull accounts scheduled for execution (score <= now)
                due_ids = self.autopilot.r.zrangebyscore("finguard:ingestion_schedule", "-inf", now_epoch)
                due_accounts = []
                for acc_id in due_ids:
                    details = self.autopilot.r.hget(f"finguard:acc_details:{acc_id}", "account_name") or f"Account {acc_id}"
                    due_accounts.append({"id": acc_id, "account_name": details})
            except Exception as e:
                err_msg = f"Failed to pull schedule queue from Redis: {e}"
                print(f"❌ {err_msg}")
                summary["errors"].append(err_msg)
                due_accounts = []

        print(f"📋 Found {len(due_accounts)} cloud accounts due for cost sync.")

        for acc in due_accounts:
            acc_id = acc["id"]
            name = acc["account_name"]
            print(f"🔄 Syncing cost & performance for: {name}...")

            try:
                # Fetch fresh credentials from Supabase
                res = supabase.table("cloud_accounts").select("*").eq("id", acc_id).execute()
                if not res.data:
                    print(f"⚠️ Cloud account {acc_id} not found in database. Skipping.")
                    if self.autopilot.enabled:
                        self.autopilot.r.zrem("finguard:ingestion_schedule", acc_id)
                    continue
                
                account_data = res.data[0]
                provider = account_data["provider"]
                credentials = account_data["credentials"]

                # Inject cloud account context so the anomaly engine can trace the database mapping
                credentials["cloud_account_id"] = acc_id

                # Instantiate dynamic keyless service
                if provider == "aws":
                    service = AWSService(credentials)
                elif provider == "gcp":
                    service = GCPService(credentials)
                else:
                    print(f"⚠️ Unsupported provider '{provider}' for account {name}. Skipping.")
                    continue

                # Run keyless telemetry & billing extraction (internally evaluates all 8 anomaly rules!)
                enriched_data = service.get_enriched_billing(days=1)
                summary["processed_accounts_count"] += 1

                # Filter and register detected cost anomalies in Supabase
                for item in enriched_data:
                    if item.get("is_anomaly"):
                        supabase.table("alerts").insert({
                            "cloud_account_id": acc_id,
                            "severity": item.get("severity", "warning"),
                            "message": item.get("message"),
                            "button": item.get("button"),
                            "service": item.get("service")
                        }).execute()
                        summary["registered_alerts_count"] += 1
                        print(f"🚨 Cost anomaly flagged on {item['service']}! Message: {item['message']}")

                # ─── STEP 3: STAGGER NEXT EXECUTION WITH JITTER ───
                if self.autopilot.enabled:
                    interval = 600  # 10 minutes sync interval
                    jitter = random.randint(-30, 30)  # +-30s jitter to block thundering herd concurrence
                    next_run = now_epoch + interval + jitter
                    
                    self.autopilot.r.hset(f"finguard:acc_details:{acc_id}", mapping={
                        "account_name": name,
                        "last_run": datetime.fromtimestamp(now_epoch, tz=timezone.utc).isoformat(),
                        "next_run": datetime.fromtimestamp(next_run, tz=timezone.utc).isoformat()
                    })
                    self.autopilot.r.zadd("finguard:ingestion_schedule", {acc_id: next_run})
                    print(f"📅 Rescheduled {name} for next run at score: {next_run}")

            except Exception as e:
                err_msg = f"Error syncing account {name}: {e}"
                print(f"❌ {err_msg}")
                summary["errors"].append(err_msg)

        return summary

def run_worker_loop():
    """
    Main loop script that polls and runs sync cycles continuously (ideal for local terminal usage).
    """
    worker = IngestionWorker()
    print("🚦 Polling worker loop active (Polling every 30 seconds for dev simplicity)...")
    while True:
        try:
            worker.run_sync_cycle()
        except KeyboardInterrupt:
            print("⏹️ Worker stopped manually.")
            break
        except Exception as e:
            print(f"⚠️ Worker cycle error: {e}")
        time.sleep(30)

if __name__ == "__main__":
    run_worker_loop()
