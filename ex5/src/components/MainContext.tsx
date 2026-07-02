// src/components/MainContext.tsx
import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

const MainContext: React.FC = () => { 
    const { theme } = useTheme();

    return (
        <main style={{
            padding: '40px',
            minHeight: '400px',
            background: theme === 'light' ? '#fff' : '#222',
            color: theme === 'light' ? '#333' : '#eee'
        }}>
            <h2>Chào mừng đến với khóa học</h2>
            <p>Bạn đang sử dụng chế độ: <strong>{theme}</strong></p>
            <div style={{
                padding: '20px',
                background: theme === 'light' ? '#e0e0e0' : '#444',
                borderRadius: '8px'
            }}>
                Nội dung bài học sẽ hiển thị ở đây
            </div>
        </main>
    );
};

export default MainContext;