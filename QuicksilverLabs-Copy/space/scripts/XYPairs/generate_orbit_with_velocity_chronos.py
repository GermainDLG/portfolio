import numpy as np
from src.config import RANDOM_SEED, DATA_DIR, ECCENTRICITIES
from src.models import forecast_chronos2_base, forecast_chronos2_small
from src.metrics import trajectory_rmse, fast_rmse
import matplotlib.pyplot as plt

FORECAST_MODEL = forecast_chronos2_base # change this between the two
CONTEXT_LENGTH = 2048 #MAX 8192 for Chronos
FORECAST_LENGTH = 256 # 256 is one full orbit, keep it here for better visuals
WINDOW_END = CONTEXT_LENGTH + FORECAST_LENGTH
ECCENTRICITY = 0.7
REALIZATION = 0
TARGET_DIM = 4


def main():
    filename = f"orbit_e{ECCENTRICITY}_r{REALIZATION}.npz"
    path = DATA_DIR / filename
    data = np.load(path)
    x_table = data['x']
    y_table = data['y']
    vx_table = data['vx']
    vy_table = data['vy']
    t_table = data['t']
    given_x = x_table[:CONTEXT_LENGTH]
    given_y = y_table[:CONTEXT_LENGTH]
    given_vx = vx_table[:CONTEXT_LENGTH]
    given_vy = vy_table[:CONTEXT_LENGTH]

    tail_x = given_x[-FORECAST_LENGTH:]
    tail_y = given_y[-FORECAST_LENGTH:]
    tail_vx = given_vx[-FORECAST_LENGTH:]
    tail_vy = given_vy[-FORECAST_LENGTH:]

    context = np.stack([given_x, given_y, given_vx, given_vy])

    result = FORECAST_MODEL(context, FORECAST_LENGTH, quantile_levels=[0.1, 0.5, 0.9], target_dim=TARGET_DIM)

    predicted_x = result[1][:, 0]
    predicted_y = result[1][:, 1]
    predicted_vx = result[1][:, 2]
    predicted_vy = result[1][:, 3]

    real_x = x_table[CONTEXT_LENGTH:WINDOW_END]
    real_y = y_table[CONTEXT_LENGTH:WINDOW_END]
    real_vx = vx_table[CONTEXT_LENGTH:WINDOW_END]
    real_vy = vy_table[CONTEXT_LENGTH:WINDOW_END]
    real_t = t_table[CONTEXT_LENGTH:WINDOW_END]

    x_rmse = fast_rmse(real_x, predicted_x)
    y_rmse = fast_rmse(real_y, predicted_y)
    vx_rmse = fast_rmse(real_vx, predicted_vx)
    vy_rmse = fast_rmse(real_vy, predicted_vy)

    real_xy = np.stack([real_x, real_y], axis=1)   # (pred_len, 2), NOT (2, pred_len)
    real_v = np.stack([real_vx, real_vy], axis=1)

    xy_rmse = trajectory_rmse(real_xy, result[1][:, 0:2])
    v_rmse = trajectory_rmse(real_v, result[1][:, 2:4])

    print(f'xy_error: {xy_rmse}')
    print(f'v_error: {v_rmse}')

    implied_vx = np.gradient(result[1][:, 0], real_t)
    implied_vy = np.gradient(result[1][:, 1], real_t)

    vx_rmse = fast_rmse(implied_vx, predicted_vx)
    vy_rmse = fast_rmse(implied_vy, predicted_vy)
    print(f'vx_rmse: {vx_rmse}')
    print(f'vy_rmse: {vy_rmse}')

    fig, (ax_pos, ax_vel) = plt.subplots(1, 2, figsize=(14, 7))
    ax_pos.set_aspect('equal')
    ax_pos.plot(given_x, given_y, color='black')
    ax_pos.plot(predicted_x, predicted_y, linestyle=':', color='tab:orange')
    ax_pos.plot(0, 0, marker='+', color='black')

    ax_pos.scatter(tail_x, tail_y, s=8, color='black', zorder=3)
    ax_pos.scatter(predicted_x, predicted_y, s=8, color='tab:orange', zorder=3)

    ax_pos.set_xlabel('x')
    ax_pos.set_ylabel('y')
    ax_pos.set_title('predicted orbit with x/y coords')


    ax_vel.set_aspect('equal')
    ax_vel.plot(given_vx, given_vy, color='black')
    ax_vel.plot(predicted_vx, predicted_vy, linestyle=':', color='tab:orange')

    ax_vel.scatter(tail_vx, tail_vy, s=8, color='black', zorder=3)
    ax_vel.scatter(predicted_vx, predicted_vy, s=8, color='tab:orange', zorder=3)

    ax_vel.set_xlabel('vx')
    ax_vel.set_ylabel('vy')
    ax_vel.set_title('predicted velocity of orbit with vx/vy')
    plt.show()


if __name__ == "__main__":
    main()