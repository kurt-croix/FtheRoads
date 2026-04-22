import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";

import SplashPage from "./pages/SplashPage";
import Index from "./pages/Index";
import { ReportListPage } from "./pages/ReportList";
import ReportDetail from "./pages/ReportDetail";
import { NIP19Page } from "./pages/NIP19Page";
import NotFound from "./pages/NotFound";

export function AppRouter() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<SplashPage />} />
        <Route path="/map" element={<Index />} />
        <Route path="/reports" element={<ReportListPage />} />
        <Route path="/report/:id" element={<ReportDetail />} />
        {/* NIP-19 route for npub1, note1, naddr1, nprofile1 */}
        <Route path="/:nip19" element={<NIP19Page />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
export default AppRouter;
