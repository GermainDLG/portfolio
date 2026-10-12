import numpy as np


def fast_rmse(real, predicted):
    return np.sqrt(np.mean((real - predicted) ** 2))


def normalized_rmse(real, predicted, eccentricity):
    return (fast_rmse(real, predicted))/(2 * eccentricity)

def trajectory_rmse(real_xy, predicted_xy) -> float:
    step_distances = np.linalg.norm(real_xy - predicted_xy, axis=1)
    result = 0.0
    for item in step_distances:
        result += (item**2)
    result = result/(len(step_distances))
    return np.sqrt(result)