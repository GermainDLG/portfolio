import numpy as np
from pathlib import Path
from src.orbits import generate_orbit
from src.config import (
    ECCENTRICITIES,
    PHASE_OFFSETS,
    DATA_DIR
)

def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    for eccentricity in ECCENTRICITIES:
        for r_index, phase_offset in enumerate(PHASE_OFFSETS):
            item = generate_orbit(eccentricity, phase_offset)
            filename = f"orbit_e{eccentricity}_r{r_index}.npz"
            path = DATA_DIR / filename
            np.savez(path, 
                     t=item.t, 
                     x=item.x, 
                     y=item.y,
                     vx = item.vx,
                     vy = item.vy, 
                     r=item.r, 
                     eccentricity=item.eccentricity,
                     phase_offset=item.phase_offset)
            print(f'file saved: {filename}')

    return

if __name__ == '__main__':
    main()