import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { KhataStatement } from './KhataStatement';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/tab/:uuid" element={<KhataStatement />} />
        {/* Default route redirect to sample test customer for frictionless verification */}
        <Route path="/" element={<Navigate to="/tab/f8a9-4b2c" replace />} />
        <Route path="*" element={<Navigate to="/tab/f8a9-4b2c" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
