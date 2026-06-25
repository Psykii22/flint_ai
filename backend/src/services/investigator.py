from fastapi import APIRouter
from pydantic import BaseModel
from src.agents.billing_agent import investigate_anomaly, coral_query
import json

router = APIRouter()

class InvestigateRequest(BaseModel):
    service_name: str = None

@router.post("/api/v1/investigate")
def run_investigation(req: InvestigateRequest):
    result = investigate_anomaly(req.service_name)
    return result

@router.get("/api/v1/investigate/anomalies")
def get_anomalies():
    # Simple query to list anomalies using Coral directly
    sql = "SELECT * FROM supabase.billing_events WHERE severity = 'critical' ORDER BY timestamp DESC LIMIT 5"
    result_str = coral_query(sql)
    try:
        data = json.loads(result_str)
        return {"anomalies": data}
    except Exception as e:
        return {"error": "Failed to parse coral output", "details": result_str}
