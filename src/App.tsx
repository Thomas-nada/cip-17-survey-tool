import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext.tsx';
import { PageLayout } from './components/layout/PageLayout.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { CreateSurveyPage } from './pages/CreateSurveyPage.tsx';
import { SurveyListPage } from './pages/SurveyListPage.tsx';
import { SurveyDetailPage } from './pages/SurveyDetailPage.tsx';
import { AboutPage } from './pages/AboutPage.tsx';
import { I18nProvider } from './context/I18nContext.tsx';

function App() {
  return (
    <HashRouter>
      <I18nProvider>
        <AppProvider>
          <PageLayout>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/create" element={<CreateSurveyPage />} />
              <Route path="/surveys" element={<SurveyListPage />} />
              <Route path="/survey/:surveyTxId" element={<SurveyDetailPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </PageLayout>
        </AppProvider>
      </I18nProvider>
    </HashRouter>
  );
}

export default App;
