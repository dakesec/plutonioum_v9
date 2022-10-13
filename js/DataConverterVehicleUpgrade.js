import {UtilApplications} from "./UtilApplications.js";
import {SharedConsts} from "../shared/SharedConsts.js";
import {Config} from "./Config.js";
import {DataConverter} from "./DataConverter.js";
import {Vetools} from "./Vetools.js";
import {UtilActiveEffects} from "./UtilActiveEffects.js";
import {UtilDataConverter} from "./UtilDataConverter.js";
import {PageFilterClassesFoundry} from "./UtilCharactermancerClass.js";
import {DataConverterFeature} from "./DataConverterFeature.js";

class DataConverterVehicleUpgrade extends DataConverterFeature {
	static _SIDE_LOAD_OPTS = {
		propBrew: "foundryVehicleUpgrade",
		fnLoadJson: async () => this._pGetPreloadSideData(),
		propJson: "vehicleUpgrade",
	};

	static _IMG_FALLBACK = `modules/${SharedConsts.MODULE_NAME}/media/icon/gears.svg`;

	static init () {
		PageFilterClassesFoundry.setImplSideData("reward", this);
	}

	static async pGetDereferencedVehicleUpgradeFeatureItem (feature) {
		// Bypass the loader, since we don't expect refs in vehicle upgrades (yet)
		if (feature.entries) return MiscUtil.copy(feature);

		const hash = UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_VEHICLES](feature);
		return Renderer.hover.pCacheAndGet(UrlUtil.PG_VEHICLES, feature.source, hash, {isCopy: true});
	}

	static async pGetInitVehicleUpgradeFeatureLoadeds (feature, {actor = null} = {}) {
		const asFeatRef = {vehicleUpgrade: `${feature.name}|${feature.source}`};
		// Bypass the loader, since we don't expect refs in rewards (yet)
		await PageFilterClassesFoundry.pInitVehicleUpgradeLoadeds({vehicleUpgrade: asFeatRef, raw: feature, actor});
		return asFeatRef;
	}

	/**
	 * @param vehUpgrade
	 * @param [opts] Options object.
	 * @param [opts.isAddPermission]
	 * @param [opts.defaultPermission]
	 * @param [opts.isActorItem]
	 * @param [opts.actor]
	 */
	static async pGetVehicleUpgradeItem (vehUpgrade, opts) {
		opts = opts || {};
		if (opts.actor) opts.isActorItem = true;
		return this._pGetVehicleUpgradeItem_other(vehUpgrade, opts);
	}

	static async _pGetVehicleUpgradeItem_other (vehUpgrade, opts) {
		const descriptionValue = await this._pGetDescriptionValue(vehUpgrade);

		const tempAdditionalData = vehUpgrade._foundryData || {};
		const additionalData = await this._pGetDataSideLoaded(vehUpgrade);
		const additionalFlags = await this._pGetFlagsSideLoaded(vehUpgrade);
		const img = await this._pGetSaveImagePath(vehUpgrade);
		const effects = (await this._pGetVehicleUpgradeEffects(vehUpgrade, img, opts)) || [];

		const out = {
			name: UtilApplications.getCleanEntityName(UtilDataConverter.getNameWithSourcePart(vehUpgrade, {isActorItem: opts.isActorItem})),
			data: {
				source: UtilDataConverter.getSourceWithPagePart(vehUpgrade),
				description: {value: descriptionValue, chat: "", unidentified: ""},

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
				requirements: tempAdditionalData.requirements || "",
				recharge: {value: 0, charged: true},

				...additionalData,
			},
			permission: {default: 0},
			type: "feat",
			img,
			flags: {
				...this._getVehicleUpgradeFlags(vehUpgrade, opts),
				...additionalFlags,
			},
			effects,
		};

		if (opts.defaultPermission != null) out.permission = {default: opts.defaultPermission};
		else if (opts.isAddPermission) out.permission = {default: Config.get("importVehicleUpgrade", "permissions")};

		return out;
	}

	static _pGetDescriptionValue (vehUpgrade) {
		if (!Config.get("importVehicleUpgrade", "isImportDescription")) return "";

		return UtilDataConverter.pGetWithDescriptionPlugins(() => {
			return `<div>
				<p><i>${Renderer.vehicle.getUpgradeSummary(vehUpgrade)}</i></div></p>
				${Renderer.get().setFirstSection(true).render({entries: vehUpgrade.entries}, 1)}
			</div>`;
		});
	}

	static async pMutActorUpdateVehicleUpgrade (actor, actorUpdate, optFeature, dataBuilderOpts) {
		const sideData = await this.pGetSideLoadedMatch(optFeature);
		this.mutActorUpdate(actor, actorUpdate, optFeature, {sideData});
	}

	static _getVehicleUpgradeFlags (vehUpgrade, opts) {
		opts = opts || {};

		const out = {
			[SharedConsts.MODULE_NAME_FAKE]: {
				page: UrlUtil.PG_VEHICLES,
				source: vehUpgrade.source,
				hash: UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_VEHICLES](vehUpgrade),
			},
		};

		if (opts.isAddDataFlags) {
			out[SharedConsts.MODULE_NAME_FAKE].propDroppable = "vehicleUpgrade";
			out[SharedConsts.MODULE_NAME_FAKE].filterValues = opts.filterValues;
		}

		return out;
	}

	static async _pGetVehicleUpgradeEffects (vehUpgrade, img, {isActorItem} = {}) {
		if (isActorItem) return []; // For actor items, the effects are handled at the importer level
		if (await this.pHasVehicleUpgradeSideLoadedEffects(null, vehUpgrade)) return this.pGetVehicleUpgradeItemEffectTuples(null, vehUpgrade, null, {img});
		return [];
	}

	static async pHasVehicleUpgradeSideLoadedEffects (actor, vehUpgrade) {
		return (await DataConverter._pGetEffectsRawSideLoaded_(vehUpgrade, this._SIDE_LOAD_OPTS))?.length > 0;
	}

	static async pGetVehicleUpgradeItemEffectTuples (actor, vehUpgrade, sheetItem, {additionalData, img} = {}) {
		const effectsRaw = await DataConverter._pGetEffectsRawSideLoaded_(vehUpgrade, this._SIDE_LOAD_OPTS);
		return UtilActiveEffects.getExpandedEffects(effectsRaw || [], {actor, sheetItem, parentName: vehUpgrade.name, additionalData, img}, {isTuples: true});
	}

	static async _pGetPreloadSideData () {
		if (!this._SIDE_DATA) this._SIDE_DATA = await Vetools.pGetVehicleUpgradeSideData();
		return this._SIDE_DATA;
	}
}

export {DataConverterVehicleUpgrade};
