'use strict';

// Intentionally non-actuating stage of the P1–P5 contribution. A user-chosen
// label is not evidence of a manufacturer-native point or a movement permission.
// The native learning / command path is added only with its own verification tests.
const NAME_KEY = 'maintenance_point_names_v1';
const PRIMARY_KEY = 'maintenance_point_primary_v1';
const VALID_INDEX = index => Number.isInteger(index) && index >= 1 && index <= 5;

class MaintenancePointCatalog {
  constructor(device) { this.device = device; }

  async _readNames() {
    const stored = await this.device.getStoreValue(NAME_KEY).catch(() => ({}));
    const out = { '1': 'P1' };
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      for (let index = 1; index <= 5; index += 1) {
        const value = stored[String(index)];
        if (typeof value === 'string' && value.trim()) out[String(index)] = value.trim().slice(0, 40);
      }
    }
    return out;
  }

  _available() {
    // P1 is upstream's established native maintenance command. Never infer
    // P2–P5 availability from a Homey name or a stale position cached earlier.
    // Future live-native proof must be scoped to the current map.
    const map = Number(this.device._activeMapIndex ?? 0);
    const listed = this.device._cachedMapData?.nativeMaintenancePoints;
    const available = [1];
    if (Array.isArray(listed)) {
      for (const point of listed) {
        const i = Number(point?.index);
        if (i <= 1 || i > 5 || !VALID_INDEX(i) || Number(point.mapIndex ?? map) !== map) continue;
        if (Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))) available.push(i);
      }
    }
    return [...new Set(available)].sort((a,b) => a-b);
  }

  _busy() {
    const status = String(this.device.getCapabilityValue('mower_status') || '');
    return ['mowing', 'mapping', 'returning', 'remote_control', 'positioning'].includes(status);
  }

  async getConfig() {
    const names = await this._readNames();
    const pref = Number(await this.device.getStoreValue(PRIMARY_KEY).catch(() => 1));
    const available = this._available();
    const selected = VALID_INDEX(pref) && available.includes(pref) ? pref : 1;
    return {
      names, selected, available, busy: this._busy(),
      garageEnabled: this.device.getSetting('garage_mode_enabled') === true,
    };
  }

  async save({ index, name, primary } = {}) {
    index = Number(index);
    if (!VALID_INDEX(index)) throw new Error('Maintenance-point number must be 1–5');
    if (this._busy()) throw new Error('Wait until the mower is stationary to change point preferences');
    if (typeof name !== 'string') throw new Error('Point name must be text');
    const clean = name.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,40);
    if (index > 1 && primary === true && !clean) throw new Error('Name the point before selecting it');
    // Do not allow a label alone to make an unknown manufacturer point drivable.
    if (primary === true && !this._available().includes(index))
      throw new Error('Native maintenance-point position not verified');
    const names = await this._readNames();
    if (index === 1) names['1'] = clean || 'P1';
    else if (clean) names[String(index)] = clean;
    else delete names[String(index)];
    const oldPrimary = Number(await this.device.getStoreValue(PRIMARY_KEY).catch(() => 1));
    const newPrimary = primary === true ? index : oldPrimary === index ? 1 : oldPrimary;
    await this.device.setStoreValue(NAME_KEY, names);
    await this.device.setStoreValue(PRIMARY_KEY, this._available().includes(newPrimary) ? newPrimary : 1);
    return this.getConfig();
  }
}

module.exports = MaintenancePointCatalog;
