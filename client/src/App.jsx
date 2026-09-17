import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider } from './components/Toast';
import Login from './pages/Login';
import StudentHome from './pages/student/Home';
import TeacherDetail from './pages/student/TeacherDetail';
import StudentAccount from './pages/student/Account';
import AdminLayout from './pages/admin/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import AdminStudents from './pages/admin/Students';
import AdminTeachers from './pages/admin/Teachers';
import AdminSubjects from './pages/admin/Subjects';
import AdminLevels from './pages/admin/Levels';
import AdminSelections from './pages/admin/Selections';
import AdminTeacherChoices from './pages/admin/TeacherChoices';
import AdminPayments from './pages/admin/Payments';
import AdminAnnouncements from './pages/admin/Announcements';
import AdminSettings from './pages/admin/Settings';

function GuardStudent({ children }) {
  const { isStudent } = useAuth();
  if (!isStudent) return <Navigate to="/login" replace />;
  return children;
}

function GuardAdmin({ children }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/login" replace />;
  return children;
}

function IndexRoute() {
  const { user } = useAuth();
  if (user?.role === 'ROLE_ADMIN') return <Navigate to="/admin" replace />;
  if (user?.role === 'ROLE_STUDENT') return <Navigate to="/" replace />;
  return <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={
        <GuardStudent><StudentHome /></GuardStudent>
      } />
      <Route path="/teacher/:id" element={
        <GuardStudent><TeacherDetail /></GuardStudent>
      } />
      <Route path="/account" element={
        <GuardStudent><StudentAccount /></GuardStudent>
      } />
      <Route path="/admin" element={
        <GuardAdmin><AdminLayout /></GuardAdmin>
      }>
        <Route index element={<Dashboard />} />
        <Route path="students" element={<AdminStudents />} />
        <Route path="teachers" element={<AdminTeachers />} />
        <Route path="subjects" element={<AdminSubjects />} />
        <Route path="levels" element={<AdminLevels />} />
        <Route path="selections" element={<AdminSelections />} />
        <Route path="teacher-choices" element={<AdminTeacherChoices />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="announcements" element={<AdminAnnouncements />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>
      <Route path="*" element={<IndexRoute />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  );
}