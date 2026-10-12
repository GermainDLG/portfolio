import numpy as np
from src.models import forecast_chronos2_base, forecast_chronos2_small
from src.orbits import generate_orbit
import matplotlib.pyplot as plt
from src.metrics import normalized_rmse
from src.config import SAMPLES_PER_ORBIT

FORECAST_MODEL = forecast_chronos2_base
CONTEXT_LENGTH = 8192 # MAX 8192
FORECAST_LENGTH = 512 # MAX 1024 for stability
START_STEP = 4      # determines column count

def main():
    eccentricities = []
    for i in range(1, 20):
        tmp = round(i * 0.05, 2)
        eccentricities.append(tmp)
    
    start_indices = np.arange(0, SAMPLES_PER_ORBIT, START_STEP)
    matrix = np.zeros((len(eccentricities), len(start_indices)))
    for i, e in enumerate(eccentricities): #each eccentricity is a row
        r_table = generate_orbit(e, 0.0).r
        for j, start_index in enumerate(start_indices):
            inbetween = start_index + CONTEXT_LENGTH
            context = r_table[start_index : inbetween]
            actual = r_table[inbetween: inbetween + FORECAST_LENGTH]

            forecast = FORECAST_MODEL(context, FORECAST_LENGTH, quantile_levels=[0.5])
            matrix[i, j] = normalized_rmse(actual, forecast[0], e)
    
    fig, ax = plt.subplots(figsize=(10, 6))
    im = ax.matshow(matrix, aspect='auto', origin='lower', cmap='viridis',)
                    # vmax=np.percentile(matrix, 90))

    fig.colorbar(im, ax=ax, label='normalized RMSE  (RMSE / 2e)')

    # x-axis = start index: label every 4th column with its real start value
    xticks = np.arange(0, len(start_indices), 4)
    ax.set_xticks(xticks)
    ax.set_xticklabels([start_indices[k] for k in xticks])

    # y-axis = eccentricity: label every other row with its real value
    yticks = np.arange(0, len(eccentricities), 2)
    ax.set_yticks(yticks)
    ax.set_yticklabels([eccentricities[k] for k in yticks])

    # matshow puts the x-ticks on top by default; move them to the bottom
    ax.xaxis.set_ticks_position('bottom')
    ax.xaxis.set_label_position('bottom')

    ax.set_xlabel('start index (phase within first orbit)')
    ax.set_ylabel('eccentricity')
    ax.set_title('Normalized forecast RMSE vs. start phase and eccentricity')
    plt.show()




if __name__ == "__main__":
    main()