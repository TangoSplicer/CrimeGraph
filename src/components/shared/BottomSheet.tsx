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
        className={`fixed inset-x-0 bottom-sheet-above-nav z-[60] bg-[#14171f] rounded-t-2xl transform transition-transform duration-300 ease-in-out border-t border-[#252a3a] flex flex-col ${
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
        
        {/* The scroll area reserves clearance for its action area and Android navigation. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-safe-action">
          {children}
        </div>
      </div>
    </>
  );
};
