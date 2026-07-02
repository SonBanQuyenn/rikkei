// components/QuizTimer.tsx
import React from 'react';
import { useCountdown } from '../hooks/useCountdown';

const QuizTimer: React.FC = () => {
    const { count, start, pause, reset } = useCountdown(300); 

    return (
        <div style={{ padding: '20px', border: '2px solid blue', borderRadius: '8px' }}>
            <h2>Bài kiểm tra</h2>
            <div style={{ fontSize: '48px', fontWeight: 'bold', color: 'blue' }}>
                {Math.floor(count / 60)}:{String(count % 60).padStart(2, '0')}
            </div>
            <div>
                <button onClick={start}>Bắt đầu làm bài</button>
                <button onClick={pause}>Tạm dừng</button>
                <button onClick={reset}>Làm lại</button>
            </div>
        </div>
    );
};

export default QuizTimer;