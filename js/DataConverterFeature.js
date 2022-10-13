import {SharedConsts} from "../shared/SharedConsts.js";
import {Config} from "./Config.js";
import {UtilDataConverter} from "./UtilDataConverter.js";
import {DataConverter} from "./DataConverter.js";

class DataConverterFeature extends DataConverter {
	static _IMG_FALLBACK = `modules/${SharedConsts.MODULE_NAME}/media/icon/mighty-force.svg`;

	static async pPreloadSideData () {
		this._SIDE_DATA = await this._pGetPreloadSideData();
		return this._SIDE_DATA;
	}

	static async _pGetPreloadSideData () { throw new Error("Unimplemented!"); }

	static _pGetGenericDescription (ent, configGroup) {
		return Config.get(configGroup, "isImportDescription")
			? UtilDataConverter.pGetWithDescriptionPlugins(() => `<div>${Renderer.get().setFirstSection(true).render({entries: ent.entries}, 2)}</div>`)
			: "";
	}

	static _getData_getConsume ({ent, actor}) {
		if (!ent?.consumes) return {};

		const sheetItem = DataConverter.getConsumedSheetItem({consumes: ent.consumes, actor});
		if (!sheetItem) return {};

		return {
			type: "charges",
			amount: ent.consumes.amount ?? 1,
			target: sheetItem.id,
		};
	}

	static async pGetSideLoadedMatch (ent, {propOpts = "_SIDE_LOAD_OPTS"} = {}) {
		return this._pGetSideLoadedMatch(ent, this._getSideLoadOpts(ent) || this[propOpts]);
	}
}
DataConverterFeature._SIDE_DATA = null;

export {DataConverterFeature};
