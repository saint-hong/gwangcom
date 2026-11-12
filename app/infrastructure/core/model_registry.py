"""모든 ORM 모델을 한 번에 불러온다 — Alembic autogenerate 와 테스트가 Base.metadata 를 채우는 데 쓴다."""

from app.domains.admin import models as admin_models  # noqa: F401
from app.domains.imaginations import models as imaginations_models  # noqa: F401
from app.domains.notifications import models as notifications_models  # noqa: F401
from app.domains.policy import models as policy_models  # noqa: F401
from app.domains.prompts import models as prompts_models  # noqa: F401
from app.domains.reactions import models as reactions_models  # noqa: F401
from app.domains.shake import models as shake_models  # noqa: F401
from app.domains.similar import models as similar_models  # noqa: F401
from app.domains.tags import models as tags_models  # noqa: F401
from app.domains.users import models as users_models  # noqa: F401
from app.infrastructure.llm import models as llm_models  # noqa: F401
