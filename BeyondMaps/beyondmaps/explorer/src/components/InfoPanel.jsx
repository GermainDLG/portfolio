import usePlanetStore from '../store/usePlanetStore'

export default function InfoPanel() {
    const selectedPlanet = usePlanetStore((s) => s.selectedPlanet)
    const setSelectedPlanet = usePlanetStore((s) => s.setSelectedPlanet)

    if (!selectedPlanet) return null

    return (
        <div className="info-panel">
            <h2>{selectedPlanet.name}</h2>
            <p>{selectedPlanet.position}</p>
            <button onClick={() => setSelectedPlanet(null)}>
                Close
            </button>
        </div>
    )
}