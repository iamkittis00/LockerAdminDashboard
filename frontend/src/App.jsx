import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LockerPage from './pages/LockerPage';
import RequireAuth from './components/RequireAuth';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={<RequireAuth><DashboardPage /></RequireAuth>}
        />
        <Route
          path="/locker"
          element={<RequireAuth><LockerPage /></RequireAuth>}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
