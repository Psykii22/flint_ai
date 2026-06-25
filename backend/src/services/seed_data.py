from fastapi import APIRouter
from supabase import create_client
import os
import json
from datetime import datetime, timedelta

router = APIRouter()

def write_jsonl(table, data):
    base_dir = os.path.join(os.getcwd(), "coral", "data", table)
    os.makedirs(base_dir, exist_ok=True)
    filepath = os.path.join(base_dir, f"{table}.jsonl")
    mode = 'a'
    with open(filepath, mode) as f:
        f.write(json.dumps(data) + "\n")

def clear_jsonl(table):
    base_dir = os.path.join(os.getcwd(), "coral", "data", table)
    filepath = os.path.join(base_dir, f"{table}.jsonl")
    if os.path.exists(filepath):
        os.remove(filepath)

@router.post("/api/v1/seed")
def seed_database():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_OPS_KEY")
    
    tables = ["deployments", "worker_events", "pod_metrics", "incidents", "billing_events"]
    for t in tables:
        clear_jsonl(t)

    now = datetime.utcnow()
    t_minus_60 = (now - timedelta(minutes=60)).isoformat()
    t_minus_45 = (now - timedelta(minutes=45)).isoformat()
    t_minus_30 = (now - timedelta(minutes=30)).isoformat()
    t_minus_15 = (now - timedelta(minutes=15)).isoformat()
    t_now = now.isoformat()

    try:
        # --- SCENARIO 1: Kubernetes Queue Explosion ---
        dep1 = {"id": 1, "deployment_id": "deploy-221", "service_name": "worker-x", "version": "v1.4.2", "deployed_by": "ci-cd-bot", "deployed_at": t_minus_60}
        write_jsonl("deployments", dep1)
        
        we1 = {"id": 1, "worker_name": "worker-x", "retry_count": 500, "failed_jobs": 1500, "queue_depth": 12000, "status": "queue_explosion", "timestamp": t_minus_45}
        write_jsonl("worker_events", we1)
        
        pm1 = {"id": 1, "service_name": "worker-x", "namespace": "default", "pod_name": "worker-x-54abc", "replicas": 40, "cpu_usage": 95.5, "memory_usage": 90.0, "restart_count": 5, "status": "CrashLoopBackOff", "timestamp": t_minus_30}
        write_jsonl("pod_metrics", pm1)
        
        inc1 = {"id": 1, "service_name": "worker-x", "severity": "high", "incident_type": "Kubernetes Queue Explosion", "message": "Massive queue explosion detected. Kubernetes pods scaled aggressively and crashed out of memory.", "resolved": False, "created_at": t_minus_15}
        write_jsonl("incidents", inc1)

        be1 = {"id": 1, "service_name": "worker-x", "estimated_cost": 450.25, "anomaly_score": 0.95, "severity": "critical", "timestamp": t_now}
        write_jsonl("billing_events", be1)

        # --- SCENARIO 2: External LLM API Price Explosion ---
        dep2 = {"id": 2, "deployment_id": "deploy-llm-99", "service_name": "ai-chatbot-service", "version": "v3.0-gemini", "deployed_by": "dev-team", "deployed_at": t_minus_60}
        write_jsonl("deployments", dep2)
        
        we2 = {"id": 2, "worker_name": "ai-chatbot-service", "retry_count": 0, "failed_jobs": 0, "queue_depth": 50, "status": "running", "timestamp": t_minus_45}
        write_jsonl("worker_events", we2)
        
        pm2 = {"id": 2, "service_name": "ai-chatbot-service", "namespace": "frontend", "pod_name": "ai-chatbot-77xyz", "replicas": 2, "cpu_usage": 15.0, "memory_usage": 20.0, "restart_count": 0, "status": "Running", "timestamp": t_minus_30}
        write_jsonl("pod_metrics", pm2)
        
        inc2 = {"id": 2, "service_name": "ai-chatbot-service", "severity": "critical", "incident_type": "LLM API Token Explosion", "message": "Unusual LLM token usage spike. Possible infinite loop in chatbot prompt generation sending excessive context tokens.", "resolved": False, "created_at": t_minus_15}
        write_jsonl("incidents", inc2)

        be2 = {"id": 2, "service_name": "ai-chatbot-service", "estimated_cost": 2150.00, "anomaly_score": 0.99, "severity": "critical", "timestamp": t_now}
        write_jsonl("billing_events", be2)
        
        # Also push to Supabase if configured
        if url and key:
            supabase = create_client(url, key)
            for item in [dep1, dep2]: supabase.table("deployments").insert(item).execute()
            for item in [we1, we2]: supabase.table("worker_events").insert(item).execute()
            for item in [pm1, pm2]: supabase.table("pod_metrics").insert(item).execute()
            for item in [inc1, inc2]: supabase.table("incidents").insert(item).execute()
            for item in [be1, be2]: supabase.table("billing_events").insert(item).execute()

        return {"status": "success", "message": "Seed data inserted for K8s Queue Explosion and LLM Price Explosion."}
    except Exception as e:
        return {"error": str(e)}
