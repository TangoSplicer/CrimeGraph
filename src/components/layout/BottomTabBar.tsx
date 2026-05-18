import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export const BottomTabBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { label: 'HOME', path: '/', icon: '⌂' },
    { label: 'GRAPH', path: '/workspace', icon: '⎈' },
    { label: 'SETTINGS', path: '/settings', icon: '⚙' }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 h-16 bg-[#14171f] border-t border-[#252a3a] flex justify-around items-center pb-safe z-50">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
              isActive ? 'text-[#3a7bd5]' : 'text-[#7880a0] hover:text-[#dde1ec]'
            }`}
          >
            <span className="text-xl leading-none">{item.icon}</span>
            <span className="text-[9px] font-bold tracking-widest uppercase">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};
