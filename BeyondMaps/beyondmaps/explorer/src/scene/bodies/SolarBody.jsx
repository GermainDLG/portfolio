export default function SolarBody({name, position, size, color, onClick}) {
    const handleClick = (e) => {
        e.stopPropagation()
        onClick(e)
    }

    return (
        <mesh onClick= {handleClick} name={name} position={position}>
            <sphereGeometry args={size} />
            <meshStandardMaterial color={color} />
        </mesh>
    )
}