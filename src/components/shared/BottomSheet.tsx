import React from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<Props> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      {/* Dimmed Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 transition-opacity" 
        onClick={onClose} 
      />
      
      {/* Sliding Sheet */}
      <div className="relative bg-[#14171f] border-t border-[#252a3a] rounded-t-2xl p-5 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] transform transition-transform animate-[slideUp_0.3s_ease-out]">
        
        {/* Drag Handle UI Hint */}
        <div className="w-12 h-1.5 bg-[#454d66] rounded-full mx-auto mb-4" />
        
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-[#dde1ec] font-mono">{title}</h3>
          <button 
            onClick={onClose} 
            className="text-[#7880a0] hover:text-[#dde1ec] font-bold px-2 py-1"
          >
            Close
          </button>
        </div>
        
        <div className="pb-safe">{children}</div>
      </div>
    </div>
  );
};
