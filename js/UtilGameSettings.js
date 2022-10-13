import {SharedConsts} from "../shared/SharedConsts.js";

class UtilGameSettings {
	static prePreInit () {
		game.settings.register(SharedConsts.MODULE_NAME, "isDbgMode", {
			name: `Debug Mode`,
			hint: `Enable additional developer-only debugging functionality. Not recommended, as it may reduce stability.`,
			default: false,
			type: Boolean,
			scope: "world",
			config: true,
		});
	}

	static isDbg () { return !!this.getSafe(SharedConsts.MODULE_NAME, "isDbgMode"); }

	static getSafe (module, key) {
		try {
			return game.settings.get(module, key);
		} catch (e) {
			return null;
		}
	}
}

export {UtilGameSettings};
