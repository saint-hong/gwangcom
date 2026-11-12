import { ImagePlus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/feedback/Toast";
import { Avatar } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import type { Me } from "../../types/api";
import styles from "./EditProfileModal.module.css";

const BIO_MAX = 160;

type Props = { me: Me; onClose: () => void; onSaved: (me: Me) => void };

/**
 * 프로필 수정 팝업 — X 구조 (v10 반영목록 7장, etc_datas/x_로그인_프로필상세_프로필설정클릭_2~3)
 *   [×] 프로필 수정 …… [저장]
 *   커버 이미지 (바꾸기 · 지우기) → 프로필 이미지 (바꾸기) → 이름(닉네임) → 자기소개
 * 위치 · 생년월일 · 웹사이트 같은 개인 정보는 받지 않는다. 닉네임을 바꾸면 프로필 주소도 바뀐다.
 */
export function EditProfileModal({ me, onClose, onSaved }: Props) {
  const { setMe } = useAuth();
  const toast = useToast();
  const [nickname, setNickname] = useState(me.nickname);
  const [bio, setBio] = useState(me.bio ?? "");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  const avatarUrl = useMemo(() => (avatar ? URL.createObjectURL(avatar) : me.avatar_url), [avatar, me.avatar_url]);
  const coverUrl = useMemo(
    () => (cover ? URL.createObjectURL(cover) : removeCover ? null : me.cover_url),
    [cover, removeCover, me.cover_url],
  );
  useEffect(() => () => void (avatar && avatarUrl && URL.revokeObjectURL(avatarUrl)), [avatar, avatarUrl]);
  useEffect(() => () => void (cover && coverUrl && URL.revokeObjectURL(coverUrl)), [cover, coverUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    setError(null);
    const form = new FormData();
    form.set("nickname", nickname);
    form.set("bio", bio);
    if (avatar) form.set("avatar", avatar);
    if (cover) form.set("cover", cover);
    else if (removeCover) form.set("remove_cover", "true");
    try {
      const updated = await api<Me>("/api/users/me", { method: "PATCH", form });
      setMe(updated);
      toast.show("프로필을 저장했어요.");
      onSaved(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setSaving(false);
    }
  };

  const pick = (input: HTMLInputElement | null, set: (f: File | null) => void) => {
    const file = input?.files?.[0] ?? null;
    if (file) set(file);
    if (input) input.value = "";
  };

  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="edit-profile-title">
        <div className={styles.top}>
          <button type="button" className={styles.iconBtn} aria-label="닫기" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
          <h2 id="edit-profile-title" className={styles.heading}>
            프로필 수정
          </h2>
          <button type="button" className={styles.save} disabled={saving || bio.length > BIO_MAX} onClick={() => void save()}>
            저장
          </button>
        </div>

        <div className={styles.scroll}>
          <div className={styles.cover}>
            {coverUrl ? <img src={coverUrl} alt="" /> : null}
            <div className={styles.coverTools}>
              <button type="button" className={styles.overlayBtn} aria-label="커버 이미지 바꾸기" onClick={() => coverInput.current?.click()}>
                <ImagePlus aria-hidden="true" />
              </button>
              {coverUrl ? (
                <button
                  type="button"
                  className={styles.overlayBtn}
                  aria-label="커버 이미지 지우기"
                  onClick={() => {
                    setCover(null);
                    setRemoveCover(true);
                  }}
                >
                  <X aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <input
              ref={coverInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(e) => {
                pick(e.currentTarget, setCover);
                setRemoveCover(false);
              }}
            />
          </div>

          <div className={styles.avatarWrap}>
            <Avatar name={nickname || me.nickname} src={avatarUrl} size={120} />
            <button type="button" className={`${styles.overlayBtn} ${styles.avatarBtn}`} aria-label="프로필 이미지 바꾸기" onClick={() => avatarInput.current?.click()}>
              <ImagePlus aria-hidden="true" />
            </button>
            <input
              ref={avatarInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(e) => pick(e.currentTarget, setAvatar)}
            />
          </div>

          <label className={styles.field}>
            <span className={styles.label}>이름</span>
            <input className={styles.input} value={nickname} maxLength={20} onChange={(e) => setNickname(e.target.value)} />
          </label>
          <p className={styles.hint}>한글 · 영문 · 숫자 · 밑줄(_) 2~20자. 바꾸면 프로필 주소(@이름)도 바뀌어요.</p>

          <label className={styles.field}>
            <span className={styles.label}>
              자기소개
              <span className={bio.length > BIO_MAX ? styles.over : styles.counter}>
                {bio.length} / {BIO_MAX}
              </span>
            </span>
            <textarea className={styles.textarea} value={bio} rows={3} onChange={(e) => setBio(e.target.value)} />
          </label>

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
