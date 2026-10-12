import math
from pathlib import Path

ECCENTRICITIES = (0.1, 0.3, 0.5, 0.7)

MU = 1.0
A = 1.0
PERIOD = 2 * math.pi

N_ORBITS = 36
SAMPLES_PER_ORBIT = 256
N_REALIZATIONS = 5
PHASE_OFFSETS = [2 * math.pi * i / N_REALIZATIONS for i in range(N_REALIZATIONS)]
for i in range(len(PHASE_OFFSETS)):
    curr = PHASE_OFFSETS[i]
    new = (curr + math.pi) % (2 * math.pi) - math.pi
    PHASE_OFFSETS[i] = new

RANDOM_SEED = 34

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "orbits"

TIERS = {
    'easy': {
        'context': 384,
        'forecast': 128
    },
    'medium': {
        'context': 256,
        'forecast': 256
    },
    'hard': {
        'context': 128,
        'forecast': 128
    }
}