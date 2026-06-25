from src.services.optimizer import get_downgrade_recommendation

def evaluate_anomalies(service_name: str, cost: float, total_cost: float, metrics: dict) -> dict:
    """
    Evaluates a cloud resource's cost and performance metrics against the 8 Golden Anomaly Rules.
    Returns:
        dict: {
            "is_anomaly": bool,
            "severity": str,
            "message": str,
            "button": dict
        }
    """
    is_anomaly = False
    message = ""
    severity = "info"
    button = {}

    # Extract dynamic metrics with standard fallbacks
    cpu_util = metrics.get("cpu_utilization")
    db_storage_util = metrics.get("storage_utilization")
    k8s_pressure = metrics.get("resource_allocation")
    bucket_growth = metrics.get("cost_growth_rate")
    serverless_growth = metrics.get("invocation_growth")
    dod_growth = metrics.get("day_over_day_change")

    # ─── RULE 1: COMPUTE CPU UTILIZATION (Performance Stress) ───
    if cpu_util is not None and cpu_util > 75.0:
        return {
            "is_anomaly": True,
            "severity": "critical",
            "message": f"Compute CPU Stress: Resource is running at {cpu_util}% capacity (threshold: 75%).",
            "button": {
                "Audit Performance": True,
                "Leave": False
            }
        }

    # ─── RULE 2: COMPUTE CPU UTILIZATION (Idle Waste & Autopilot) ───
    if cpu_util is not None and cpu_util < 15.0:
        provider = "aws" if ("EC2" in service_name or "RDS" in service_name) else "gcp"
        rec = get_downgrade_recommendation(provider, service_name, cost, metrics)
        
        if cpu_util < 5.0 and rec.get("recommended"):
            # Critical Limit: Auto-schedule in Upstash Redis queue with 20m grace period
            try:
                from src.services.autopilot import AutopilotQueue
                queue = AutopilotQueue()
                queue.schedule_optimization(
                    cloud_account_id=metrics.get("cloud_account_id", provider),
                    provider=provider,
                    resource_id=metrics.get("resource_id", "i-unknown"),
                    service_name=service_name,
                    current_size=metrics.get("instance_type", "unknown"),
                    target_size=rec["target_size"],
                    estimated_savings=rec["estimated_savings"]
                )
                msg = f"Compute is running under {cpu_util}% CPU. Autopilot will automatically downsize this resource to save ${rec['estimated_savings']}/day."
            except Exception as e:
                print(f"⚠️ Failed to queue autopilot task: {e}")
                msg = f"Compute is running under {cpu_util}% CPU. Recommended to downsize to save ${rec['estimated_savings']}/day."
            
            return {
                "is_anomaly": True,
                "severity": "critical",
                "message": msg,
                "button": {
                    "Fix Now": True,
                    "Leave": False
                }
            }
        else:
            # Warning Limit: Info only (Alert user to downsize)
            msg = f"Idle Resource Waste: Compute is running under {cpu_util}% utilization (threshold: 15%)."
            if rec.get("recommended"):
                msg = f"Compute is running under {cpu_util}% CPU. Recommended to downgrade to {rec['target_size']} to save ${rec['estimated_savings']}/day."
            
            return {
                "is_anomaly": True,
                "severity": "warning",
                "message": msg,
                "button": {
                    "Downgrade Now": True,
                    "Leave": False
                }
            }

    # ─── RULE 3: DATABASE STORAGE WARNING (User suggestion: > 90%) ───
    if db_storage_util is not None and db_storage_util > 90.0:
        return {
            "is_anomaly": True,
            "severity": "critical",
            "message": f"Database Disk Warning: Storage space utilization is at {db_storage_util}% capacity (threshold: 90%).",
            "button": {
                "Expand Storage": True,
                "Leave": False
            }
        }

    # ─── RULE 4: KUBERNETES OVERLOADING (Resource Pressure) ───
    if k8s_pressure is not None and k8s_pressure > 95.0:
        return {
            "is_anomaly": True,
            "severity": "critical",
            "message": f"Kubernetes Memory/CPU Exhaustion: Pod request allocation is at {k8s_pressure}% of node capacity.",
            "button": {
                "Scale Nodes": True,
                "Leave": False
            }
        }

    # ─── RULE 5: BUCKET STORAGE SURGES (S3 / GCS) ───
    if bucket_growth is not None and bucket_growth > 50.0:
        return {
            "is_anomaly": True,
            "severity": "warning",
            "message": f"Storage Cost Surge: Bucket storage cost surged +{bucket_growth}% in a 24h window.",
            "button": {
                "Clean Storage": True,
                "Leave": False
            }
        }

    # ─── RULE 6: SERVERLESS RUNAWAY LOOPS (Lambda / Cloud Run) ───
    if ("Lambda" in service_name or "Cloud Run" in service_name) and cost > 20.0:
        if serverless_growth is not None and serverless_growth > 300.0:
            return {
                "is_anomaly": True,
                "severity": "critical",
                "message": f"Serverless Runaway Loop: Function cost exceeded $20/day (${cost}) with a +{serverless_growth}% invocation surge.",
                "button": {
                    "Stop Service": True,
                    "Leave": False
                }
            }

    # ─── RULE 7: COST DOMINANCE & DRIFT (Percentage of Total Cost) ───
    if total_cost > 0 and cost > (total_cost * 0.30) and cost > 5.0:
        pct = int((cost / total_cost) * 100)
        return {
            "is_anomaly": True,
            "severity": "warning",
            "message": f"Financial Drift: {service_name} now accounts for {pct}% of entire daily cloud spend.",
            "button": {
                "Audit Drift": True,
                "Leave": False
            }
        }

    # ─── RULE 8: PERCENT BILLING SPIKES (Day-over-day surge) ───
    if dod_growth is not None and dod_growth > 40.0:
        return {
            "is_anomaly": True,
            "severity": "critical",
            "message": f"Sudden Billing Spike: Cost increased by +{dod_growth}% compared to previous day.",
            "button": {
                "Analyze Spike": True,
                "Leave": False
            }
        }

    return {
        "is_anomaly": is_anomaly,
        "severity": severity,
        "message": message,
        "button": button
    }
