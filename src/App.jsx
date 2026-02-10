import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import EditCover from "./pages/EditCover";
import EditPages from "./pages/EditPages";
import Done from "./pages/Done";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/album/:id/cover" element={<EditCover />} />
        <Route path="/album/:id/pages" element={<EditPages />} />
        <Route path="/album/:id/done" element={<Done />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
