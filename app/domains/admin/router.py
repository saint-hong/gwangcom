from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.domains.admin import policy_admin, service
from app.domains.admin.schemas import (
    AdminItemOut,
    AdminItemsOut,
    AdminUserDetail,
    AdminUsersOut,
    ModerateIn,
    PolicyIn,
    PolicyOut,
    TierIn,
    TierPatch,
    UserPatch,
    UserPolicyIn,
)
from app.domains.auth.deps import admin_user
from app.domains.imaginations.schemas import ImaginationOut
from app.domains.users.models import User
from app.infrastructure.core.database import get_db

# 운영자만 (role=admin). 일반 사용자는 403 admin_only
router = APIRouter(prefix="/api/admin", tags=["admin"])

DB = Annotated[Session, Depends(get_db)]
Admin = Annotated[User, Depends(admin_user)]


@router.get("/imaginations", response_model=AdminItemsOut)
def list_imaginations(
    db: DB,
    _: Admin,
    status: Annotated[service.StatusFilter, Query()] = "all",
    kind: Annotated[service.KindFilter, Query()] = "all",
    q: Annotated[str | None, Query(max_length=100)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query()] = 20,
    sort: Annotated[service.SortKey, Query()] = "created",
    order: Annotated[service.SortOrder, Query()] = "desc",
    prompt_id: Annotated[int | None, Query()] = None,
):
    """A4 게시물 관리 목록 (최신순, 지운 글 제외). 페이지 번호 · 한 페이지 20 · 50 · 100개."""
    return service.list_items(
        db,
        status=status,
        kind=kind,
        q=q,
        page=page,
        size=size,
        sort=sort,
        order=order,
        prompt_id=prompt_id,
    )


@router.patch("/imaginations/{imagination_id}", response_model=AdminItemOut)
def moderate_imagination(imagination_id: int, data: ModerateIn, db: DB, admin: Admin):
    """숨기기 · 다시 보이기 (F19). 이력은 moderation_logs 에 남는다."""
    return service.moderate(db, admin, imagination_id, data.status, data.reason)


@router.get("/imaginations/{imagination_id}", response_model=ImaginationOut)
def imagination_detail(imagination_id: int, db: DB, admin: Admin):
    """표에서 줄을 펼칠 때 보는 자세한 내용 (조회 기록을 남기지 않음)."""
    return service.item_detail(db, admin, imagination_id)


# ---------------------------------------------------------------- 6-B A6 기본 정책 · 등급


@router.get("/policy", response_model=PolicyOut)
def get_policy(db: DB, _: Admin):
    """항목 · 전체 기본값 · 등급별 값 · 등급 목록 · 최근 변경 기록."""
    return policy_admin.policy_view(db)


@router.put("/policy", response_model=PolicyOut)
def put_policy(data: PolicyIn, db: DB, admin: Admin):
    """전체 기본값 · 등급 값 하나를 바꾼다 (등급 값 null = 전체 기본값 따르기)."""
    return policy_admin.set_policy(db, admin, data.scope, data.tier_id, data.key, data.value)


@router.post("/tiers", response_model=PolicyOut, status_code=201)
def post_tier(data: TierIn, db: DB, admin: Admin):
    return policy_admin.create_tier(db, admin, data.name, data.description)


@router.patch("/tiers/{tier_id}", response_model=PolicyOut)
def patch_tier(tier_id: int, data: TierPatch, db: DB, admin: Admin):
    return policy_admin.update_tier(
        db, admin, tier_id, name=data.name, description=data.description, is_default=data.is_default
    )


@router.delete("/tiers/{tier_id}", response_model=PolicyOut)
def remove_tier(tier_id: int, db: DB, admin: Admin):
    """기본 등급은 못 지운다. 그 등급이던 사용자는 기본 등급으로."""
    return policy_admin.delete_tier(db, admin, tier_id)


# ---------------------------------------------------------------- 6-B A5 사용자 관리


@router.get("/users", response_model=AdminUsersOut)
def list_users(
    db: DB,
    _: Admin,
    q: Annotated[str | None, Query(max_length=100)] = None,
    role: Annotated[str, Query(pattern="^(all|user|admin)$")] = "all",
    tier_id: Annotated[int | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query()] = 20,
    sort: Annotated[policy_admin.UserSort, Query()] = "created",
    order: Annotated[service.SortOrder, Query()] = "desc",
):
    """A5 사용자 목록 (닉네임 · 이메일 찾기, 역할 · 등급 걸러 보기, 정렬, 페이지)."""
    return policy_admin.list_users(
        db, q=q, role=role, tier_id=tier_id, page=page, size=size, sort=sort, order=order
    )


@router.get("/users/{user_id}", response_model=AdminUserDetail)
def get_user(user_id: int, db: DB, _: Admin):
    """사용자 상세: 활동 요약 · 지금 적용되는 한도(어디서 왔는지) · 개인 예외 · 변경 기록."""
    return policy_admin.user_detail(db, user_id)


@router.patch("/users/{user_id}", response_model=AdminUserDetail)
def patch_user(user_id: int, data: UserPatch, db: DB, admin: Admin):
    """역할 · 등급 바꾸기 (tier_id: null = 기본 등급)."""
    return policy_admin.update_user(
        db,
        admin,
        user_id,
        role=data.role,
        tier_id=data.tier_id,
        set_tier="tier_id" in data.model_fields_set,
    )


@router.put("/users/{user_id}/policy", response_model=AdminUserDetail)
def put_user_policy(user_id: int, data: UserPolicyIn, db: DB, admin: Admin):
    """개인 예외 설정 (만료일 선택)."""
    return policy_admin.set_user_exception(
        db, admin, user_id, data.key, data.value, data.expires_at
    )


@router.delete("/users/{user_id}/policy/{key}", response_model=AdminUserDetail)
def delete_user_policy(user_id: int, key: str, db: DB, admin: Admin):
    """개인 예외 해제 (등급 · 전체 기본값을 따름)."""
    return policy_admin.clear_user_exception(db, admin, user_id, key)
