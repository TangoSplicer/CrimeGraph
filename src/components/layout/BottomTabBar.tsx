import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { can } from '../../utils/permissions';

export const BottomTabBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = useAuthStore((state) => state.currentUser);

  const navItems = [
    { label: 'HOME', path: '/', icon: '⌂' },
    { label: 'GRAPH', path: '/workspace', icon: '⎈' },
    ...(can(currentUser?.role, 'intelligence:review') ? [{ label: 'REVIEW', path: '/review', icon: '✓' }] : []),
    { label: 'SETTINGS', path: '/settings', icon: '⚙' },
  ];

  return (
    <nav aria-label="Primary navigation" className="fixed bottom-0 left-0 right-0 min-h-16 bg-[#14171f] border-t border-[#252a3a] flex items-start pb-safe z-50">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex flex-1 min-w-0 flex-col items-center justify-center h-16 space-y-1 transition-colors ${
              isActive ? 'text-[#3a7bd5]' : 'text-[#7880a0] hover:text-[#dde1ec]'
            }`}
          >
            <span className="text-xl leading-none">{item.icon}</span>
            <span className="text-[9px] font-bold tracking-widest uppercase">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
