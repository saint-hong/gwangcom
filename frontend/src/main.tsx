import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ToastProvider } from "./components/feedback/Toast";
import { AuthProvider } from "./hooks/useAuth";
import { DreamerCardProvider } from "./hooks/useDreamerCard";
import { UnreadProvider } from "./hooks/useUnread";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./styles/tokens.css";
import "./styles/base.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <UnreadProvider>
            <DreamerCardProvider>
              <App />
            </DreamerCardProvider>
          </UnreadProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
