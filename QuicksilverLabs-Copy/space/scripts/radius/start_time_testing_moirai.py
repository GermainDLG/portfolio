import numpy as np
from src.config import RANDOM_SEED, DATA_DIR, ECCENTRICITIES
from src.models import forecast_moirai2
from scipy.stats import spearmanr
from src.metrics import normalized_rmse
import matplotlib.pyplot as plt

CONTEXT_LENGTH = 512 #MAX 512
FORECAST_LENGTH = 64
N_STARTS = 100

def main():
    rng = np.random.default_rng(seed=RANDOM_SEED)

    random_starts = rng.choice(CONTEXT_LENGTH, size=N_STARTS, replace=False)
    rmse_by_ecc = dict()

    stats = []

    for e in ECCENTRICITIES:
        filename = f"orbit_e{e}_r0.npz"
        path = DATA_DIR / filename
        data = np.load(path)
        r_table = data['r']
        rmse_by_ecc[e] = []

        for start in random_starts:
            inbetween = start + CONTEXT_LENGTH
            context = r_table[start: inbetween]
            actual = r_table[inbetween: inbetween + FORECAST_LENGTH]

            forecast = forecast_moirai2(context, FORECAST_LENGTH, quantile_levels=[0.5])
            normalized = normalized_rmse(actual, forecast[0], e)

            rmse_by_ecc[e].append(normalized)
        
        new_stat, new_p = spearmanr(random_starts, rmse_by_ecc[e])
        stats.append(new_stat)    
    
    fig, ax = plt.subplots(figsize=(8, 6))
    colors = ['tab:blue', 'tab:orange', 'tab:green', 'tab:red']

    for i, e in enumerate(ECCENTRICITIES):
        rho = stats[i]
        mean_nrmse = np.mean(rmse_by_ecc[e])
        ax.scatter(
            random_starts,
            rmse_by_ecc[e],
            color=colors[i],
            alpha=0.7,
            label=f"e={e}  (ρ={rho:.2f}, mean={mean_nrmse:.2f})"
        )

    ax.set_xlabel('start index (phase within first orbit)')
    ax.set_ylabel('normalized RMSE  (RMSE / 2e)')
    ax.set_title('Forecast error vs. start phase, by eccentricity')
    ax.legend()
    plt.show()



if __name__ == "__main__":
    main()