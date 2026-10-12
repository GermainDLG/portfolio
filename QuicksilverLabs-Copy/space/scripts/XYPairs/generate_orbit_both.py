import numpy as np
from src.config import RANDOM_SEED, DATA_DIR, ECCENTRICITIES
from src.models import forecast_chronos2_base, forecast_chronos2_small, forecast_moirai2
from src.metrics import trajectory_rmse
import matplotlib.pyplot as plt

FORECAST_MODEL = forecast_chronos2_small # change this between the three
CONTEXT_LENGTH = 2048 #MAX 8192 for Chronos, 512 for moirai
FORECAST_LENGTH = 256 # 256 is one full orbit, keep it here for better visuals, max 64 for moirai
WINDOW_END = CONTEXT_LENGTH + FORECAST_LENGTH
ECCENTRICITY = 0.3
REALIZATION = 0
TARGET_DIM = 2


def main():
    filename = f"orbit_e{ECCENTRICITY}_r{REALIZATION}.npz"
    path = DATA_DIR / filename
    data = np.load(path)
    x_table = data['x']
    y_table = data['y']
    given_x = x_table[:CONTEXT_LENGTH]
    given_y = y_table[:CONTEXT_LENGTH]
    context = np.stack([given_x, given_y])
    result = FORECAST_MODEL(context, FORECAST_LENGTH, quantile_levels=[0.1, 0.5, 0.9], target_dim=TARGET_DIM)
    predicted_x = result[1][:, 0]
    predicted_y = result[1][:, 1]
    real_x = x_table[CONTEXT_LENGTH:WINDOW_END]
    real_y = y_table[CONTEXT_LENGTH:WINDOW_END]
    real_xy = np.stack([real_x, real_y], axis=1)
    rmse = trajectory_rmse(real_xy, result[1])
    print(f'error: {rmse}')
    print(f'shape: {result.shape}')

    fig, ax = plt.subplots(figsize=(7, 7))
    ax.set_aspect("equal")
    ax.plot(given_x, given_y, color='black')
    ax.plot(predicted_x, predicted_y, linestyle=':', color='tab:orange')
    ax.plot(0, 0, marker='+', color='black')
    ax.set_xlabel('x')
    ax.set_ylabel('y')
    ax.set_title('predicted orbit with x/y coords')
    plt.show()


if __name__ == "__main__":
    main()