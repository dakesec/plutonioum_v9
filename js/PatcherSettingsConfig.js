import {Config} from "./Config.js";
import {UtilPatcher} from "./UtilPatch.js";
import {SharedConsts} from "../shared/SharedConsts.js";

class Patcher_SettingsConfig {
	static init () {
		Hooks.on("renderSettingsConfig", (app, $html) => {
			if (!Config.get("ui", "isStreamerMode")) return;

			const elesHeaders = $html.find(`.module-header`).get();
			for (const eleHeader of elesHeaders) {
				const toReplace = UtilPatcher.findPlutoniumTextNodes(eleHeader);
				toReplace.forEach(node => node.data = node.data.replace(SharedConsts.MODULE_TITLE, SharedConsts.MODULE_TITLE_FAKE));
			}
		});
	}
}

export {Patcher_SettingsConfig};
