from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import time

# Resilient imports supporting any launch path
try:
    from src.worker import IngestionWorker
    from src.services.autopilot import AutopilotQueue
    from src.database.postgres import supabase
    from src.services.aws import AWSService
    from src.services.gcp import GCPService
except ImportError:
    from backend.src.worker import IngestionWorker
    from backend.src.services.autopilot import AutopilotQueue
    from backend.src.database.postgres import supabase
    from backend.src.services.aws import AWSService
    from backend.src.services.gcp import GCPService

router = APIRouter(prefix="/api/v1/autopilot", tags=["Autopilot Control"])

class UserResponsePayload(BaseModel):
    optimization_id: str
    userclicked: bool
    user_id: str = "usr_demo"
    cloud_accounts_id: str = "acc_demo"

class SyncTriggerPayload(BaseModel):
    user_id: str
    cloud_accounts_id: str
    provider: str

@router.post("/process")
def trigger_ingestion_cycle():
    """
    Cron endpoint triggered by a serverless scheduler (e.g. GCP Cloud Scheduler).
    Executes a single stateless sync cycle and returns an operational summary.
    """
    try:
        worker = IngestionWorker()
        summary = worker.run_sync_cycle()
        return {
            "status": "success",
            "cycle_summary": summary
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cycle processing failed: {str(e)}")

@router.post("/response")
def handle_user_response(payload: UserResponsePayload):
    """
    Handles immediate user clicks from the mobile application card buttons:
      - If userclicked is False (Leave): Cancels the scheduled downgrade.
      - If userclicked is True (Fix Now): Immediately runs the keyless VM resize logic.
    """
    opt_id = payload.optimization_id
    user_chose_fix = payload.userclicked
    queue = AutopilotQueue()

    if not user_chose_fix:
        # User chose "Leave" ➜ Safe cancellation
        cancelled = queue.cancel_optimization(opt_id)
        if cancelled:
            return {
                "status": "cancelled",
                "message": "Autopilot countdown cancelled successfully."
            }
        else:
            raise HTTPException(
                status_code=400, 
                detail="Optimization task not found or already cancelled/applied."
            )
    else:
        # User chose "Fix Now" ➜ Immediate downgrade execution!
        # 1. Fetch internal server-to-self ledger from Redis
        details = None
        if queue.enabled:
            details = queue.r.hgetall(f"finguard:opt_details:{opt_id}")
        else:
            # Dev fallback
            mock_data = queue.mock_hashes.get(opt_id)
            if mock_data:
                details = mock_data.get("self")

        if not details or details.get("status") != "scheduled":
            raise HTTPException(
                status_code=400, 
                detail="No active scheduled optimization task found for this ID."
            )

        # 2. Retrieve cloud credentials keylessly from database
        cloud_acc_id = details.get("cloud_account_id")
        try:
            res = supabase.table("cloud_accounts").select("*").eq("id", cloud_acc_id).execute()
            if not res.data:
                raise HTTPException(status_code=404, detail="Cloud account credentials not found.")
            
            account_data = res.data[0]
            provider = account_data["provider"]
            credentials = account_data["credentials"]
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed database lookup: {str(e)}")

        # 3. Trigger immediate physical VM downscale
        success = False
        target_size = details.get("target_size")
        resource_id = details.get("resource_id")

        print(f"⚡ [IMMEDIATE FIX] Direct user command received. Resizing {resource_id} to {target_size} now...")
        if provider == "aws":
            service = AWSService(credentials)
            success = service.downgrade_instance(resource_id, target_size)
        elif provider == "gcp":
            service = GCPService(credentials)
            success = service.downgrade_instance(resource_id, target_size)

        if success:
            # 4. Clean up state in Redis
            if queue.enabled:
                queue.r.hset(f"finguard:opt_details:{opt_id}", "status", "applied")
                queue.r.delete(f"finguard:app_alert:{opt_id}")
                queue.r.zrem("finguard:scheduled_optimizations", opt_id)
            else:
                queue.mock_hashes[opt_id]["self"]["status"] = "applied"
                queue.mock_zset.pop(opt_id, None)

            # Log audit entry to Supabase
            supabase.table("alerts").insert({
                "cloud_account_id": cloud_acc_id,
                "severity": "info",
                "message": f"Direct user Action: Downgraded resource {resource_id} from {details.get('current_size')} to {target_size} successfully.",
                "button": None,
                "service": details.get("service_name")
            }).execute()

            return {
                "status": "applied",
                "message": f"Resource {resource_id} downscaled to {target_size} successfully."
            }
        else:
            raise HTTPException(
                status_code=500, 
                detail="Physical downscaling operation failed on cloud provider."
            )

@router.post("/verify-ping")
def verify_and_ping_account(payload: SyncTriggerPayload):
    """
    Onboarding Verification & Sync Trigger Endpoint:
      - Takes only IDs (user_id, cloud_accounts_id, provider) for premium security.
      - Synchronously loads cloud credentials from database.
      - Dispatches a lightweight cost query (verification ping) to ensure token freshness.
      - Schedules an immediate full cost-ingestion inside Upstash Redis sorted sets.
    """
    acc_id = payload.cloud_accounts_id
    user_id = payload.user_id
    provider = payload.provider

    print(f"🔒 [VERIFY PING] Triggered verify-ping for account: {acc_id} (User: {user_id})...")

    # 1. Fetch credentials securely from Supabase
    try:
        res = supabase.table("cloud_accounts").select("*").eq("id", acc_id).eq("user_id", user_id).execute()
        if not res.data:
            raise HTTPException(
                status_code=404, 
                detail="Cloud account not found or access denied."
            )
        
        account_data = res.data[0]
        credentials = account_data["credentials"]
        account_name = account_data["account_name"]
        
    except Exception as db_err:
        raise HTTPException(
            status_code=500, 
            detail=f"Database credentials lookup failed: {str(db_err)}"
        )

    # 2. Run Synchronous Credentials Verification Ping keylessly
    try:
        if provider == "aws":
            service = AWSService(credentials)
            # Fetch 1 day of billing to test role assumption keylessly
            service.get_enriched_billing(days=1)
        elif provider == "gcp":
            service = GCPService(credentials)
            # Run BigQuery client test query
            service.get_enriched_billing(days=1)
        else:
            raise HTTPException(status_code=400, detail="Unsupported cloud provider.")
            
        print(f"✅ [VERIFY SUCCESS] Credentials verified for cloud account: {account_name}")
        
    except Exception as ping_err:
        # Switch is_active to False to notify user on UI
        supabase.table("cloud_accounts").update({"is_active": False}).eq("id", acc_id).execute()
        
        raise HTTPException(
            status_code=400,
            detail=f"Cloud Connection Verification Failed. Please verify OIDC credentials. Details: {str(ping_err)}"
        )

    # 3. Success: Set active status in Database
    supabase.table("cloud_accounts").update({
        "is_active": True,
        "last_synced_at": None
    }).eq("id", acc_id).execute()

    # 4. Enqueue into Redis sorted set scheduler for immediate background worker ingestion
    queue = AutopilotQueue()
    if queue.enabled:
        now_epoch = int(time.time())
        # Score=now guarantees it runs on the very next background loop tick
        queue.r.zadd("finguard:ingestion_schedule", {acc_id: now_epoch})
        queue.r.hset(f"finguard:acc_details:{acc_id}", mapping={
            "account_name": account_name,
            "last_run": "Credentials Verified Successfully",
            "next_run": "Immediate Full Sync Pending"
        })
        print(f"📅 Enqueued {account_name} in Redis for instant ingestion sync.")

    return {
        "status": "success",
        "message": f"Cloud credentials successfully verified! Ingestion sync scheduled in Redis.",
        "account_id": acc_id
    }
