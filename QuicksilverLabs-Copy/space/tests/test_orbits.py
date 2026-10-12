"""Sanity tests for src.orbits.generate_orbit."""
import pytest

from src.orbits import generate_orbit
from src.config import N_ORBITS, SAMPLES_PER_ORBIT


EXPECTED_LENGTH = N_ORBITS * SAMPLES_PER_ORBIT  # 5 * 256 = 1280
ECC = 0.3
A = 1.0  # normalized semi-major axis


@pytest.fixture
def series():
    """An e=0.3 orbit starting at periapsis (phase_offset=0)."""
    return generate_orbit(eccentricity=ECC, phase_offset=0.0)


def test_array_lengths(series):
    print(f"len(t)={len(series.t)}, len(x)={len(series.x)}, "
          f"len(y)={len(series.y)}, len(r)={len(series.r)}")
    assert len(series.t) == EXPECTED_LENGTH
    assert len(series.x) == EXPECTED_LENGTH
    assert len(series.y) == EXPECTED_LENGTH
    assert len(series.r) == EXPECTED_LENGTH


def test_periapsis_distance(series):
    """Closest point on the orbit is a*(1 - e) = 0.7."""
    expected = A * (1 - ECC)
    print(f"r.min() = {series.r.min()}, expected ≈ {expected}")
    assert series.r.min() == pytest.approx(expected, abs=1e-10)


def test_apoapsis_distance(series):
    """Farthest point on the orbit is a*(1 + e) = 1.3."""
    expected = A * (1 + ECC)
    print(f"r.max() = {series.r.max()}, expected ≈ {expected}")
    assert series.r.max() == pytest.approx(expected, abs=1e-10)


def test_mean_radius_above_one(series):
    """Time-averaged radius is a*(1 + e²/2); the body lingers near apoapsis."""
    expected = A * (1 + ECC**2 / 2)  # 1.045 for e=0.3
    print(f"r.mean() = {series.r.mean()}, analytical ≈ {expected}")
    assert series.r.mean() > A
    assert series.r.mean() == pytest.approx(expected, abs=1e-3)


def test_starts_at_periapsis_on_plus_x(series):
    """With argp=0 and nu=0, the orbit begins at (a*(1-e), 0)."""
    print(f"(x[0], y[0]) = ({series.x[0]}, {series.y[0]}), "
          f"expected ~= ({A * (1 - ECC)}, 0.0)")
    assert series.x[0] == pytest.approx(A * (1 - ECC), abs=1e-10)
    assert series.y[0] == pytest.approx(0.0, abs=1e-10)