import data from "../../public/data/bodies.json"
import { useState, useRef, useEffect } from 'react';

const allNames = data.map(item => item.name)

function filter(query) {
    return allNames.filter(suggestion => suggestion.toLowerCase().startsWith(query.toLowerCase()));
}

export default function SearchBar({ onSelect }) {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const myRef = useRef(null);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const handleKeyPress = (event) => {
        if(event.key === 'Enter' && suggestions.length > 0) {
            const index = highlightedIndex === -1 ? 0 : highlightedIndex;
            setHighlightedIndex(index)
            setSearch(suggestions[index])
        } else if (event.key === 'ArrowUp' && highlightedIndex > 0) {
            setHighlightedIndex(highlightedIndex - 1);
        } else if (event.key === 'ArrowDown' && highlightedIndex + 1 < suggestions.length) {
            setHighlightedIndex(highlightedIndex + 1);
        }
    }

    function handleChange(e) {
        const inputVal = e.target.value;
        setQuery(inputVal);
        setHighlightedIndex(-1)
        if(inputVal === "")
            setSuggestions([]);
        else
            setSuggestions(filter(inputVal));
    }

    useEffect(() => {
        function clickOutside(e) {
            if (myRef.current && !myRef.current.contains(e.target))
                setSuggestions([]);
        }
    
        document.addEventListener('mousedown', clickOutside);
        return () => document.removeEventListener('mousedown', clickOutside);
    }, []);

    function setSearch(suggestion) {
        setQuery(suggestion);
        const selectedPlanet = data.find(item => item.name === suggestion)
        onSelect(selectedPlanet);
        setSuggestions([]);

    }

    return(
        <div    ref={myRef}
                className="search-wrapper">
            <input  className="search-input"
                    type='text' 
                    placeholder='Search'
                    value={query}
                    onChange={(e) => handleChange(e)}
                    onKeyDown={handleKeyPress}
                    />
            {suggestions.length > 0 && (
                <ul className="suggestions-list">
                    {suggestions.map((suggestion, index) => (
                        <li key={index}
                            className={index === highlightedIndex ? 'highlighted' : ''}
                            onClick={() => setSearch(suggestion)}>
                                {suggestion}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )

}