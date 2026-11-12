import type { LucideIcon } from "lucide-react";
import { Bell, Bookmark, Home, Mail, NotebookPen, User, Zap } from "lucide-react";

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

/**
 * 왼쪽 사이드바 메뉴 (하이젠버그 로그인 전·후 구조, 기획안 v9 4장)
 * - 앱 다운로드는 없다(앱 없음). 주제는 오른쪽 컬럼 "추천 주제"에서 들어간다.
 * - 내 활동은 계정 메뉴로 옮겼다.
 */
export function sideNav(nickname: string | null): NavItem[] {
  const home: NavItem = { to: "/", label: "홈", icon: Home, end: true };
  const trending: NavItem = { to: "/trending", label: "인기 상상", icon: Zap };
  const notes: NavItem = { to: "/notes", label: "Observe Note", icon: NotebookPen };
  const feedback: NavItem = { to: "/feedback", label: "피드백 및 문의하기", icon: Mail };
  if (!nickname) return [home, trending, notes, feedback];
  return [
    home,
    trending,
    { to: "/notifications", label: "알림", icon: Bell },
    { to: "/library", label: "내 서재", icon: Bookmark },
    { to: `/@${nickname}`, label: "프로필", icon: User },
    notes,
    feedback,
  ];
}
