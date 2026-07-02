// pages/CourseList.tsx
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import SearchBar from '../components/SearchBar';

const courses = [
    'React Hooks',
    'TypeScript Basic',
    'React Router',
    'Context API',
    'Custom Hooks'
];

const CourseList: React.FC = () => {
    const [searchParams] = useSearchParams();
    const [filteredCourses, setFilteredCourses] = useState(courses);

    useEffect(() => {
        const keyword = searchParams.get('search') || '';
        if (keyword) {
            const filtered = courses.filter(course =>
                course.toLowerCase().includes(keyword.toLowerCase())
            );
            setFilteredCourses(filtered);
        } else {
            setFilteredCourses(courses);
        }
    }, [searchParams]);

    return (
        <div style={{ padding: '20px' }}>
            <h1>Danh sách khóa học</h1>
            <SearchBar />
            <ul>
                {filteredCourses.map((course, index) => (
                    <li key={index} style={{ padding: '10px', margin: '5px 0', background: '#f0f0f0' }}>
                        {course}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default CourseList;