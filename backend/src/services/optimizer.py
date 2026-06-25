def get_downgrade_recommendation(provider: str, service_name: str, current_cost: float, metrics: dict) -> dict:
    """
    Analyzes cost and performance waste, recommending a safe, non-destructive downgrade size.
    Calculates estimated cost savings and provides clear, actionable steps.
    
    Args:
        provider (str): 'aws' or 'gcp'
        service_name (str): e.g., 'Amazon EC2', 'Compute Engine', etc.
        current_cost (float): Daily cost of the resource
        metrics (dict): Resource metrics (cpu_utilization, etc.)
        
    Returns:
        dict: {
            "recommended": bool,
            "target_size": str,
            "estimated_savings": float,
            "reason": str,
            "action_steps": str
        }
    """
    cpu_util = metrics.get("cpu_utilization")
    
    # We only optimize compute instances that show clear idle waste (<15% average CPU)
    if cpu_util is None or cpu_util >= 15.0:
        return {
            "recommended": False,
            "target_size": "current",
            "estimated_savings": 0.0,
            "reason": "Resource utilization is within normal/optimal operating parameters.",
            "action_steps": "No action required."
        }
        
    # --- AWS EC2 / RDS Downsize Chain ---
    if provider == "aws" and ("EC2" in service_name or "RDS" in service_name):
        if cpu_util < 5.0:
            # Extreme waste: Recommend downsizing 2 full sizes (75% savings)
            savings = current_cost * 0.75
            return {
                "recommended": True,
                "target_size": "t3.medium (or 2 steps down)",
                "estimated_savings": round(savings, 2),
                "reason": f"Extreme idle waste detected. {service_name} is running at {cpu_util}% CPU. Downsizing 2 steps will safely reduce cost by 75% without compromising stability.",
                "action_steps": "Go to EC2 Console -> Select Instance -> Instance State: Stop -> Change Instance Type -> select t3.medium -> Start."
            }
        else:
            # Moderate waste: Recommend downsizing 1 size (50% savings)
            savings = current_cost * 0.50
            return {
                "recommended": True,
                "target_size": "t3.large (or 1 step down)",
                "estimated_savings": round(savings, 2),
                "reason": f"Under-utilized compute detected. {service_name} is running at {cpu_util}% CPU. Downsizing 1 step will save 50% on cost while maintaining ample performance headroom.",
                "action_steps": "Go to EC2 Console -> Select Instance -> Instance State: Stop -> Change Instance Type -> select t3.large -> Start."
            }
            
    # --- GCP Compute Engine Downsize Chain ---
    elif provider == "gcp" and ("Compute" in service_name or "VM" in service_name):
        if cpu_util < 5.0:
            # Extreme waste: Recommend downsizing 2 sizes (75% savings)
            savings = current_cost * 0.75
            return {
                "recommended": True,
                "target_size": "e2-medium (or 2 steps down)",
                "estimated_savings": round(savings, 2),
                "reason": f"Extreme idle waste detected. {service_name} is running at {cpu_util}% CPU. Downsizing to a medium tier will yield 75% savings.",
                "action_steps": "Go to Compute Engine -> Select VM -> Stop Instance -> Edit -> Change Machine Type to e2-medium -> Save & Start."
            }
        else:
            # Moderate waste: Recommend downsizing 1 size (50% savings)
            savings = current_cost * 0.50
            return {
                "recommended": True,
                "target_size": "e2-standard-2 (or 1 step down)",
                "estimated_savings": round(savings, 2),
                "reason": f"Under-utilized VM detected. {service_name} is running at {cpu_util}% CPU. Downsizing to next smaller tier will save 50% on active compute cost.",
                "action_steps": "Go to Compute Engine -> Select VM -> Stop Instance -> Edit -> Change Machine Type to e2-standard-2 -> Save & Start."
            }
            
    return {
        "recommended": False,
        "target_size": "current",
        "estimated_savings": 0.0,
        "reason": "Resource type or metrics not eligible for automated sizing recommendations.",
        "action_steps": "No action required."
    }
