// App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import CourseList from './pages/CourseList';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CourseList />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;