"""Observe Note API (Sprint 6-E, 기획안 v11 F14 · 8장).

공개: GET /api/notes (발행한 노트, 커서) · GET /api/notes/{id}
      · POST/DELETE /api/notes/{id}/thunder|wave|bookmark (로그인) (북마크는 내 서재 북마크 탭에 상상과 함께)
운영자: GET /api/admin/notes · GET /api/admin/notes/{id} · POST /api/admin/notes · PATCH /api/admin/notes/{id}
        · DELETE /api/admin/notes/{id} · POST /api/admin/notes/images (본문 · 대표 이미지 → 주소)
        · POST /api/admin/notes/summary (AI 요약 초안, 저장하지 않음)
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Body, Depends, File, Query, Response, UploadFile
from sqlalchemy.orm import Session

from app.domains.auth.deps import admin_user, optional_user
from app.domains.notes import service
from app.domains.notes.schemas import (
    AdminNotesOut,
    NoteImageOut,
    NoteIn,
    NoteListOut,
    NoteOut,
    NotePatch,
    NoteReactionOut,
    NoteSummaryIn,
    NoteSummaryOut,
)
from app.domains.users.models import User
from app.infrastructure.core.database import get_db

router = APIRouter(tags=["notes"])
DB = Annotated[Session, Depends(get_db)]
Admin = Annotated[User, Depends(admin_user)]


Viewer = Annotated[User | None, Depends(optional_user)]
Kind = Literal["thunder", "wave", "bookmark"]


@router.get("/api/notes", response_model=NoteListOut)
def note_list(
    db: DB,
    viewer: Viewer,
    cursor: Annotated[str | None, Query()] = None,
    size: Annotated[int, Query(ge=1, le=50)] = 20,
):
    """발행한 노트 (최신 발행 순). 홈 피드 사이에 끼울 노트는 size=50 으로 한 번에 받는다."""
    return service.public_list(db, cursor, viewer, size)


@router.post("/api/notes/{note_id}/{kind}", response_model=NoteReactionOut)
def note_react(
    note_id: int,
    kind: Kind,
    db: DB,
    viewer: Viewer,
    via_user_id: Annotated[int | None, Body(embed=True)] = None,
):
    """Wave 는 via_user_id = 이 사람의 Wave 를 보고 Wave 함 (팔로잉 피드에서 화면이 보냄, 확산 경로)."""
    return service.react(db, viewer, note_id, kind, True, via_user_id)


@router.delete("/api/notes/{note_id}/{kind}", response_model=NoteReactionOut)
def note_unreact(note_id: int, kind: Kind, db: DB, viewer: Viewer):
    return service.react(db, viewer, note_id, kind, False)


@router.get("/api/notes/{note_id}", response_model=NoteOut)
def note_detail(note_id: int, db: DB, user: Viewer):
    return service.public_get(db, note_id, user)


@router.get("/api/admin/notes", response_model=AdminNotesOut)
def admin_notes(
    db: DB,
    _: Admin,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    return service.admin_list(db, page, size)


@router.post("/api/admin/notes/images", response_model=NoteImageOut, status_code=201)
async def admin_note_image(_: Admin, file: Annotated[UploadFile, File()]):
    return NoteImageOut(url=service.upload_image(await file.read()))


@router.post("/api/admin/notes/summary", response_model=NoteSummaryOut)
def admin_note_summary(data: NoteSummaryIn, db: DB, admin: Admin):
    """AI 요약 초안 (저장하지 않음 — 운영자가 고쳐서 노트와 함께 저장)."""
    return service.ai_summary(db, admin, data)


@router.get("/api/admin/notes/{note_id}", response_model=NoteOut)
def admin_note(note_id: int, db: DB, _: Admin):
    return service.admin_get(db, note_id)


@router.post("/api/admin/notes", response_model=NoteOut, status_code=201)
def admin_note_create(data: NoteIn, db: DB, admin: Admin):
    return service.create(db, admin, data)


@router.patch("/api/admin/notes/{note_id}", response_model=NoteOut)
def admin_note_update(note_id: int, data: NotePatch, db: DB, _: Admin):
    return service.update(db, note_id, data)


@router.delete("/api/admin/notes/{note_id}", status_code=204)
def admin_note_delete(note_id: int, db: DB, _: Admin):
    service.delete(db, note_id)
    return Response(status_code=204)
