import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export const BottomTabBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { id: '/', label: 'HOME', icon: '⌂' },
    { id: '/graph', label: 'GRAPH', icon: '⎈' },
    { id: '/timeline', label: 'TIMELINE', icon: '⏱' },
    { id: '/settings', label: 'MORE', icon: '≡' }
  ];

  return (
    <div className="flex bg-[#14171f] border-t border-[#252a3a] pb-safe z-50">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => navigate(t.id)}
          className={`flex-1 py-3 flex flex-col items-center justify-center space-y-1 transition-colors ${
            location.pathname === t.id ? 'text-[#3a7bd5]' : 'text-[#7880a0] hover:text-[#dde1ec]'
          }`}
        >
          <span className="text-xl leading-none">{t.icon}</span>
          <span className="text-[9px] font-bold tracking-wider">{t.label}</span>
        </button>
      ))}
    </div>
  );
};
