import { create } from 'zustand'

const usePlanetStore = create((set) => ({
  selectedPlanet: null,
  setSelectedPlanet: (planet) => set({ selectedPlanet: planet }),
  resetFn: null,
  setResetFn: (fn) => set({ resetFn: fn }),
  planets: [],
  setPlanets: (planets) => set({ planets }),
}))

export default usePlanetStore