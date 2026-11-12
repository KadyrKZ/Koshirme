import asyncio
import io
from abc import ABC, abstractmethod
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError

from app.config import settings

Image.MAX_IMAGE_PIXELS = 16_000_000


class ScreenshotStorage(ABC):
    @abstractmethod
    async def save(self, data: bytes) -> str: ...

    @abstractmethod
    async def read(self, filename: str) -> bytes: ...

    @abstractmethod
    async def delete(self, filename: str) -> None: ...


class LocalScreenshotStorage(ScreenshotStorage):
    def __init__(self, root: Path):
        self.root = root.resolve()

    def _path(self, filename: str) -> Path:
        import re

        if not re.fullmatch(r"[0-9a-f-]{36}\.jpg", filename):
            raise HTTPException(404, "Screenshot not found")
        return self.root / filename

    async def save(self, data: bytes) -> str:
        def write():
            try:
                with Image.open(io.BytesIO(data)) as original:
                    if original.format != "JPEG" or original.width * original.height > 16_000_000:
                        raise ValueError("Invalid JPEG dimensions")
                    original.load()
                    image = original.convert("RGB")
                    image.thumbnail((2560, 1440))
            except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
                raise HTTPException(422, "A valid JPEG screenshot is required") from exc
            self.root.mkdir(parents=True, exist_ok=True)
            filename = f"{uuid4()}.jpg"
            image.save(self._path(filename), "JPEG", quality=75, optimize=True)
            return filename

        return await asyncio.to_thread(write)

    async def read(self, filename: str) -> bytes:
        try:
            return await asyncio.to_thread(self._path(filename).read_bytes)
        except FileNotFoundError as exc:
            raise HTTPException(404, "Screenshot not found") from exc

    async def delete(self, filename: str) -> None:
        await asyncio.to_thread(self._path(filename).unlink, missing_ok=True)


storage: ScreenshotStorage = LocalScreenshotStorage(settings.upload_dir)
