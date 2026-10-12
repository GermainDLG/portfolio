import numpy as np
import torch
from chronos import Chronos2Pipeline
import pandas as pd
from uni2ts.model.moirai2 import Moirai2Forecast, Moirai2Module

CHRONOS2_BASE = "amazon/chronos-2"
CHRONOS2_SMALL = "autogluon/chronos-2-small"
CHRONOS2_PIPELINES: dict[str, Chronos2Pipeline] = dict()

MOIRAI2_NAME = "Salesforce/moirai-2.0-R-small"
MOIRAI2_MODULE = None

def _get_moirai2_module() -> Moirai2Module:
    global MOIRAI2_MODULE
    if MOIRAI2_MODULE is None:
        MOIRAI2_MODULE = Moirai2Module.from_pretrained(MOIRAI2_NAME)
    return MOIRAI2_MODULE

def _get_chronos2_pipeline(model_name: str) -> Chronos2Pipeline:
    assert model_name in [CHRONOS2_BASE, CHRONOS2_SMALL]

    if model_name not in CHRONOS2_PIPELINES:
        CHRONOS2_PIPELINES[model_name] = Chronos2Pipeline.from_pretrained(
            model_name, 
            device_map="cpu",
            dtype = torch.float32)
    return CHRONOS2_PIPELINES[model_name]

def _forecast_chronos2( context: np.ndarray, 
                        prediction_length: int,
                        model_name: str, 
                        quantile_levels: list[float],
                        target_dim
                        ) -> np.ndarray:
    pipeline = _get_chronos2_pipeline(model_name)
    quantiles, _ = pipeline.predict_quantiles([context], prediction_length, quantile_levels=quantile_levels)
    if target_dim == 1:
        formatted = quantiles[0].squeeze(0).numpy().swapaxes(0, 1)
        return formatted
    else:
        formatted = quantiles[0].numpy().T
        return formatted

def forecast_chronos2_base(context: np.ndarray, 
                           prediction_length: int, 
                           quantile_levels: list[float] = [0.1, 0.5, 0.9],
                           target_dim=1
                           ) -> np.ndarray:
    return _forecast_chronos2(context, prediction_length, CHRONOS2_BASE, quantile_levels, target_dim)



def forecast_chronos2_small(context: np.ndarray, 
                           prediction_length: int, 
                           quantile_levels: list[float] = [0.1, 0.5, 0.9],
                           target_dim=1
                           ) -> np.ndarray:
    return _forecast_chronos2(context, prediction_length, CHRONOS2_SMALL, quantile_levels, target_dim)


def forecast_moirai2(context: np.ndarray, 
                     prediction_length: int, 
                     quantile_levels: list[float] = [0.1, 0.5, 0.9],
                     target_dim=1
                     ) -> np.ndarray:
    assert(context.shape[-1] <= 512)
    module = _get_moirai2_module()
    model = Moirai2Forecast(
        module=module,
        prediction_length=prediction_length,
        context_length=context.shape[-1],
        target_dim=target_dim,          # NOTE: For the 3 dimension lines, this
        feat_dynamic_real_dim=0,        # will change depending on univariate
        past_feat_dynamic_real_dim=0,   # vs. multivariate data (add param eventually)
    )

    predictor = model.create_predictor(batch_size=1, device="cpu")

    entry = {
        "start": pd.Period("2020-01-01", freq="h"),
        "target": np.asarray(context, dtype=np.float32),
    }
    forecast = next(iter(predictor.predict([entry])))
    result = []
    for quantile in quantile_levels:
        result.append(forecast.quantile(quantile))

    return np.array(result)