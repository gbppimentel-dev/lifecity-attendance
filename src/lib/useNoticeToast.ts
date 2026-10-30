import { useEffect, useRef } from 'react';
import { useToast } from './toasts';

export function useNoticeToast(message: string, tone: 'success' | 'error' | 'info' = 'success') {
  const { notify } = useToast();
  const previous = useRef('');
  useEffect(() => {
    if (!message) {
      previous.current = '';
      return;
    }
    if (message === previous.current) return;
    previous.current = message;
    notify({ title: message, tone });
  }, [message, tone, notify]);
}
