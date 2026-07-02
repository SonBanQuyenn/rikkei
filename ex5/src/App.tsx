import React from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import Header from './components/Header';
import MainContext from './components/MainContext';
import Footer from './components/Footer';

const App: React.FC = () => {
    return (
        <ThemeProvider>
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                <Header />
                <MainContext />
                <Footer />
            </div>
        </ThemeProvider>
    );
};

export default App;