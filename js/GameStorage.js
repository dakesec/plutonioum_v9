import {UtilGameSettings} from "./UtilGameSettings.js";
import {UtilLibWrapper} from "./PatcherLibWrapper.js";
import {SharedConsts} from "../shared/SharedConsts.js";

class GameStorage {
	static _gameStorageValueOverrides = {};

	static _STORE_KEY_CLIENT = "plutonium_client";
	static _STORE_KEY_WORLD = "plutonium_world";

	static _STORAGE_KEY_RELOADER = "reloader";

	static init () {
		UtilLibWrapper.addPatch(
			"game.settings.get",
			this._lw_game_settings_get,
			UtilLibWrapper.LIBWRAPPER_MODE_WRAPPER,
		);

		game.settings.register(
			SharedConsts.MODULE_NAME,
			this._STORAGE_KEY_RELOADER,
			{
				name: "-",
				scope: "world",
				config: false,
				default: 0,
				type: Number,
				onChange: () => setTimeout(() => window.location.reload(), 100),
			},
		);
	}

	static _lw_game_settings_get (fn, ...args) {
		const out = fn(...args);
		const [namespace, key] = args;

		const override = GameStorage._gameStorageValueOverrides?.[namespace]?.[key];
		if (override === undefined) return out;

		return override;
	}

	/** Force all connected clients to reload. */
	static async pDoReload () {
		if (!game.user.isGM) return window.location.reload();

		const curr = game.settings.get(SharedConsts.MODULE_NAME, this._STORAGE_KEY_RELOADER);
		await game.settings.set(SharedConsts.MODULE_NAME, this._STORAGE_KEY_RELOADER, curr + 1);
	}

	static setOverride (namespace, key, val) { MiscUtil.set(this._gameStorageValueOverrides, namespace, key, val); }
	static unsetOverride (namespace, key) { MiscUtil.deleteObjectPath(this._gameStorageValueOverrides, namespace, key); }

	static _registerClient (key) {
		return this._register(key, {type: "client"});
	}

	static _registerWorld (key) {
		return this._register(key, {type: "world"});
	}

	static _register (key, {type = "client"} = {}) {
		const keyPrefix = type === "world" ? GameStorage._STORE_KEY_WORLD : GameStorage._STORE_KEY_CLIENT;
		const keyProc = `${keyPrefix}_${key}`;
		game.settings.register(
			SharedConsts.MODULE_NAME,
			keyProc,
			{
				name: keyProc,
				hint: keyProc,
				scope: type,
				config: false,
				default: {},
				type: Object,
				onChange: () => this._RELOAD_REQUIRED[key] ? window.location.reload() : null,
			},
		);
		return keyProc;
	}

	// //////////////////////////////////////////////////////////////////////////////////////////////////////////////////

	static _RELOAD_REQUIRED = {};

	/**
	 * Note: this should be called on every client, as when the setting is not registered for e.g. a user, errors will
	 *   be thrown when another user updates the value.
	 */
	static setReloadRequiredWorld (key, val = true) {
		this._registerWorld(key);
		this._RELOAD_REQUIRED[key] = !!val;
	}

	// //////////////////////////////////////////////////////////////////////////////////////////////////////////////////

	static registerClient (key) { this._registerClient(key); }

	static getClient (key) {
		const fullKey = this._registerClient(key);
		return (UtilGameSettings.getSafe(SharedConsts.MODULE_NAME, fullKey) || {})._;
	}

	static async pGetClient (key) {
		return this.getClient(key);
	}

	static async pSetClient (key, value) {
		const fullKey = this._registerClient(key);
		await game.settings.set(SharedConsts.MODULE_NAME, fullKey, {_: value});
	}

	static async pRemoveClient (key) {
		return this.pSetClient(key, undefined);
	}

	// //////////////////////////////////////////////////////////////////////////////////////////////////////////////////

	static registerWorld (key) { this._registerWorld(key); }

	static getWorld (key) {
		const fullKey = this._registerWorld(key);
		return (UtilGameSettings.getSafe(SharedConsts.MODULE_NAME, fullKey) || {})._;
	}

	static async pGetWorld (key) {
		return this.getWorld(key);
	}

	static async pSetWorld (key, value) {
		const fullKey = this._registerWorld(key);
		await game.settings.set(SharedConsts.MODULE_NAME, fullKey, {_: value});
	}

	static async pRemoveWorld (key) {
		return this.pSetWorld(key, undefined);
	}

	// //////////////////////////////////////////////////////////////////////////////////////////////////////////////////

	static getClientThenWorld (key) {
		const outClient = this.getClient(key);
		if (outClient !== undefined) return outClient;
		return this.getWorld(key);
	}

	static async pGetClientThenWorld (key) {
		return this.getClientThenWorld(key);
	}

	static async pSetWorldThenClient (key, value) {
		if (game.user.isGM) return this.pSetWorld(key, value);

		// Avoid "clobbering" world-level retrieval as a client
		const existing = await this.pGetClientThenWorld(key);
		if (CollectionUtil.deepEquals(value, existing)) return;

		return this.pSetClient(key, value);
	}
}

export {GameStorage};
