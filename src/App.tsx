import { useEffect, useState } from 'react';
import { ThemeProvider } from '@/context/ThemeContext';
import { AppProvider } from '@/context/AppContext';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { OwnerCenterView } from '@/views/OwnerCenterView';
import { DashboardView } from '@/views/DashboardView';
import { AssistantView } from '@/views/AssistantView';
import { CharactersView } from '@/views/CharactersView';
import { IntegrationsView } from '@/views/IntegrationsView';
import { UniversesView } from '@/views/UniversesView';
import { ProjectsView } from '@/views/ProjectsView';
import { ContentPipelineView } from '@/views/ContentPipelineView';
import { VoiceStudioView } from '@/views/VoiceStudioView';
import { OmniRouteView } from '@/views/OmniRouteView';
import { ApprovalsView } from '@/views/ApprovalsView';
import { VaultView } from '@/views/VaultView';
import { MemoryView } from '@/views/MemoryView';
import { SecurityView } from '@/views/SecurityView';
import { FutureEngineerView } from '@/views/FutureEngineerView';
import { ReadinessView } from '@/views/ReadinessView';
import { DailyReportView } from '@/views/DailyReportView';
import type { ViewKey } from '@/types';

const VALID_VIEWS: ViewKey[] = [
  'owner_center', 'dashboard', 'assistant', 'characters', 'integrations', 'universes', 'projects',
  'content_pipeline', 'voice_studio', 'omniroute', 'approvals', 'vault', 'memory', 'security',
  'future_engineer', 'readiness', 'daily_report',
];

function viewFromHash(): ViewKey | null {
  if (typeof window === 'undefined') return null;
  const candidate = window.location.hash.replace(/^#/, '').split('/')[0] as ViewKey;
  return VALID_VIEWS.includes(candidate) ? candidate : null;
}

function AppContent() {
  const [activeView, setActiveView] = useState<ViewKey>(() => viewFromHash() ?? 'owner_center');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const syncView = () => setActiveView(viewFromHash() ?? 'owner_center');
    window.addEventListener('hashchange', syncView);
    return () => window.removeEventListener('hashchange', syncView);
  }, []);

  const navigateToView = (view: ViewKey) => {
    setActiveView(view);
    const currentHash = window.location.hash.replace(/^#/, '');
    const currentRoute = currentHash.split('/')[0];
    const nextHash = currentRoute === view && currentHash.includes('/') ? currentHash : view;
    if (currentHash !== nextHash) window.location.hash = nextHash;
  };

  const renderView = () => {
    switch (activeView) {
      case 'owner_center':
        return <OwnerCenterView onNavigate={(view) => navigateToView(view as ViewKey)} />;
      case 'dashboard':
        return <DashboardView onNavigate={(view) => navigateToView(view as ViewKey)} />;
      case 'assistant':
        return <AssistantView onNavigate={(view) => navigateToView(view as ViewKey)} />;
      case 'characters':
        return <CharactersView />;
      case 'integrations':
        return <IntegrationsView onNavigate={navigateToView} />;
      case 'universes':
        return <UniversesView />;
      case 'projects':
        return <ProjectsView />;
      case 'content_pipeline':
        return <ContentPipelineView />;
      case 'voice_studio':
        return <VoiceStudioView />;
      case 'omniroute':
        return <OmniRouteView />;
      case 'approvals':
        return <ApprovalsView />;
      case 'vault':
        return <VaultView />;
      case 'memory':
        return <MemoryView />;
      case 'security':
        return <SecurityView />;
      case 'future_engineer':
        return <FutureEngineerView />;
      case 'readiness':
        return <ReadinessView />;
      case 'daily_report':
        return <DailyReportView />;
      default:
        return <OwnerCenterView onNavigate={(view) => navigateToView(view as ViewKey)} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-primary" dir="rtl">
      <Sidebar
        activeView={activeView}
        onNavigate={navigateToView}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          activeView={activeView}
          onMenuClick={() => setSidebarOpen(true)}
          onNavigate={navigateToView}
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          {renderView()}
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ThemeProvider>
  );
}

export default App;
