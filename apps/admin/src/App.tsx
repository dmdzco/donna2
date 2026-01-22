import { Routes, Route, NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Phone, Bell } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Seniors from './pages/Seniors';
import Calls from './pages/Calls';
import Reminders from './pages/Reminders';

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Donna Admin</h1>
            <p className="text-white/80 text-sm">Manage seniors, calls, and reminders</p>
          </div>
          <div className="bg-white/15 px-3 py-1.5 rounded-lg text-sm font-semibold">
            v3.1
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-600 hover:text-indigo-600'
                }`
              }
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </NavLink>
            <NavLink
              to="/seniors"
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-600 hover:text-indigo-600'
                }`
              }
            >
              <Users className="w-4 h-4" />
              Seniors
            </NavLink>
            <NavLink
              to="/calls"
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-600 hover:text-indigo-600'
                }`
              }
            >
              <Phone className="w-4 h-4" />
              Calls
            </NavLink>
            <NavLink
              to="/reminders"
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-600 hover:text-indigo-600'
                }`
              }
            >
              <Bell className="w-4 h-4" />
              Reminders
            </NavLink>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/seniors" element={<Seniors />} />
          <Route path="/calls" element={<Calls />} />
          <Route path="/reminders" element={<Reminders />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
