from pydantic import BaseModel

from app.domains.imaginations.schemas import ImaginationOut
from app.domains.users.schemas import FollowUserOut


class SearchImaginationsOut(BaseModel):
    """상상 검색 결과. 글자가 맞는 상상이 먼저, 그 뒤에 글자는 다르지만 뜻이 비슷한 상상."""

    query: str
    total: int
    items: list[ImaginationOut]
    meaning_ids: list[int]  # 이 페이지에서 "뜻이 비슷해서" 찾은 상상 (화면 표시용)
    next_cursor: str | None


class SearchTopic(BaseModel):
    name: str
    label: str
    count: int  # 이 주제가 붙은 상상 수 (태그별 상상 화면과 같은 수)


class SearchTopicsOut(BaseModel):
    query: str
    total: int
    items: list[SearchTopic]  # 이름이 검색어와 겹치는 주제
    related: list[SearchTopic] = []  # 이름은 안 맞지만 상상 검색 결과에 많이 쓰인 주제


class SearchDreamersOut(BaseModel):
    query: str
    total: int
    items: list[FollowUserOut]
    next_cursor: str | None
