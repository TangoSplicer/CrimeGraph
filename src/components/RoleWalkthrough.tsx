import React, { useEffect, useMemo, useState } from 'react';
import type { User } from '../stores/authStore';
import {
  getWalkthroughSteps,
  hasCompletedWalkthrough,
  markWalkthroughComplete,
  roleWalkthroughEventName,
} from '../utils/roleWalkthrough';

interface RoleWalkthroughProps {
  user: User;
}

export const RoleWalkthrough: React.FC<RoleWalkthroughProps> = ({ user }) => {
  const steps = useMemo(() => getWalkthroughSteps(user), [user]);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    let active = true;
    setStepIndex(0);
    setIsLoading(true);
    hasCompletedWalkthrough(user.id)
      .then((complete) => { if (active) setIsVisible(!complete); })
      .finally(() => { if (active) setIsLoading(false); });

    const reopen = () => {
      setStepIndex(0);
      setIsVisible(true);
    };
    window.addEventListener(roleWalkthroughEventName, reopen);
    return () => {
      active = false;
      window.removeEventListener(roleWalkthroughEventName, reopen);
    };
  }, [user.id]);

  const close = async () => {
    await markWalkthroughComplete(user.id);
    setIsVisible(false);
  };

  if (isLoading || !isVisible) return null;

  const step = steps[stepIndex];
  const isFinalStep = stepIndex === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#05070c]/85 p-safe-modal" role="dialog" aria-modal="true" aria-labelledby="walkthrough-title">
      <div className="safe-modal-card w-full max-w-lg rounded-t-xl sm:rounded-xl border border-[#3a7bd5]/60 bg-[#14171f] p-5 shadow-[0_0_40px_rgba(0,0,0,0.6)]">
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-[#252a3a] pb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#72a7f0]">First-time guide · {user.role}</p>
            <h2 id="walkthrough-title" className="mt-1 text-lg font-bold uppercase tracking-wide text-[#dde1ec]">Welcome, {user.name || user.badge}</h2>
          </div>
          <span className="shrink-0 rounded bg-[#252a3a] px-2 py-1 text-[10px] font-mono text-[#b7c4e5]">{stepIndex + 1} / {steps.length}</span>
        </div>

        <div className="mb-5 flex gap-1" aria-label={`Step ${stepIndex + 1} of ${steps.length}`}>
          {steps.map((_, index) => <span key={index} className={`h-1 flex-1 rounded ${index <= stepIndex ? 'bg-[#3a7bd5]' : 'bg-[#252a3a]'}`} />)}
        </div>

        <section className="rounded-lg border border-[#252a3a] bg-[#0c0e14] p-4" aria-live="polite">
          <h3 className="text-base font-bold text-white">{step.title}</h3>
          <p className="mt-3 text-sm leading-relaxed text-[#c8cedd]">{step.summary}</p>
          <div className="mt-4 border-l-2 border-[#3a7bd5] bg-[#3a7bd5]/10 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#72a7f0]">Next action</p>
            <p className="mt-1 text-xs leading-relaxed text-[#dde1ec]">{step.action}</p>
          </div>
          {step.boundary && (
            <div className="mt-3 border-l-2 border-[#e8a329] bg-[#e8a329]/10 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#f0bd59]">Security boundary</p>
              <p className="mt-1 text-xs leading-relaxed text-[#dde1ec]">{step.boundary}</p>
            </div>
          )}
        </section>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button onClick={close} className="min-h-11 px-2 text-xs font-bold uppercase tracking-wide text-[#aeb7d1] hover:text-white">Skip guide</button>
          <div className="flex gap-2">
            {stepIndex > 0 && <button onClick={() => setStepIndex((index) => index - 1)} className="min-h-11 rounded border border-[#3a415c] px-4 text-xs font-bold uppercase tracking-wide text-[#dde1ec] hover:bg-[#252a3a]">Back</button>}
            {isFinalStep ? (
              <button onClick={close} className="min-h-11 rounded bg-[#3a7bd5] px-4 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#4a8be5]">Enter CrimeGraph</button>
            ) : (
              <button onClick={() => setStepIndex((index) => index + 1)} className="min-h-11 rounded bg-[#3a7bd5] px-4 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#4a8be5]">Continue</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
