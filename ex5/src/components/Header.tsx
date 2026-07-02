import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

const Header: React.FC = () => {
    const { theme, toggleTheme } = useTheme();

    return (
        <header style={{
            padding: '20px',
            background: theme === 'light' ? '#f0f0f0' : '#333',
            color: theme === 'light' ? '#333' : '#fff',
            display: 'flex',
            justifyContent: 'space-between'
        }}>
            <h1>Học Online</h1>
            <button onClick={toggleTheme}>
                {theme === 'light' ? 'Dark' : 'Light'}
            </button>
        </header>
    );
};

export default Header;