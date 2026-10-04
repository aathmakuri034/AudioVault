"""FastAPI dependencies. Tests can override these via ``app.dependency_overrides``."""

from typing import Annotated

from fastapi import Depends, Request

from app.services.media.media_service import MediaService


def get_media_service(request: Request) -> MediaService:
    return request.app.state.media_service


MediaServiceDep = Annotated[MediaService, Depends(get_media_service)]
