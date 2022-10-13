import {SharedConsts} from "../shared/SharedConsts.js";

class UtilLibWrapper {
	static LIBWRAPPER_MODE_WRAPPER = "WRAPPER";
	static LIBWRAPPER_MODE_MIXED = "MIXED";
	static LIBWRAPPER_MODE_OVERRIDE = "OVERRIDE";

	static _PATCHES = {};

	static addPatch (target, fn, mode) {
		return this.togglePatch(target, fn, mode, true);
	}

	static togglePatch (target, fn, mode, isActive) {
		if (!isActive) {
			if (!this._PATCHES[target]) return;
			libWrapper.unregister(SharedConsts.MODULE_NAME, target, false);

			delete this._PATCHES[target];
			return;
		}

		if (this._PATCHES[target]) return;

		this._PATCHES[target] = true;
		libWrapper.register(SharedConsts.MODULE_NAME, target, fn, mode);
	}
}

export {
	UtilLibWrapper,
};
