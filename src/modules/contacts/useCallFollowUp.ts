import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/Toast';
import { followUpPath, takeCallFollowUp } from './callFollowUp';

/**
 * Coming back to the app after a call from a contact: one notice that offers to write
 * down what was said, with contact, channel and time already filled in.
 */
export function useCallFollowUp(): void {
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    function check() {
      if (document.visibilityState !== 'visible') return;
      const call = takeCallFollowUp(Date.now());
      if (!call) return;
      toast(`Gespräch mit ${call.name || 'dem Kontakt'} notieren?`, {
        actionLabel: 'Notieren',
        onAction: () => navigate(followUpPath(call)),
        timeoutMs: 15_000,
      });
    }
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [toast, navigate]);
}
