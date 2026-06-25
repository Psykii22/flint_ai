import asyncio
import json
import uuid
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# User Registry: Mapping userId -> asyncio.Queue
# In production (Cloud Run), this would be replaced by Redis Pub/Sub
user_registry = {}

def create_alert_payload(message: str, buttons: dict, target_user: str):
    alert_id = str(uuid.uuid4())
    return {
        "id": alert_id,
        "target_user": target_user,
        "sse_alert": {
            "content": {
                "message": message,
                "buttons": buttons
            },
            "display_rules": {
                "highlight_delimiter": "`",
                "style": "Professional/Clean"
            }
        }
    }

@app.get("/events")
async def message_stream(request: Request, userId: str = "guest"):
    """
    App connects here with ?userId=my_unique_id
    """
    queue = asyncio.Queue()
    user_registry[userId] = queue
    print(f"DEBUG: User '{userId}' is now ONLINE. Active users: {list(user_registry.keys())}")
    
    try:
        # Send initial check
        welcome = create_alert_payload(f"Welcome `{userId}`! Monitoring active.", {"ok": "start"}, userId)
        yield f"data: {json.dumps(welcome)}\n\n"
        
        while True:
            if await request.is_disconnected():
                break
            
            data = await queue.get()
            yield f"data: {json.dumps(data)}\n\n"
    finally:
        if userId in user_registry:
            del user_registry[userId]
        print(f"DEBUG: User '{userId}' went OFFLINE.")

@app.get("/trigger/{userId}")
async def trigger_specific_user(userId: str, msg: str = "New system update available."):
    """
    Trigger an alert for a SPECIFIC user: http://localhost:3000/trigger/user_123
    """
    if userId in user_registry:
        payload = create_alert_payload(f"Alert for `{userId}`: {msg}", {"view": "open", "ignore": "skip"}, userId)
        await user_registry[userId].put(payload)
        return {"status": "pushed", "user": userId, "alert_id": payload["id"]}
    return {"status": "error", "message": f"User {userId} is not connected"}

class UserResponse(BaseModel):
    alertId: str
    response: str

@app.post("/api/action")
async def handle_action(user_response: UserResponse):
    print(f"\n[SERVER] ACTION RECEIVED")
    print(f"Target Alert ID: {user_response.alertId}")
    print(f"User Decision: {user_response.response}")
    return {"status": "processed"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3000)
