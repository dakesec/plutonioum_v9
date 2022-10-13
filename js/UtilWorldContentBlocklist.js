import {SharedConsts} from "../shared/SharedConsts.js";
import {UtilGameSettings} from "./UtilGameSettings.js";

class UtilWorldContentBlocklist {
	static _SETTINGS_KEY = "blacklist";

	static async pInit () {
		await game.settings.register(
			SharedConsts.MODULE_NAME,
			this._SETTINGS_KEY,
			{
				name: "World Content Blocklist",
				default: [],
				type: Array,
				scope: "world",
				onChange: data => {
					// No-op
				},
			},
		);

		// region Patch `ExcludeUtil`
		ExcludeUtil._pSave = async () => {
			await game.settings.set(SharedConsts.MODULE_NAME, this._SETTINGS_KEY, MiscUtil.copy(ExcludeUtil._excludes));
		};

		ExcludeUtil.pInitialise = async () => {
			ExcludeUtil.pSave = MiscUtil.throttle(ExcludeUtil._pSave, 50);
			ExcludeUtil._excludes = UtilGameSettings.getSafe(SharedConsts.MODULE_NAME, this._SETTINGS_KEY) || [];
			ExcludeUtil.isInitialised = true;
		};
		// endregion

		await ExcludeUtil.pInitialise();
	}

	static async pSaveState (saveableState, {message = "Saved!"} = {}) {
		await ExcludeUtil.pSetList(saveableState);
		await game.settings.set(SharedConsts.MODULE_NAME, this._SETTINGS_KEY, saveableState);
		ui.notifications.info(`${message} Note that you (and connected players) may need to reload for any changes to take effect.`);
	}
}

export {UtilWorldContentBlocklist};
