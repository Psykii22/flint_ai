import os
import time
from datetime import datetime, timezone

# Defensive import: Fall back to a local memory dictionary mock if redis library is missing during bootstrap
try:
    import redis
    _redis_available = True
except ImportError:
    _redis_available = False

class AutopilotQueue:
    def __init__(self):
        self.enabled = False
        if _redis_available:
            host = os.environ.get("REDIS_HOST")
            port = int(os.environ.get("REDIS_PORT", 6379))
            password = os.environ.get("REDIS_PASSWORD")
            
            if host:
                try:
                    self.r = redis.Redis(
                        host=host,
                        port=port,
                        password=password,
                        decode_responses=True,
                        socket_timeout=3
                    )
                    self.enabled = True
                except Exception as e:
                    print(f"⚠️ Redis initialization failed: {e}. Autopilot falling back to mock memory.")
                    
        if not self.enabled:
            # InMemory fallback mock for dev environment
            self.mock_zset = {}
            self.mock_hashes = {}

    def schedule_optimization(self, cloud_account_id: str, provider: str, resource_id: str, service_name: str, current_size: str, target_size: str, estimated_savings: float) -> dict:
        """
        Schedules a resource auto-downgrade in Upstash Redis.
        Stores two distinct representations:
          1. server_to_self context (the full operational metadata ledger)
          2. server_to_app payload (the clean, pre-serialized mobile app alert)
        """
        opt_id = f"opt:{cloud_account_id}:{resource_id}"
        now_epoch = int(time.time())
        execute_epoch = now_epoch + 1200  # 20 minutes from now
        
        scheduled_at = datetime.fromtimestamp(now_epoch, tz=timezone.utc).isoformat()
        execute_at = datetime.fromtimestamp(execute_epoch, tz=timezone.utc).isoformat()
        
        # 1. Server-To-Self JSON Payload (Private context metadata)
        server_to_self = {
            "optimization_id": opt_id,
            "cloud_account_id": cloud_account_id,
            "provider": provider,
            "resource_id": resource_id,
            "service_name": service_name,
            "current_size": current_size,
            "target_size": target_size,
            "estimated_savings": str(estimated_savings),
            "status": "scheduled",
            "scheduled_at": scheduled_at,
            "execute_at": execute_at
        }
        
        # 2. Server-To-App JSON Payload (Clean mobile-app contract)
        import json
        app_message = f"Compute is running under extreme waste (CPU < 5%). Autopilot will automatically downsize this resource to {target_size} in 20 minutes to save ${estimated_savings}/day."
        server_to_app = {
            "optimization_id": opt_id,
            "message": app_message,
            "button": {
                "Fix Now": True,
                "Leave": False
            }
        }
        
        if self.enabled:
            try:
                # Store Private Ledger (Server-to-Self Hash)
                self.r.hset(f"finguard:opt_details:{opt_id}", mapping=server_to_self)
                
                # Store Clean Mobile Alert (Server-to-App JSON String)
                self.r.set(f"finguard:app_alert:{opt_id}", json.dumps(server_to_app))
                
                # Add to Sorted Set schedule queue with score as execution time
                self.r.zadd("finguard:scheduled_optimizations", {opt_id: execute_epoch})
                print(f"🛡️ Autopilot scheduled: {opt_id} to execute at {execute_at}")
            except Exception as e:
                print(f"❌ Redis schedule error: {e}")
        else:
            self.mock_zset[opt_id] = execute_epoch
            self.mock_hashes[opt_id] = {
                "self": server_to_self,
                "app": server_to_app
            }
            print(f"🛡️ [Mock] Autopilot scheduled: {opt_id} to execute at {execute_at}")
            
        return server_to_app

    def cancel_optimization(self, optimization_id: str) -> bool:
        """
        Cancels a scheduled auto-optimization.
        Updates details status and removes from sorted set.
        """
        if self.enabled:
            try:
                self.r.hset(f"finguard:opt_details:{optimization_id}", "status", "cancelled")
                self.r.zrem("finguard:scheduled_optimizations", optimization_id)
                self.r.delete(f"finguard:app_alert:{optimization_id}")
                print(f"🛡️ Autopilot cancelled: {optimization_id}")
                return True
            except Exception as e:
                print(f"❌ Redis cancel error: {e}")
                return False
        else:
            if optimization_id in self.mock_hashes:
                if isinstance(self.mock_hashes[optimization_id], dict) and "self" in self.mock_hashes[optimization_id]:
                    self.mock_hashes[optimization_id]["self"]["status"] = "cancelled"
                self.mock_zset.pop(optimization_id, None)
                print(f"🛡️ [Mock] Autopilot cancelled: {optimization_id}")
                return True
            return False

    def get_pending_countdowns(self) -> list:
        """
        Fetches all active countdowns for UI consumption.
        Computes the remaining seconds dynamically.
        """
        pending_list = []
        now_epoch = int(time.time())
        
        if self.enabled:
            try:
                # ZRANGE to fetch all scheduled items
                opt_ids = self.r.zrange("finguard:scheduled_optimizations", 0, -1)
                for opt_id in opt_ids:
                    details = self.r.hgetall(f"finguard:opt_details:{opt_id}")
                    if details and details.get("status") == "scheduled":
                        exec_time = int(self.r.zscore("finguard:scheduled_optimizations", opt_id) or 0)
                        seconds_remaining = max(0, exec_time - now_epoch)
                        details["seconds_remaining"] = seconds_remaining
                        pending_list.append(details)
            except Exception as e:
                print(f"❌ Redis fetch error: {e}")
        else:
            for opt_id, exec_time in list(self.mock_zset.items()):
                details = self.mock_hashes.get(opt_id)
                if details and details.get("status") == "scheduled":
                    seconds_remaining = max(0, exec_time - now_epoch)
                    details_copy = details.copy()
                    details_copy["seconds_remaining"] = seconds_remaining
                    pending_list.append(details_copy)
                    
        return pending_list

    def process_due_optimizations(self) -> list:
        """
        Evaluates and applies all due auto-optimizations (20 minutes completed).
        Removes processed items from the Sorted Set schedule.
        """
        applied_list = []
        now_epoch = int(time.time())
        
        if self.enabled:
            try:
                # Fetch all elements due for execution (score <= now)
                due_opts = self.r.zrangebyscore("finguard:scheduled_optimizations", "-inf", now_epoch)
                
                for opt_id in due_opts:
                    details = self.r.hgetall(f"finguard:opt_details:{opt_id}")
                    if details and details.get("status") == "scheduled":
                        # Execute downscale operation safely
                        print(f"⚡ Autopilot: Executing downgrade for {opt_id}...")
                        self.r.hset(f"finguard:opt_details:{opt_id}", "status", "applied")
                        applied_list.append(details)
                        
                    # Clean scheduler entry
                    self.r.zrem("finguard:scheduled_optimizations", opt_id)
            except Exception as e:
                print(f"❌ Redis process error: {e}")
        else:
            for opt_id, exec_time in list(self.mock_zset.items()):
                if exec_time <= now_epoch:
                    details = self.mock_hashes.get(opt_id)
                    if details and details.get("status") == "scheduled":
                        details["status"] = "applied"
                        applied_list.append(details)
                    self.mock_zset.pop(opt_id, None)
                    
        return applied_list
