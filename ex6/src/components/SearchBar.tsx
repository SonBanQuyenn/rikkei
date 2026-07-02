// components/SearchBar.tsx
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const SearchBar: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [keyword, setKeyword] = useState('');

    // Lấy từ khóa từ URL khi load trang
    useEffect(() => {
        const searchQuery = searchParams.get('search') || '';
        setKeyword(searchQuery);
    }, [searchParams]);

    // Xử lý khi người dùng nhập
    const handleSearch = (value: string) => {
        setKeyword(value);

        if (value.trim() === '') {
            searchParams.delete('search');
            setSearchParams(searchParams);
        } else {
            setSearchParams({ search: value });
        }
    };

    return (
        <input
            type="text"
            placeholder="Tìm kiếm ..."
            value={keyword}
            onChange={(e) => handleSearch(e.target.value)}
        />
    );
};

export default SearchBar;