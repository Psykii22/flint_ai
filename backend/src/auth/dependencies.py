from fastapi import Header, Cookie, HTTPException
from backend.src.database.postgres import supabase
from enum import Enum


class LoginStatus(str, Enum):
    NOT_FOUND = "not_found"
    NO_PHONE  = "no_phone"
    ACTIVE    = "active"


def check_user_status(*, user_id: str = None, email: str = None) -> tuple[LoginStatus, dict | None]:
    query = supabase.table("profiles").select("*")
    query = query.eq("id", user_id) if user_id else query.eq("email", email)
    try:
        result = query.single().execute()
    except Exception:
        return LoginStatus.NOT_FOUND, None
    if not result.data:
        return LoginStatus.NOT_FOUND, None
    if not result.data.get("phone_number"):
        return LoginStatus.NO_PHONE, result.data
    return LoginStatus.ACTIVE, result.data


async def get_valid_user(
    authorization: str = Header(None),
    access_token: str = Cookie(None),
) -> dict:
    token = None
    if authorization:
        token = authorization.split(" ")[1]
    elif access_token:
        token = access_token

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        user_res = supabase.auth.get_user(token)
        if not user_res.user:
            raise HTTPException(status_code=401, detail="Invalid session")
    except Exception:
        raise HTTPException(status_code=401, detail="Unauthorized")

    status, profile = check_user_status(user_id=user_res.user.id)
    if status == LoginStatus.NOT_FOUND:
        raise HTTPException(status_code=401, detail="Account not found")
    if status == LoginStatus.NO_PHONE:
        raise HTTPException(status_code=403, detail="Mobile verification required")
    return profile