"""업로드 이미지 저장 (로컬 디스크 data/uploads). 확장자가 아니라 실제 내용(Pillow)으로 형식을 확인한다."""

import io
import uuid
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from app.infrastructure.core.config import get_settings
from app.shared.errors import bad_request
from app.shared.time import now_utc

ALLOWED = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp", "GIF": "gif"}


def upload_root() -> Path:
    root = Path(get_settings().upload_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_image(data: bytes, max_mb: int) -> str:
    """이미지를 저장하고 공개 주소(/uploads/2026/11/xxx.png)를 돌려준다."""
    if len(data) > max_mb * 1024 * 1024:
        raise bad_request("image_too_large", f"이미지는 {max_mb}MB 까지 올릴 수 있어요.")
    try:
        with Image.open(io.BytesIO(data)) as img:
            fmt = img.format
            img.verify()
    except (UnidentifiedImageError, OSError) as exc:
        raise bad_request("invalid_image", "이미지 파일을 읽을 수 없어요.") from exc
    if fmt not in ALLOWED:
        raise bad_request("invalid_image", "JPG · PNG · WEBP · GIF 이미지만 올릴 수 있어요.")

    sub = now_utc().strftime("%Y/%m")
    name = f"{uuid.uuid4().hex}.{ALLOWED[fmt]}"
    folder = upload_root() / sub
    folder.mkdir(parents=True, exist_ok=True)
    (folder / name).write_bytes(data)
    return f"{get_settings().upload_url_prefix}/{sub}/{name}"
