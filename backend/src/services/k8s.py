import subprocess
import json
import os
from fastapi import APIRouter, Query

router = APIRouter()

MOCK_PODS = {
    "items": [
        {
            "metadata": {
                "name": "worker-x-54abc",
                "namespace": "default",
            },
            "status": {
                "phase": "CrashLoopBackOff",
                "containerStatuses": [
                    {
                        "ready": False,
                        "restartCount": 5,
                        "state": {
                            "waiting": {"reason": "CrashLoopBackOff", "message": "Back-off restarting failed container"}
                        }
                    }
                ]
            },
            "spec": {
                "containers": [{"name": "worker"}]
            }
        },
        {
            "metadata": {
                "name": "ai-chatbot-77xyz",
                "namespace": "frontend",
            },
            "status": {
                "phase": "Running",
                "containerStatuses": [
                    {
                        "ready": True,
                        "restartCount": 0,
                        "state": {
                            "running": {}
                        }
                    }
                ]
            },
            "spec": {
                "containers": [{"name": "chatbot"}]
            }
        },
        {
            "metadata": {
                "name": "api-gateway-99abc",
                "namespace": "default",
            },
            "status": {
                "phase": "Running",
                "containerStatuses": [
                    {
                        "ready": True,
                        "restartCount": 1,
                        "state": {
                            "running": {}
                        }
                    }
                ]
            },
            "spec": {
                "containers": [{"name": "gateway"}]
            }
        }
    ]
}

MOCK_LOGS = {
    "worker-x-54abc": (
        "[2026-05-25 11:30:00Z] INFO worker-x starting up on node node-092\n"
        "[2026-05-25 11:30:05Z] INFO queue_depth check: 120 jobs in queue. Status: Normal\n"
        "[2026-05-25 11:31:00Z] INFO queue_depth check: 1,500 jobs in queue. Alert state: Warning\n"
        "[2026-05-25 11:32:00Z] WARN queue_depth check: 6,500 jobs in queue. Worker nodes saturated!\n"
        "[2026-05-25 11:33:00Z] CRIT queue_depth check: 12,000 jobs in queue. K8s queue depth explosion detected!\n"
        "[2026-05-25 11:33:05Z] INFO ReplicaSet controller scaling pods from 4 to 40 replicas...\n"
        "[2026-05-25 11:33:15Z] ERROR [FATAL] Out of Memory (OOM) error in worker-x-54abc container 'worker'.\n"
        "[2026-05-25 11:33:20Z] FATAL CrashLoopBackOff: Container 'worker' exited with code 137. Restarts: 5.\n"
        "[2026-05-25 11:33:25Z] INFO Back-off restarting failed container 'worker' in namespace 'default'..."
    ),
    "ai-chatbot-77xyz": (
        "[2026-05-25 11:30:00Z] INFO ai-chatbot-service listening on port 8080\n"
        "[2026-05-25 11:30:15Z] INFO Received chatbot request from active session user_x9a\n"
        "[2026-05-25 11:31:10Z] INFO Invoking external LLM API client...\n"
        "[2026-05-25 11:32:05Z] WARN LLM Client response latency elevated: 420ms\n"
        "[2026-05-25 11:33:00Z] ERROR Chatbot Prompt Infinite Loop: Excessive context tokens sent.\n"
        "[2026-05-25 11:33:05Z] WARNING Token usage alert: Cost anomaly score: 0.99 (estimated cost: $2,150.00)\n"
        "[2026-05-25 11:33:10Z] INFO Rate limiting chatbot requests for session user_x9a."
    ),
    "api-gateway-99abc": (
        "[2026-05-25 11:30:00Z] INFO api-gateway-99abc starting up...\n"
        "[2026-05-25 11:30:10Z] INFO Loading routing policies...\n"
        "[2026-05-25 11:30:15Z] INFO gateway proxy initialized. Forwarding traffic to: worker-x, ai-chatbot-service\n"
        "[2026-05-25 11:32:00Z] INFO GET /api/v1/health - 200 OK (8ms)\n"
        "[2026-05-25 11:33:05Z] WARN GET /api/v1/investigate - 504 Gateway Timeout (worker-x unresponsive)\n"
        "[2026-05-25 11:33:15Z] INFO GET /api/v1/health - 200 OK (12ms)"
    )
}

@router.get("/api/v1/k8s/pods")
def get_k8s_pods(namespace: str = None):
    """Fetch live pods using kubectl, or return fallback mocks if kubectl/cluster is unavailable."""
    try:
        cmd = ["kubectl", "get", "pods", "-A", "-o", "json"]
        if namespace:
            cmd = ["kubectl", "get", "pods", "-n", namespace, "-o", "json"]
            
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            return json.loads(result.stdout)
    except Exception:
        pass
    
    # Filter mocks by namespace if requested
    if namespace:
        filtered_items = [p for p in MOCK_PODS["items"] if p["metadata"]["namespace"] == namespace]
        return {"items": filtered_items}
    return MOCK_PODS

@router.get("/api/v1/k8s/logs")
def get_k8s_logs(pod_name: str, namespace: str = "default"):
    """Fetch live pod logs using kubectl, or return fallback logs if unavailable."""
    try:
        result = subprocess.run(
            ["kubectl", "logs", pod_name, "-n", namespace, "--tail=100"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            return {"logs": result.stdout}
    except Exception:
        pass
    
    # Fallback to simulated logs
    for key, logs in MOCK_LOGS.items():
        if pod_name in key or key in pod_name:
            return {"logs": logs}
            
    return {"logs": f"[2026-05-25 11:30:00Z] INFO Running logs fallback for pod {pod_name}\n[2026-05-25 11:30:10Z] INFO Log stream active."}
