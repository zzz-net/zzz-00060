import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import BatchImport from './pages/BatchImport';
import RuleConfig from './pages/RuleConfig';
import AnomalyReview from './pages/AnomalyReview';
import Report from './pages/Report';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<BatchImport />} />
          <Route path="/rules" element={<RuleConfig />} />
          <Route path="/review" element={<AnomalyReview />} />
          <Route path="/report" element={<Report />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
