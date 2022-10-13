import {SharedConsts} from "../shared/SharedConsts.js";
import {DataConverterActor} from "./DataConverterActor.js";

// TODO add `importCreatureFeature` `ConfigConsts`
class DataConverterCreatureFeature extends DataConverterActor {
	// TODO base on __prop
	static _SIDE_LOAD_OPTS = {
		propBrew: "TODO",
		fnLoadJson: async () => this._pGetPreloadSideData(),
		propJson: "TODO",
		propsMatch: ["monsterSource", "monsterName", "source", "name"],
	};

	static _IMG_FALLBACK = `modules/${SharedConsts.MODULE_NAME}/media/icon/mighty-force.svg`;

	static getFauxCreatureFeature (mon, entry, prop) {
		const out = {
			source: entry.source || mon.source,
			monsterName: mon.name,
			monsterSource: mon.source,
			srd: !!mon.srd,
			basicRules: !!mon.basicRules,
			page: entry.page ?? mon.page,
			...MiscUtil.copy(entry),
			_monsterParsedCr: mon._pCr,
			_monsterFilterCr: mon._fCr,
			__prop: prop,
		};

		if (out.name) out.name = Renderer.stripTags(out.name);

		return out;
	}

	/**
	 * @param ent
	 * @param [opts] Options object.
	 * @param [opts.isAddPermission]
	 * @param [opts.defaultPermission]
	 * @param [opts.isActorItem]
	 */
	static async pGetCreatureFeatureItem (ent, opts) {
		return {name: ent.name, type: "feat", data: {description: {value: "Unimplemented"}}};
	}
}

export {DataConverterCreatureFeature};
