import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export const BottomTabBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { id: 'dashboard', label: 'Cases', path: '/' },
    { id: 'graph', label: 'Graph', path: '/graph' },
    { id: 'add', label: '+', path: '/add', isAction: true },
    { id: 'timeline', label: 'Timeline', path: '/timeline' },
    { id: 'more', label: 'More', path: '/more' },
  ];

  return (
    <div className="flex justify-around items-center w-full h-16 bg-[#14171f] border-t border-[#252a3a] pb-safe">
      {tabs.map((tab) => {
        const isActive = location.pathname === tab.path;
        if (tab.isAction) {
          return (
            <button 
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className="w-12 h-12 bg-[#3a7bd5] text-white rounded-full flex items-center justify-center text-2xl font-bold shadow-lg transform -translate-y-4"
            >
              {tab.label}
            </button>
          );
        }
        return (
          <button 
            key={tab.id}
            onClick={() => navigate(tab.path)}
            className={`flex flex-col items-center justify-center w-full h-full text-xs font-bold uppercase tracking-wider ${isActive ? 'text-[#3a7bd5]' : 'text-[#7880a0]'}`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
