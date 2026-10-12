import './App.css'
import SolarSystem from './scene/SolarSystem'
import usePlanetStore from "./store/usePlanetStore"
import InfoPanel from './components/InfoPanel'
import SearchBar from './components/SearchBar'
import { Canvas, useFrame} from '@react-three/fiber'
import { useRef, useMemo, useEffect } from 'react';
import { Vector3 } from 'three';
import { CameraControls } from '@react-three/drei'

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

function CameraController() {
  const selectedPlanet = usePlanetStore((s) => s.selectedPlanet)
  const setSelectedPlanet = usePlanetStore((s) => s.setSelectedPlanet)
  const setResetFn = usePlanetStore((s) => s.setResetFn)

  const { targetVector, cameraVector} = useMemo(() => {
    if (!selectedPlanet) return { targetVector: new Vector3(0,0,0), cameraVector: new Vector3(0, 100, 300)}
    
    const locX = selectedPlanet.X/1000000
    const locZ = selectedPlanet.Y/1000000
    const locY = selectedPlanet.Z/1000000
    const targetVector = new Vector3(locX, locY, locZ)
    const planetName = selectedPlanet.name
    const planetSize = nameSizeMap[planetName] ?? 0.5
    const cameraVector = (targetVector.clone()).add(new Vector3(0, planetSize * 3, planetSize * 8))

    return { targetVector, cameraVector}
  }, [selectedPlanet])
  
  const controlsRef = useRef();

  useEffect(() => {
    if (!selectedPlanet || !controlsRef.current) return
    controlsRef.current.setLookAt(
      cameraVector.x, cameraVector.y, cameraVector.z,   // where camera goes
      targetVector.x, targetVector.y, targetVector.z,  // what it looks at
      true  // smooth transition
    )
  }, [selectedPlanet])

  useEffect(() => {
    setResetFn(() => () => {
      controlsRef.current?.setLookAt(0, 100, 300, 0, 0, 0, true)
      setSelectedPlanet(null)
    })
  }, [])

  return (
  <CameraControls  ref={controlsRef} 
                  minDistance={20} 
                  maxDistance={80000} />
  )
}

export default function App() {
  const resetFn = usePlanetStore((s) => s.resetFn)
  const setSelectedPlanet = usePlanetStore((s) => s.setSelectedPlanet)

  return (
    <>
      <button className="recenter-btn"
              onClick={() => resetFn?.()()}>
        Reset View
      </button>
      <SearchBar onSelect={(planet) => setSelectedPlanet(planet)}/>
      <div style={{ height: '100vh', position: 'relative' }}>
        <InfoPanel />
        <Canvas camera={{ position: [0, 100, 300], near: 0.1, far: 100000 }}>
          <CameraController/>
          <ambientLight intensity={0.5} />
          <pointLight position={[0, 0, 0]} intensity={1000} />
          <SolarSystem />
        </Canvas>
      </div>
    </>
  )
}