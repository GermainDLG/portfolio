import SolarBody from './bodies/SolarBody'
import { useState, useEffect } from "react";
import usePlanetStore from "../store/usePlanetStore"

const nameColorMap = {
    Sun: '#ffe600',
    Mercury: '#8a8a8a',
    Venus: '#fcffba',
    Earth: '#0084ff',
    Mars: '#8f000c',
    Jupiter: '#7d4e24',
    Saturn: '#ffc72e',
    Uranus: '#b5ffff',
    Neptune: '#000473',
    Pluto: '#5c5c5c',
}

const nameSizeMap = {
    Sun: 15,
    Mercury: 1,
    Venus: 1.8,
    Earth: 2,
    Mars: 1.5,
    Jupiter: 7,
    Saturn: 6,
    Uranus: 4,
    Neptune: 4,
    Pluto: 0.8,
}


export default function SolarSystem() {
    const [planets, setPlanets] = useState([]);

    const setSelectedPlanet = usePlanetStore((s) => s.setSelectedPlanet)
    const setIsFlyingTo = usePlanetStore((s) => s.setIsFlyingTo)
    


    useEffect(() => {
        fetch('/data/bodies.json')
        .then(response => response.json())
        .then(data => setPlanets(data));
    }, []);

    return (
    <>
        {planets.map((planet, id) => {
            const name = planet.name;
            const X = planet.X / 1000000;
            const Y = planet.Z / 1000000;
            const Z = planet.Y / 1000000;
            const color = nameColorMap[name] ?? '#ffffff';
            const size = nameSizeMap[name] ?? 0.5;

            return (
                <SolarBody onClick={() => setSelectedPlanet(planet)} 
                            key={id} 
                            name={name} 
                            position={[X,Y,Z]} 
                            size={[size, 32, 16]} 
                            color={color} />
            )
        })}
    </>
    )
}