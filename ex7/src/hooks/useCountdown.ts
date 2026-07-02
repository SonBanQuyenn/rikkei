import { useState, useEffect, useRef } from 'react';

interface UseCountdownReturn {
    count: number;
    start:() => void;
    pause:() => void;
    reset:() => void;
}

export const useCountdown = (initialCount: number): UseCountdownReturn => {
    const [count, setCount] = useState(initialCount);
    const timerRef = useRef<number | null>(null);

    const start = () => {
        if (timerRef.current) clearInterval(timerRef.current);

        timerRef.current = setInterval(() => {
            setCount((prevCount) => {
                if (prevCount <= 1) {
                    clearInterval(timerRef.current!);
                    return 0;
                }
                return prevCount - 1;
            });
        }, 1000);
    }

    const pause = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }

    const reset = () => {
        pause();
        setCount(initialCount);
    }

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        }
    }, []);

    return { count, start, pause, reset };
}