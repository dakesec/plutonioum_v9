import {UtilApplications} from "./UtilApplications.js";
import {SharedConsts} from "../shared/SharedConsts.js";
import {Config} from "./Config.js";
import {DataConverter} from "./DataConverter.js";
import {Vetools} from "./Vetools.js";
import {UtilDataConverter} from "./UtilDataConverter.js";
import {UtilActiveEffects} from "./UtilActiveEffects.js";

class DataConverterConditionDisease extends DataConverter {
	static _getSideLoadOpts (conDis) {
		return {
			propBrew: conDis.__prop === "disease" ? "foundryDisease" : "foundryCondition",
			fnLoadJson: Vetools.pGetConditionDiseaseSideData,
			propJson: conDis.__prop,
		};
	}

	/**
	 * @param conDis
	 * @param [opts] Options object.
	 * @param [opts.isAddPermission]
	 * @param [opts.defaultPermission]
	 * @param [opts.isActorItem]
	 */
	static async pGetConditionDiseaseItem (conDis, opts) {
		opts = opts || {};

		const content = Config.get("importConditionDisease", "isImportDescription")
			? await UtilDataConverter.pGetWithDescriptionPlugins(() => `<div>${Renderer.get().setFirstSection(true).render({entries: conDis.entries}, 2)}</div>`)
			: "";

		const img = await this._pGetSaveImagePath(conDis);

		const additionalData = await this._pGetDataSideLoaded(conDis);
		const additionalFlags = await this._pGetFlagsSideLoaded(conDis);

		const effectsSideTuples = await this._pGetEffectsSideLoadedTuples({ent: conDis, img});
		effectsSideTuples.forEach(({effect, effectRaw}) => DataConverter.mutEffectDisabledTransfer(effect, "importConditionDisease", UtilActiveEffects.getDisabledTransferHintsSideData(effectRaw)));

		const out = {
			name: UtilApplications.getCleanEntityName(UtilDataConverter.getNameWithSourcePart(conDis, {isActorItem: opts.isActorItem})),
			data: {
				source: UtilDataConverter.getSourceWithPagePart(conDis),
				description: {
					value: content,
					chat: "",
					unidentified: "",
				},

				activation: {type: "", cost: 0, condition: ""},
				duration: {value: 0, units: ""},
				target: {value: 0, units: "", type: ""},
				range: {value: 0, long: 0, units: null},
				uses: {value: 0, max: 0, per: ""},
				ability: "",
				actionType: "",
				attackBonus: null,
				chatFlavor: "",
				critical: {threshold: null, damage: ""},
				damage: {parts: [], versatile: ""},
				formula: "",
				save: {ability: "", dc: null},
				requirements: "",
				recharge: {value: 0, charged: true},

				...additionalData,
			},
			permission: {default: 0},
			type: "feat",
			img,
			flags: {
				[SharedConsts.MODULE_NAME_FAKE]: {
					page: UrlUtil.PG_CONDITIONS_DISEASES,
					source: conDis.source,
					hash: UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_CONDITIONS_DISEASES](conDis),
					propDroppable: conDis.__prop,
				},
				...additionalFlags,
			},
			effects: effectsSideTuples.map(it => it.effect),
		};

		if (opts.defaultPermission != null) out.permission = {default: opts.defaultPermission};
		else if (opts.isAddPermission) out.permission = {default: Config.get("importConditionDisease", "permissions")};

		return out;
	}

	static _getImgFallback (conDis) {
		return `modules/${SharedConsts.MODULE_NAME}/media/icon/${conDis.__prop === "disease" ? "parmecia.svg" : "knockout.svg"}`;
	}
}

export {DataConverterConditionDisease};
