import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import EditCover from "./pages/EditCover";
import PagesCount from "./pages/PagesCount";
import EditPages from "./pages/EditPages";
import Preview from "./pages/Preview";
import Done from "./pages/Done";
import ViewAlbum from "./pages/ViewAlbum";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/album/:id/cover" element={<EditCover />} />
        <Route path="/album/:id/pages-count" element={<PagesCount />} />
        <Route path="/album/:id/pages" element={<EditPages />} />
        <Route path="/album/:id/preview" element={<Preview />} />
        <Route path="/album/:id/done" element={<Done />} />
        <Route path="/view/:token" element={<ViewAlbum />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
