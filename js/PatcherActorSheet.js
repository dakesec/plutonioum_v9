import {UtilLibWrapper} from "./PatcherLibWrapper.js";
import {ImportList} from "./ImportList.js";
import {LootGeneratorApp} from "./LootGeneratorApp.js";

class Patcher_ActorSheet {
	static init () {
		// region libWrapper doesn't support one module patching the same method multiple times, so register one fat
		//   handler here.
		UtilLibWrapper.addPatch(
			"ActorSheet.prototype._onDrop",
			this._lw_ActorSheet_prototype__onDrop,
			UtilLibWrapper.LIBWRAPPER_MODE_MIXED,
		);
		// endregion
	}

	static async _lw_ActorSheet_prototype__onDrop (fn, ...args) {
		const fnsSub = [
			ImportList.patcher_pHandleActorDrop,
			LootGeneratorApp.patcher_pHandleActorDrop,
		];
		for (const fn of fnsSub) {
			const out = await fn.bind(this)(...args);
			if (out) return out; // If we handled the event, block the base handler
		}
		return fn(...args);
	}
}

export {Patcher_ActorSheet};
