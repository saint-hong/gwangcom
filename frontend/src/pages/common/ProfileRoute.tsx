import { useParams } from "react-router-dom";
import { FollowListPage, type FollowTab } from "../profile/FollowListPage";
import { ProfilePage } from "../profile/ProfilePage";
import { PlaceholderPage } from "./PlaceholderPage";

/** 프로필 주소는 /@닉네임 (기획안 F16). react-router 는 '@' 가 붙은 부분 경로를 못 받으므로 여기서 거른다. */
export function ProfileRoute() {
  const { handle = "" } = useParams();
  if (!handle.startsWith("@") || handle.length < 2) {
    return <PlaceholderPage title="페이지를 찾을 수 없어요" sprint="" description="주소를 다시 확인해 주세요." />;
  }
  return <ProfilePage key={handle} nickname={decodeURIComponent(handle.slice(1))} />;
}

/** /@닉네임/followers · /@닉네임/following — 팔로워 · 팔로잉 목록 */
export function FollowListRoute({ tab }: { tab: FollowTab }) {
  const { handle = "" } = useParams();
  if (!handle.startsWith("@") || handle.length < 2) {
    return <PlaceholderPage title="페이지를 찾을 수 없어요" sprint="" description="주소를 다시 확인해 주세요." />;
  }
  return <FollowListPage key={`${handle}-${tab}`} nickname={decodeURIComponent(handle.slice(1))} tab={tab} />;
}
