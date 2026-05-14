import React from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({ isOpen, onClose, title, children }) => {
  return (
    <>
      {/* Darkened Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 transition-opacity" 
          onClick={onClose}
        />
      )}
      
      {/* Sheet Container */}
      <div 
        className={`fixed inset-x-0 bottom-0 z-50 bg-[#14171f] rounded-t-2xl transform transition-transform duration-300 ease-in-out border-t border-[#252a3a] flex flex-col max-h-[85vh] ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-[#252a3a] shrink-0">
          <h3 className="font-bold text-[#dde1ec] text-lg">{title}</h3>
          <button 
            onClick={onClose} 
            className="text-[#7880a0] text-2xl leading-none hover:text-[#dde1ec] p-2 -mr-2"
          >
            &times;
          </button>
        </div>
        
        {/* 🚀 FIXED: Content Area is now scrollable with extra bottom padding for mobile safe areas */}
        <div className="p-4 overflow-y-auto pb-safe-offset-12 pb-12">
          {children}
        </div>
      </div>
    </>
  );
};
