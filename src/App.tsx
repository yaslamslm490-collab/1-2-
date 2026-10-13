import { useState } from 'react';
import { ThemeProvider } from '@/context/ThemeContext';
import { AppProvider } from '@/context/AppContext';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { OwnerCenterView } from '@/views/OwnerCenterView';
import { DashboardView } from '@/views/DashboardView';
import { AssistantView } from '@/views/AssistantView';
import { CharactersView } from '@/views/CharactersView';
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

function AppContent() {
  const [activeView, setActiveView] = useState<ViewKey>('owner_center');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const renderView = () => {
    switch (activeView) {
      case 'owner_center':
        return <OwnerCenterView onNavigate={(view) => setActiveView(view as ViewKey)} />;
      case 'dashboard':
        return <DashboardView onNavigate={(view) => setActiveView(view as ViewKey)} />;
      case 'assistant':
        return <AssistantView onNavigate={(view) => setActiveView(view as ViewKey)} />;
      case 'characters':
        return <CharactersView />;
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
        return <OwnerCenterView onNavigate={(view) => setActiveView(view as ViewKey)} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-primary" dir="rtl">
      <Sidebar
        activeView={activeView}
        onNavigate={setActiveView}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          activeView={activeView}
          onMenuClick={() => setSidebarOpen(true)}
          onNavigate={setActiveView}
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
