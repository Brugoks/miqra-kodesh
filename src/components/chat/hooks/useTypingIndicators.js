import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../../../lib/supabaseClient';

const TYPING_THROTTLE_MS = 2500;
const TYPING_EXPIRY_MS = 4000;

export default function useTypingIndicators({ activeChannelId, displayName, userId }) {
  const [typers, setTypers] = useState({});
  const channelRef = useRef(null);
  const lastTypingSentRef = useRef(0);

  useEffect(() => {
    lastTypingSentRef.current = 0;

    if (!hasSupabaseConfig || !activeChannelId || !userId || typeof supabase.channel !== 'function') {
      channelRef.current = null;
      return undefined;
    }

    const channel = supabase
      .channel(`chat-typing-${activeChannelId}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload?.userId || payload.userId === userId) return;
        setTypers((current) => ({
          ...current,
          [payload.userId]: {
            channelId: activeChannelId,
            name: payload.name || 'Someone',
            expiresAt: Date.now() + TYPING_EXPIRY_MS,
          },
        }));
      })
      .on('broadcast', { event: 'stop_typing' }, ({ payload }) => {
        if (!payload?.userId || payload.userId === userId) return;
        setTypers((current) => {
          const next = { ...current };
          delete next[payload.userId];
          return next;
        });
      })
      .subscribe();

    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [activeChannelId, userId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      setTypers((current) => {
        const next = Object.fromEntries(Object.entries(current).filter(([, typer]) => typer.expiresAt > now));
        return Object.keys(next).length === Object.keys(current).length ? current : next;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (!channelRef.current || now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return;
    lastTypingSentRef.current = now;
    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, name: displayName },
    });
  }, [displayName, userId]);

  const sendStopTyping = useCallback(() => {
    if (!channelRef.current) return;
    lastTypingSentRef.current = 0;
    channelRef.current.send({
      type: 'broadcast',
      event: 'stop_typing',
      payload: { userId },
    });
  }, [userId]);

  const typingNames = useMemo(
    () => Object.values(typers)
      .filter((typer) => typer.channelId === activeChannelId)
      .map((typer) => typer.name),
    [activeChannelId, typers]
  );

  return {
    sendStopTyping,
    sendTyping,
    typingNames,
  };
}
