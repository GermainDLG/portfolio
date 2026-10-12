import numpy as np
from src.config import DATA_DIR
from src.models import forecast_moirai2
import matplotlib.pyplot as plt
from src.metrics import fast_rmse

CONTEXT_LENGTH = 512 # MAX 512
FORECAST_LENGTH = 64
WINDOW_END = CONTEXT_LENGTH + FORECAST_LENGTH
REALIZATION = 0
NATIVE_HORIZON = 64

def main():
    result_1 = single_wave_helper(f"orbit_e0.1_r{REALIZATION}.npz")
    result_3 = single_wave_helper(f"orbit_e0.3_r{REALIZATION}.npz")
    result_5 = single_wave_helper(f"orbit_e0.5_r{REALIZATION}.npz")
    result_7 = single_wave_helper(f"orbit_e0.7_r{REALIZATION}.npz")


    fig, ((ax_1, ax_3), (ax_5, ax_7)) = plt.subplots(2, 2, figsize=(8, 8))

    ax_1.fill_between(result_1['x_future'], result_1['result'][0], result_1['result'][2],color='tab:orange', alpha=0.25)
    ax_1.plot(result_1['x_context'], result_1['given'], linestyle='-', color='black')
    ax_1.plot(result_1['x_future'], result_1['r_table'][CONTEXT_LENGTH:WINDOW_END], linestyle='-', color='tab:blue')
    ax_1.plot(result_1['x_future'], result_1['result'][1], linestyle='--', color='tab:orange')
    ax_1.axvline(result_1['t_table'][CONTEXT_LENGTH], color='gray', linestyle='--', linewidth=1, alpha=0.5)
    if NATIVE_HORIZON < FORECAST_LENGTH:
        ax_1.axvline(result_1['t_table'][CONTEXT_LENGTH + NATIVE_HORIZON], color='gray', linestyle='--', linewidth=1, alpha=0.5)
    ax_1.set_xlabel('time (normalized units)')
    ax_1.set_ylabel('value')
    ax_1.set_title(f'e = 0.1 ({result_1['rmse']})')


    ax_3.fill_between(result_3['x_future'], result_3['result'][0], result_3['result'][2],color='tab:orange', alpha=0.25)
    ax_3.plot(result_3['x_context'], result_3['given'], linestyle='-', color='black')
    ax_3.plot(result_3['x_future'], result_3['r_table'][CONTEXT_LENGTH:WINDOW_END], linestyle='-', color='tab:blue')
    ax_3.plot(result_3['x_future'], result_3['result'][1], linestyle='--', color='tab:orange')
    ax_3.axvline(result_3['t_table'][CONTEXT_LENGTH], color='gray', linestyle='--', linewidth=1, alpha=0.5)
    if NATIVE_HORIZON < FORECAST_LENGTH:
        ax_3.axvline(result_3['t_table'][CONTEXT_LENGTH + NATIVE_HORIZON], color='gray', linestyle='--', linewidth=1, alpha=0.5)
    ax_3.set_xlabel('time (normalized units)')
    ax_3.set_ylabel('value')
    ax_3.set_title(f'e = 0.3 ({result_3['rmse']})')


    ax_5.fill_between(result_5['x_future'], result_5['result'][0], result_5['result'][2],color='tab:orange', alpha=0.25)
    ax_5.plot(result_5['x_context'], result_5['given'], linestyle='-', color='black')
    ax_5.plot(result_5['x_future'], result_5['r_table'][CONTEXT_LENGTH:WINDOW_END], linestyle='-', color='tab:blue')
    ax_5.plot(result_5['x_future'], result_5['result'][1], linestyle='--', color='tab:orange')
    ax_5.axvline(result_5['t_table'][CONTEXT_LENGTH], color='gray', linestyle='--', linewidth=1, alpha=0.5)
    if NATIVE_HORIZON < FORECAST_LENGTH:
        ax_5.axvline(result_5['t_table'][CONTEXT_LENGTH + NATIVE_HORIZON], color='gray', linestyle='--', linewidth=1, alpha=0.5)
    ax_5.set_xlabel('time (normalized units)')
    ax_5.set_ylabel('value')
    ax_5.set_title(f'e = 0.5 ({result_5['rmse']})')


    ax_7.fill_between(result_7['x_future'], result_7['result'][0], result_7['result'][2],color='tab:orange', alpha=0.25)
    ax_7.plot(result_7['x_context'], result_7['given'], linestyle='-', color='black')
    ax_7.plot(result_7['x_future'], result_7['r_table'][CONTEXT_LENGTH:WINDOW_END], linestyle='-', color='tab:blue')
    ax_7.plot(result_7['x_future'], result_7['result'][1], linestyle='--', color='tab:orange')
    ax_7.axvline(result_7['t_table'][CONTEXT_LENGTH], color='gray', linestyle='--', linewidth=1, alpha=0.5)
    if NATIVE_HORIZON < FORECAST_LENGTH:
        ax_7.axvline(result_7['t_table'][CONTEXT_LENGTH + NATIVE_HORIZON], color='gray', linestyle='--', linewidth=1, alpha=0.5)
    ax_7.set_xlabel('time (normalized units)')
    ax_7.set_ylabel('value')
    ax_7.set_title(f'e = 0.7 ({result_7['rmse']})')
    plt.show()



def single_wave_helper(filename):
    path = DATA_DIR / filename
    data = np.load(path)
    r_table = data['r']
    t_table = data['t']
    given = r_table[:CONTEXT_LENGTH]
    result = forecast_moirai2(given, FORECAST_LENGTH, quantile_levels=[0.1, 0.5, 0.9])
    x_context = t_table[:CONTEXT_LENGTH]
    x_future = t_table[CONTEXT_LENGTH:WINDOW_END]
    error = fast_rmse(r_table[CONTEXT_LENGTH:WINDOW_END], result[1])
    print(f'{filename} error: {error}')
    final_result = {
        'r_table': r_table,
        't_table': t_table,
        'given': given,
        'result': result,
        'x_context': x_context,
        'x_future': x_future,
        'rmse': error
    }
    return final_result

if __name__ == "__main__":
    main()