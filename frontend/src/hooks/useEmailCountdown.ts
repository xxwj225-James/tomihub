import { useState, useEffect, useCallback } from 'react';

export function useEmailCountdown(cooldownSeconds = 60) {
  const [countdown, setCountdown] = useState(0);
  const [isCooldown, setIsCooldown] = useState(false);

  const startCooldown = useCallback(() => {
    setCountdown(cooldownSeconds);
    setIsCooldown(true);
  }, [cooldownSeconds]);

  useEffect(() => {
    if (countdown <= 0) {
      setIsCooldown(false);
      return;
    }
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  return { countdown, isCooldown, startCooldown };
}
