from hapsira.bodies import Body
from hapsira.twobody import Orbit
from hapsira.twobody.sampling import EpochsArray
from astropy import units as u
from dataclasses import dataclass
import numpy as np
from src.config import (
    N_ORBITS,
    SAMPLES_PER_ORBIT
)



@dataclass(frozen=True)
class OrbitSeries:
    t: np.ndarray
    x: np.ndarray
    y: np.ndarray
    vx: np.ndarray
    vy: np.ndarray
    r: np.ndarray
    eccentricity: float
    phase_offset: float

ATTRACTOR = Body(parent=None, k=1.0 * u.km**3 / u.s**2, name="UnitMass")

def generate_orbit(
    eccentricity: float,
    phase_offset: float,
    n_orbits: int = N_ORBITS,
    samples_per_orbit: int = SAMPLES_PER_ORBIT,
) -> OrbitSeries:
    
    n_samples = n_orbits * samples_per_orbit
    times = np.linspace(0, n_orbits * 2 * np.pi, n_samples, endpoint = False) * u.s
    orbit = Orbit.from_classical(
        attractor = ATTRACTOR,
        a = 1.0 * u.km,
        ecc = eccentricity * u.one,
        inc = 0 * u.rad,
        raan = 0 * u.rad,
        argp = 0 * u.rad,
        nu = phase_offset * u.rad
    )

    epochs = orbit.epoch + times
    ephem = orbit.to_ephem(strategy=EpochsArray(epochs=epochs))
    r_vec, v_vec = ephem.rv()
    vx = v_vec[:, 0].to_value(u.km/u.s)
    vy = v_vec[:, 1].to_value(u.km/u.s)
    vz = v_vec[:, 2].to_value(u.km/u.s) # doesnt use z as of now, but keeping this for later in case I switch
    positions = ephem.sample()

    x = positions.x.to_value(u.km)
    y = positions.y.to_value(u.km)
    z = positions.z.to_value(u.km)
    assert(np.abs(z).max() < 1e-10)
    assert(np.abs(vz).max() < 1e-10)
    t = times.to_value(u.s)
    r = np.sqrt(x**2 + y**2)
    result = OrbitSeries(
        t = t,
        x = x,
        y = y,
        vx = vx,
        vy = vy,
        r = r,
        eccentricity = eccentricity,
        phase_offset = phase_offset
    )

    return result