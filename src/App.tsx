import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Checklist from './pages/Checklist';
import BatchImport from './pages/BatchImport';
import RuleConfig from './pages/RuleConfig';
import AnomalyReview from './pages/AnomalyReview';
import Report from './pages/Report';
import ExportTasks from './pages/ExportTasks';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Checklist />} />
          <Route path="/import" element={<BatchImport />} />
          <Route path="/rules" element={<RuleConfig />} />
          <Route path="/review" element={<AnomalyReview />} />
          <Route path="/report" element={<Report />} />
          <Route path="/export-tasks" element={<ExportTasks />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
