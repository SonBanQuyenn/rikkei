// App.tsx
import React from 'react';
import QuizTimer from './components/TimeCountDown';

const App: React.FC = () => {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Demo Custom Hook - useCountdown</h1>
      <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
        <QuizTimer />
      </div>
    </div>
  );
};

export default App;