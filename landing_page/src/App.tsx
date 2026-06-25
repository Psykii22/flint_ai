import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Footer from './components/Footer';
import AuthScreen from './components/AuthScreen';
import OverviewWorkspace from './components/OverviewWorkspace';
import NodesWorkspace from './components/NodesWorkspace';
import ExplorerWorkspace from './components/ExplorerWorkspace';
import VaultWorkspace from './components/VaultWorkspace';
import CopilotWorkspace from './components/CopilotWorkspace';
import { ActiveScreen } from './types';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>('nellammishra12@gmail.com');
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('overview');
  const [searchFilter, setSearchFilter] = useState('');
  const [sqlExplorerInitialText, setSqlExplorerInitialText] = useState('');

  const handleLoginSuccess = (email: string) => {
    setUserEmail(email);
    setIsAuthenticated(true);
    setActiveScreen('overview');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setActiveScreen('auth');
  };

  // Card trigger on overview transitions into explorer tab
  const handleAnalyzeCard = (topicId: string, queryText: string) => {
    setSqlExplorerInitialText(queryText);
    setActiveScreen('explorer');
  };

  return (
    <div className="min-h-screen bg-[#121414] text-[#e3e2e2] overflow-hidden select-none font-sans">
      
      {/* Transactional lock authentication page (Screen 4) */}
      {!isAuthenticated || activeScreen === 'auth' ? (
        <AuthScreen onLoginSuccess={handleLoginSuccess} />
      ) : (
        <div className="w-full h-screen block">
          
          {/* Main system layout components - Sidebar Navigation */}
          <Sidebar
            activeScreen={activeScreen}
            setScreen={setActiveScreen}
            isAuthenticated={isAuthenticated}
            onLogout={handleLogout}
          />

          {/* Top terminal path actions bar */}
          <TopBar
            activeScreen={activeScreen}
            searchFilter={searchFilter}
            setSearchFilter={setSearchFilter}
            isAuthenticated={isAuthenticated}
          />

          {/* Core content routing screens switches */}
          <div className="w-full h-full block">
            {activeScreen === 'overview' && (
              <OverviewWorkspace 
                onAnalyzeCard={handleAnalyzeCard} 
                searchFilter={searchFilter}
              />
            )}
            
            {activeScreen === 'nodes' && (
              <NodesWorkspace 
                searchFilter={searchFilter} 
              />
            )}
            
            {activeScreen === 'copilot' && (
              <CopilotWorkspace />
            )}

            {activeScreen === 'explorer' && (
              <ExplorerWorkspace 
                initialSql={sqlExplorerInitialText} 
              />
            )}
            
            {activeScreen === 'vault' && (
              <VaultWorkspace />
            )}
          </div>

          {/* Operating footer status log rail */}
          <Footer 
            latency={1} 
            cluster="kr8-local" 
            systemStatus="Cluster Ready" 
          />

        </div>
      )}

    </div>
  );
}
