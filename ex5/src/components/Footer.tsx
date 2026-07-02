import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

const Footer: React.FC = () => {
    const { theme } = useTheme();

    return (
        <footer style={{
            padding: '20px',
            background: theme === 'light' ? '#e8e8e8' : '#1a1a1a',
            color: theme === 'light' ? '#666' : '#999',
            textAlign: 'center'
        }}>
            <p>© SonBanQuyenn</p>
        </footer>
    );
};

export default Footer;