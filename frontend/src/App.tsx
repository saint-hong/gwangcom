import { lazy, Suspense, useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { useAuth, type AuthMode } from "./hooks/useAuth";
import { PlaceholderPage } from "./pages/common/PlaceholderPage";
import { FollowListRoute, ProfileRoute } from "./pages/common/ProfileRoute";
import { AdminImaginationsPage } from "./pages/admin/AdminImaginationsPage";
import { AdminDashboardPage } from "./pages/admin/dashboard/AdminDashboardPage";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminNoteEditPage } from "./pages/admin/AdminNoteEditPage";
import { AdminNotesPage } from "./pages/admin/AdminNotesPage";
import { AdminPolicyPage } from "./pages/admin/AdminPolicyPage";
import { AdminPromptsPage } from "./pages/admin/AdminPromptsPage";
import { AdminUserDetailPage } from "./pages/admin/AdminUserDetailPage";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage";
import { TagPage } from "./pages/topics/TagPage";
import { PromptListPage } from "./pages/prompt/PromptListPage";
import { PromptPage } from "./pages/prompt/PromptPage";
import { TopicsPage } from "./pages/topics/TopicsPage";
import { HomePage } from "./pages/home/HomePage";
import { ImaginationPage } from "./pages/imagination/ImaginationPage";
import { LibraryPage } from "./pages/library/LibraryPage";
import { NoteListPage } from "./pages/notes/NoteListPage";
import { NotePage } from "./pages/notes/NotePage";
import { NotificationsPage } from "./pages/notifications/NotificationsPage";
import { SearchPage } from "./pages/search/SearchPage";
import { SettingsPage } from "./pages/settings/SettingsPage";
import { TrendingPage } from "./pages/trending/TrendingPage";
import { LineagePage } from "./pages/lineage/LineagePage";
import { WritePage } from "./pages/write/WritePage";

// 탐색기는 그래프 라이브러리(sigma)가 커서 이 화면을 열 때만 불러온다 (Sprint 7-B)
const AdminGraphPage = lazy(() => import("./pages/admin/graph/AdminGraphPage").then((m) => ({ default: m.AdminGraphPage })));

/** /login · /signup — 홈 위에 로그인·가입 모달을 띄운다 (기획안 v9 S2) */
function AuthRoute({ mode }: { mode: AuthMode }) {
  const { user, openAuth } = useAuth();
  useEffect(() => {
    if (user === null) openAuth(mode);
  }, [user, mode, openAuth]);
  return <HomePage />;
}

/** 라우팅 (기획안 v9 4장 화면 목록). 아직 없는 화면은 PlaceholderPage 로 자리만 잡아 둔다. */
export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<AuthRoute mode="login" />} />
        <Route path="signup" element={<AuthRoute mode="signup" />} />
        <Route path="write" element={<WritePage />} />
        <Route path="i/:id" element={<ImaginationPage />} />
        <Route path="i/:id/lineage" element={<LineagePage />} />
        <Route path="trending" element={<TrendingPage />} />
        <Route path="topics" element={<TopicsPage />} />
        <Route path="tags/:name" element={<TagPage />} />
        <Route path="prompts" element={<PromptListPage />} />
        <Route path="prompts/:id" element={<PromptPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="notes" element={<NoteListPage />} />
        <Route path="notes/:id" element={<NotePage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="me/activity" element={<PlaceholderPage title="내 활동" sprint="Sprint 8" />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="feedback" element={<PlaceholderPage title="피드백 및 문의하기" sprint="Sprint 9" />} />
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="notes" element={<AdminNotesPage />} />
          <Route path="notes/:id" element={<AdminNoteEditPage />} />
          <Route path="prompts" element={<AdminPromptsPage />} />
          <Route path="imaginations" element={<AdminImaginationsPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="users/:id" element={<AdminUserDetailPage />} />
          <Route path="policy" element={<AdminPolicyPage />} />
          <Route
            path="graph"
            element={
              <Suspense fallback={<p style={{ padding: 24 }}>불러오는 중…</p>}>
                <AdminGraphPage />
              </Suspense>
            }
          />
          <Route path="*" element={<PlaceholderPage title="운영자 화면" sprint="Sprint 6" description="없는 운영자 화면이에요." />} />
        </Route>
        <Route path=":handle" element={<ProfileRoute />} />
        <Route path=":handle/followers" element={<FollowListRoute tab="followers" />} />
        <Route path=":handle/following" element={<FollowListRoute tab="following" />} />
        <Route
          path="*"
          element={<PlaceholderPage title="페이지를 찾을 수 없어요" sprint="" description="주소를 다시 확인해 주세요." />}
        />
      </Route>
    </Routes>
  );
}
