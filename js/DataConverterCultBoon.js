import {UtilApplications} from "./UtilApplications.js";
import {SharedConsts} from "../shared/SharedConsts.js";
import {Config} from "./Config.js";
import {DataConverter} from "./DataConverter.js";
import {Vetools} from "./Vetools.js";
import {UtilDataConverter} from "./UtilDataConverter.js";
import {UtilActiveEffects} from "./UtilActiveEffects.js";

class DataConverterCultBoon extends DataConverter {
	static _getSideLoadOpts (ent) {
		return {
			propBrew: ent.__prop === "cult" ? "foundryCult" : "foundryBoon",
			fnLoadJson: Vetools.pGetCultBoonSideData,
			propJson: ent.__prop,
		};
	}

	static _IMG_FALLBACK = `modules/${SharedConsts.MODULE_NAME}/media/icon/diablo-skull.svg`;

	/**
	 * @param ent
	 * @param [opts] Options object.
	 * @param [opts.isAddPermission]
	 * @param [opts.defaultPermission]
	 * @param [opts.isActorItem]
	 */
	static async pGetCultBoonItem (ent, opts) {
		opts = opts || {};

		const content = Config.get("importCultBoon", "isImportDescription")
			? await UtilDataConverter.pGetWithDescriptionPlugins(() => `<div>${Renderer.get().setFirstSection(true).render({entries: ent.entries}, 2)}</div>`)
			: "";

		const img = await this._pGetSaveImagePath(ent);

		const additionalData = await this._pGetDataSideLoaded(ent);
		const additionalFlags = await this._pGetFlagsSideLoaded(ent);

		const effectsSideTuples = await this._pGetEffectsSideLoadedTuples({ent, img});
		effectsSideTuples.forEach(({effect, effectRaw}) => DataConverter.mutEffectDisabledTransfer(effect, "importCultBoon", UtilActiveEffects.getDisabledTransferHintsSideData(effectRaw)));

		const out = {
			name: UtilApplications.getCleanEntityName(UtilDataConverter.getNameWithSourcePart(ent, {isActorItem: opts.isActorItem})),
			data: {
				source: UtilDataConverter.getSourceWithPagePart(ent),
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
					page: UrlUtil.PG_CULTS_BOONS,
					source: ent.source,
					hash: UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_CULTS_BOONS](ent),
					propDroppable: ent.__prop,
				},
				...additionalFlags,
			},
			effects: effectsSideTuples.map(it => it.effect),
		};

		if (opts.defaultPermission != null) out.permission = {default: opts.defaultPermission};
		else if (opts.isAddPermission) out.permission = {default: Config.get("importCultBoon", "permissions")};

		return out;
	}
}

export {DataConverterCultBoon};
