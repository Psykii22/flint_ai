import os
import subprocess
import json
from google import genai
from google.genai import types

def coral_query(sql: str) -> str:
    """Executes a SQL query against the Coral CLI and returns the JSON result."""
    try:
        coral_dir = os.path.join(os.getcwd(), "coral")
        # Run coral sql command
        result = subprocess.run(
            [".\coral", "sql", "--format", "json", sql],
            cwd=coral_dir,
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            return f"Error executing Coral query: {result.stderr}"
        return result.stdout
    except Exception as e:
        return f"Exception in coral_query: {str(e)}"

def investigate_anomaly(service_name: str = None) -> dict:
    """Investigate the latest billing anomaly using Coral via Gemini."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return {"explanation": "GEMINI_API_KEY is missing.", "queries_run": []}
        
    client = genai.Client(api_key=api_key)
    
    # Define the tool schema for Gemini
    coral_tool = types.FunctionDeclaration(
        name="coral_query",
        description="Executes a SQL query against the Coral SQL engine which has operational data.",
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "sql": types.Schema(
                    type=types.Type.STRING,
                    description="The SQL query to run. Available tables: supabase.pod_metrics, supabase.billing_events, supabase.deployments, supabase.incidents, supabase.worker_events."
                )
            },
            required=["sql"]
        )
    )
    
    tool = types.Tool(function_declarations=[coral_tool])
    
    prompt = f"""You are an AI Cloud Cost Investigator for ArcOps.
You have access to Coral, a SQL interface over operational data sources.
The tables available are:
- supabase.pod_metrics (id, service_name, namespace, pod_name, replicas, cpu_usage, memory_usage, restart_count, status, timestamp)
- supabase.billing_events (id, service_name, estimated_cost, anomaly_score, severity, timestamp)
- supabase.deployments (id, deployment_id, service_name, version, deployed_by, deployed_at)
- supabase.incidents (id, service_name, severity, incident_type, message, resolved, created_at)
- supabase.worker_events (id, worker_name, retry_count, failed_jobs, queue_depth, status, timestamp)

Investigate the billing anomaly for {service_name if service_name else 'the most recent critical anomaly'}.
1. Check billing_events for the anomaly details.
2. Check pod_metrics for resource usage.
3. Check deployments for recent changes.
4. Check incidents and worker_events for failures.
Join data and explain the probable root cause of the cost spike. Do not query too much at once.
Limit your queries if necessary to avoid large result sets.
"""

    chat = client.chats.create(
        model="gemini-2.5-flash",
        config=types.GenerateContentConfig(
            tools=[tool],
            temperature=0.2,
        )
    )

    # We run the chat loop
    response = chat.send_message(prompt)
    
    queries_run = []
    
    # Process tool calls
    while response.function_calls:
        for function_call in response.function_calls:
            if function_call.name == "coral_query":
                sql_query = function_call.args.get("sql", "")
                if not sql_query:
                    sql_query = getattr(function_call.args, "sql", "")
                
                # If args is a dict directly
                if type(function_call.args) is dict:
                    sql_query = function_call.args.get("sql", "")

                queries_run.append(sql_query)
                print(f"Agent running SQL: {sql_query}")
                sql_result = coral_query(sql_query)
                
                # Send the result back to the model
                response = chat.send_message(
                    types.Part.from_function_response(
                        name="coral_query",
                        response={"result": sql_result}
                    )
                )

    return {
        "explanation": response.text,
        "queries_run": queries_run
    }
