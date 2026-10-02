from datetime import datetime, timedelta, timezone

import pytest

from deye_monitor.app import create_app
from deye_monitor.energy import EnergyStore, positive_integral
from deye_monitor.history import HistoryStore
from test_monitor import config


def sample(power=1000, grid=1000, counter=None):
    result = {'load': {'total_power_w': power}, 'solar': {'total_power_w': power},
              'grid': {'power_w': grid}, 'flow': {'simulated': True},
              'field_freshness': {'load': {'total_power_w': True}, 'solar': {'total_power_w': True}, 'grid': {'power_w': True}}}
    if counter is not None:
        result['grid']['energy_bought_today_kwh'] = counter
        result['field_freshness']['grid']['energy_bought_today_kwh'] = True
    return result


def ledger(tmp_path, **kwargs):
    cfg = config(history_db_path=str(tmp_path / 'energy.sqlite3'), billing_day=31, **kwargs)
    HistoryStore(cfg.history_db_path)
    return EnergyStore(cfg)


def hour(store, start, snapshot=None):
    for seconds in range(0, 3601, 5):
        store.record(snapshot or sample(), start + timedelta(seconds=seconds))
    return start + timedelta(hours=1)


def test_integral_crosses_zero_without_netting_exports():
    assert positive_integral(-1000, 1000, 3600) == .25
    assert positive_integral(1000, -1000, 3600) == .25
    assert positive_integral(-1000, -1000, 3600) == 0


def test_one_kwh_independent_of_missing_sensors_and_restart_reset(tmp_path):
    store = ledger(tmp_path)
    start = datetime(2026, 10, 2, 3, tzinfo=timezone.utc)
    end = hour(store, start)
    summary = store.summary(end)
    assert summary['home_day']['kwh'] == pytest.approx(1)
    assert summary['solar_day']['kwh'] == pytest.approx(1)
    assert summary['home_day']['complete']
    assert summary['grid_billing']['kwh'] == pytest.approx(1)
    reset = store.reset_home(end)
    assert reset['home_counter']['kwh'] == 0
    assert reset['home_month']['kwh'] == pytest.approx(1)
    restored = EnergyStore(store.config)
    assert restored.summary(end)['home_counter']['reset_at'] == end.isoformat()
    later = hour(restored, end)
    assert restored.summary(later)['home_counter']['kwh'] == pytest.approx(1)
    assert restored.summary(later)['home_month']['kwh'] == pytest.approx(2)


def test_gaps_stale_and_offline_are_not_integrated(tmp_path):
    store = ledger(tmp_path)
    start = datetime(2026, 10, 2, 3, tzinfo=timezone.utc)
    store.record(sample(), start)
    store.record(sample(), start + timedelta(hours=1))
    assert store.summary(start + timedelta(hours=1))['home_day']['kwh'] is None
    stale = sample()
    stale['field_freshness']['load']['total_power_w'] = False
    store.record(stale, start + timedelta(hours=1, seconds=5))
    store.record(sample(), start + timedelta(hours=1, seconds=10))
    assert store.summary(start + timedelta(hours=1, seconds=10))['home_day']['kwh'] is None
    assert store.summary(start + timedelta(hours=1, seconds=10))['solar_day']['kwh'] == pytest.approx(10/3600)


def test_midnight_month_boundary_and_leap_billing_day(tmp_path):
    store = ledger(tmp_path)
    start = datetime(2026, 3, 1, 2, 30, tzinfo=timezone.utc)
    end = hour(store, start)
    summary = store.summary(end)
    assert summary['home_last_month']['kwh'] == pytest.approx(.5)
    assert summary['home_month']['kwh'] == pytest.approx(.5)
    assert summary['home_day']['kwh'] == pytest.approx(.5)
    assert summary['grid_billing']['start'].startswith('2026-02-28')
    assert summary['grid_billing']['end'].startswith('2026-03-31')
    assert store.summary(datetime(2028, 3, 1, 4, tzinfo=timezone.utc))['grid_billing']['start'].startswith('2028-02-29')


def test_rounded_device_counter_reconciles_without_losing_power(tmp_path):
    store = ledger(tmp_path)
    start = datetime(2026, 10, 2, 3, tzinfo=timezone.utc)
    for seconds in range(0, 121, 5):
        store.record(sample(counter=2 if seconds < 120 else 2 + 120/3600), start + timedelta(seconds=seconds))
    assert store.summary(start + timedelta(seconds=120))['grid_billing']['kwh'] == pytest.approx(120/3600)
    # Device reset must not decrease stored usage.
    store.record(sample(counter=0), start + timedelta(seconds=125))
    assert store.summary(start + timedelta(seconds=125))['grid_billing']['kwh'] >= 120/3600


def test_config_validation_public_api_and_reset(tmp_path):
    for kwargs in ({'battery_soc_min_pct': 95}, {'battery_usable_kwh': -1}, {'billing_day': 32}, {'solar_capacity_w': float('nan')}, {'home_day_scale_next_kwh': 5}):
        with pytest.raises(ValueError):
            config(**kwargs)
    cfg = config(history_db_path=str(tmp_path / 'api.sqlite3'), solar_capacity_w=8000, mqtt_password='secret')
    app = create_app(cfg, start_source=False)
    client = app.test_client()
    public = client.get('/api/dashboard-config').json
    assert public['gauge_max_w']['solar'] == 8000
    assert 'secret' not in str(public)
    assert client.get('/api/energy').json['grid_billing'] is None
    assert client.post('/api/energy/home/reset').status_code == 415
    assert client.post('/api/energy/home/reset', json={}).status_code == 200


def test_history_excludes_future_samples(tmp_path):
    history = HistoryStore(str(tmp_path / 'history.sqlite3'))
    now = datetime(2026, 10, 2, 12, tzinfo=timezone.utc)
    complete = sample()
    complete['battery'] = {'power_w': 100, 'soc_pct': 50}
    complete['field_freshness']['battery'] = {'power_w': True, 'soc_pct': True}
    history.record(complete, now + timedelta(seconds=5))
    assert history.query('24h', now) == []
