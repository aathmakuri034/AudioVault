from fastapi import APIRouter

from app.api.deps import MediaServiceDep

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(service: MediaServiceDep) -> dict[str, object]:
    return {"status": "ok", "providers": service.registry.names}
