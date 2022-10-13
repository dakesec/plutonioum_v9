import {UtilLibWrapper} from "./PatcherLibWrapper.js";
import {Config} from "./Config.js";
import {LGT} from "./Util.js";
import {UtilNotifications} from "./UtilNotifications.js";

class Patcher_Notifications {
	static _MARKER = "__PLUT_REPLACE_MARKER__";
	static _CACHE_STRING_START = null;
	static _CACHE_STRING_END = null;

	static init () {
		UtilLibWrapper.addPatch(
			"ui.notifications.notify",
			this._lw_ui_notifications_notify,
			UtilLibWrapper.LIBWRAPPER_MODE_MIXED,
		);

		const sampleMessage = game.i18n.format("DICE.WarnMissingData", {match: Patcher_Notifications._MARKER});
		const [start, end] = sampleMessage.split(Patcher_Notifications._MARKER);
		Patcher_Notifications._CACHE_STRING_START = start;
		Patcher_Notifications._CACHE_STRING_END = end;
	}

	static _lw_ui_notifications_notify (fn, ...args) {
		if (!Config.get("ui", "isSuppressMissingRollDataNotifications")) return fn(...args);

		if (!Patcher_Notifications._isSuppressed(...args)) return fn(...args);

		const [message] = args;
		if (!UtilNotifications.isAddSeen({message})) console.warn(...LGT, message);
	}

	static _isSuppressed (message, type) {
		if (type !== "warning") return false;
		if (typeof message !== "string") return false;
		if (!message.startsWith(Patcher_Notifications._CACHE_STRING_START) || !message.endsWith(Patcher_Notifications._CACHE_STRING_END)) return false;
		return true;
	}
}

export {Patcher_Notifications};
