import {UtilApplications} from "./UtilApplications.js";
import {SharedConsts} from "../shared/SharedConsts.js";
import {Config} from "./Config.js";
import {Vetools} from "./Vetools.js";
import {UtilCompendium} from "./UtilCompendium.js";
import {UtilActiveEffects} from "./UtilActiveEffects.js";
import {DataConverterFeature} from "./DataConverterFeature.js";
import {PageFilterClassesFoundry} from "./UtilCharactermancerClass.js";
import {UtilDataConverter} from "./UtilDataConverter.js";
import {DataConverter} from "./DataConverter.js";
import {Charactermancer_Feature_Util} from "./UtilCharactermancerFeature.js";

class DataConverterOptionalfeature extends DataConverterFeature {
	static _SIDE_LOAD_OPTS = {
		propBrew: "foundryOptionalfeature",
		fnLoadJson: async () => this._pGetPreloadSideData(),
		propJson: "optionalfeature",
	};

	static _IMG_FALLBACK = `modules/${SharedConsts.MODULE_NAME}/media/icon/skills.svg`;

	static init () {
		PageFilterClassesFoundry.setImplSideData("optionalfeature", this);
	}

	static async pGetDereferencedOptionalFeatureFeatureItem (feature) {
		// Bypass the loader, since we don't expect refs in optional features (yet)
		if (feature.entries) return MiscUtil.copy(feature);

		const hash = UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_OPT_FEATURES](feature);
		return Renderer.hover.pCacheAndGet(UrlUtil.PG_OPT_FEATURES, feature.source, hash, {isCopy: true});
	}

	static async pGetInitOptionalFeatureFeatureLoadeds (feature, {actor = null} = {}) {
		const uid = DataUtil.proxy.getUid("optionalfeature", feature, {isMaintainCase: true});
		const asFeatRef = {optionalfeature: uid};
		// Note that passing `raw` here is required, as we will have already modified the optionalfeature data in order to add
		//   "optionalfeatureProgression" entries.
		await PageFilterClassesFoundry.pInitOptionalFeatureLoadeds({optionalfeature: asFeatRef, raw: feature, actor});
		return asFeatRef;
	}

	/**
	 * @param optFeature
	 * @param [opts] Options object.
	 * @param [opts.isAddPermission]
	 * @param [opts.defaultPermission]
	 * @param [opts.isActorItem]
	 * @param [opts.actor]
	 */
	static async pGetOptionalFeatureItem (optFeature, opts) {
		opts = opts || {};
		if (opts.actor) opts.isActorItem = true;

		const cpyOptFeature = Charactermancer_Feature_Util.getCleanedFeature_tmpOptionalfeatureList(optFeature);

		let pOut;
		if (await this._pIsInSrd(cpyOptFeature, opts)) {
			pOut = this._pGetOptionalFeatureItem_fromSrd(cpyOptFeature, opts);
		} else {
			pOut = this._pGetOptionalFeatureItem_other(cpyOptFeature, opts);
		}
		return pOut;
	}

	static async _pIsInSrd (optFeature) {
		const srdData = await UtilCompendium.getSrdCompendiumEntity("optionalfeature", optFeature, {fnGetAliases: this._getCompendiumAliases});
		return !!srdData;
	}

	static async _pGetOptionalFeatureItem_fromSrd (optFeature, opts) {
		const srdData = await UtilCompendium.getSrdCompendiumEntity("optionalfeature", optFeature, {fnGetAliases: this._getCompendiumAliases});

		const descriptionValue = await this._pGetDescriptionValue(optFeature);
		const dataConsume = this._getData_getConsume({ent: optFeature, actor: opts.actor});

		// Ensure the resource consumption section is displayed, if required
		const activationType = dataConsume?.type && !srdData.data?.activation?.type ? "special" : srdData.data?.activation?.type;

		const additionalData = await this._pGetDataSideLoaded(optFeature);
		const additionalFlags = await this._pGetFlagsSideLoaded(optFeature);

		const effects = [
			...MiscUtil.copy(srdData.effects || []),
		];
		DataConverter.mutEffectsDisabledTransfer(effects, "importOptionalFeature");

		// For actor items, let the importer create the effects, so we can pass in additional flow data/etc.
		const effectsSideTuples = opts.isActorItem ? [] : (await this._pGetEffectsSideLoadedTuples({ent: optFeature, img: srdData.img}) || []);
		effectsSideTuples.forEach(({effect, effectRaw}) => DataConverter.mutEffectDisabledTransfer(effect, "importOptionalFeature", UtilActiveEffects.getDisabledTransferHintsSideData(effectRaw)));

		const out = {
			name: UtilApplications.getCleanEntityName(UtilDataConverter.getNameWithSourcePart(optFeature, {isActorItem: opts.isActorItem})),
			type: srdData.type,
			data: {
				...srdData.data,

				activation: {type: activationType},

				source: UtilDataConverter.getSourceWithPagePart(optFeature),
				description: {value: descriptionValue, chat: "", unidentified: ""},
				requirements: this._getRequirementsString(optFeature),
				consume: dataConsume,

				...additionalData,
			},
			permission: {default: 0},
			img: await this._pGetSaveImagePath(optFeature, {propCompendium: "optionalfeature"}),
			flags: {
				...this._getOptionalFeatureFlags(optFeature, opts),
				...additionalFlags,
			},
			effects: [
				...effects,
				...effectsSideTuples.map(it => it.effect),
			],
		};

		if (opts.defaultPermission != null) out.permission = {default: opts.defaultPermission};
		else if (opts.isAddPermission) out.permission = {default: Config.get("importOptionalFeature", "permissions")};

		return out;
	}

	static async _pGetOptionalFeatureItem_other (optFeature, opts) {
		const descriptionValue = await this._pGetDescriptionValue(optFeature);
		const dataConsume = this._getData_getConsume({ent: optFeature, actor: opts.actor});

		const img = await this._pGetSaveImagePath(optFeature, {propCompendium: "optionalfeature"});

		const additionalData = await this._pGetDataSideLoaded(optFeature);
		const additionalFlags = await this._pGetFlagsSideLoaded(optFeature);

		// For actor items, let the importer create the effects, so we can pass in additional flow data/etc.
		const effectsSideTuples = opts.isActorItem ? [] : await this._pGetEffectsSideLoadedTuples({ent: optFeature, img});
		effectsSideTuples.forEach(({effect, effectRaw}) => DataConverter.mutEffectDisabledTransfer(effect, "importOptionalFeature", UtilActiveEffects.getDisabledTransferHintsSideData(effectRaw)));

		const out = {
			name: UtilApplications.getCleanEntityName(UtilDataConverter.getNameWithSourcePart(optFeature, {isActorItem: opts.isActorItem})),
			data: {
				source: UtilDataConverter.getSourceWithPagePart(optFeature),
				description: {value: descriptionValue, chat: "", unidentified: ""},

				activation: {type: dataConsume?.type ? "special" : "", cost: null, condition: ""},
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
				requirements: this._getRequirementsString(optFeature),
				consume: dataConsume,
				recharge: {value: 0, charged: true},

				...additionalData,
			},
			permission: {default: 0},
			type: "feat",
			img,
			flags: {
				...this._getOptionalFeatureFlags(optFeature, opts),
				...additionalFlags,
			},
			// For actor items, let the importer create the effects, so we can pass in additional flow data/etc.
			effects: effectsSideTuples.map(it => it.effect),
		};

		if (opts.defaultPermission != null) out.permission = {default: opts.defaultPermission};
		else if (opts.isAddPermission) out.permission = {default: Config.get("importOptionalFeature", "permissions")};

		return out;
	}

	static _pGetDescriptionValue (optFeature) {
		if (!Config.get("importOptionalFeature", "isImportDescription")) return "";

		return UtilDataConverter.pGetWithDescriptionPlugins(() => {
			const prerequisite = Renderer.utils.getPrerequisiteHtml(optFeature.prerequisite);
			return `<div>
				${prerequisite ? `<p><i>${prerequisite}</i></p>` : ""}
				${Renderer.get().setFirstSection(true).render({entries: optFeature.entries}, 2)}
			</div>`;
		});
	}

	static _getRequirementsString (optFeature) {
		return optFeature._foundryData?.requirements // This is passed in by the class importer
			|| Renderer.utils.getPrerequisiteHtml(optFeature.prerequisite, {isTextOnly: true, isSkipPrefix: true});
	}

	static _getOptionalFeatureFlags (optFeature, opts) {
		opts = opts || {};

		const out = {
			[SharedConsts.MODULE_NAME_FAKE]: {
				page: UrlUtil.PG_OPT_FEATURES,
				source: optFeature.source,
				hash: UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_OPT_FEATURES](optFeature),
			},
		};

		if (opts.isAddDataFlags) {
			out[SharedConsts.MODULE_NAME_FAKE].propDroppable = "optionalfeature";
			out[SharedConsts.MODULE_NAME_FAKE].filterValues = opts.filterValues;
		}

		return out;
	}

	static async pMutActorUpdateOptionalFeature (actor, actorUpdate, optFeature, dataBuilderOpts) {
		const sideData = await this.pGetSideLoadedMatch(optFeature);
		this.mutActorUpdate(actor, actorUpdate, optFeature, {sideData});
	}

	static async _pGetPreloadSideData () {
		if (!this._SIDE_DATA) this._SIDE_DATA = await Vetools.pGetOptionalFeatureSideData();
		return this._SIDE_DATA;
	}

	static async pHasOptionalFeatureSideLoadedEffects (actor, optFeature) {
		return (await this._pGetEffectsRawSideLoaded_(optFeature, this._SIDE_LOAD_OPTS))?.length > 0;
	}

	static async pGetOptionalFeatureItemEffectTuples (actor, optFeature, sheetItem, {additionalData, img} = {}) {
		const effectsRaw = await this._pGetEffectsRawSideLoaded_(optFeature, this._SIDE_LOAD_OPTS);
		return UtilActiveEffects.getExpandedEffects(effectsRaw || [], {actor, sheetItem, parentName: optFeature.name, additionalData, img}, {isTuples: true});
	}

	static _getCompendiumAliases (entity) {
		if (!entity.name || !entity.srd) return [];

		const out = [];

		for (const [featureTypeSet, fnGetName] of DataConverterOptionalfeature._FEATURE_TYPES.entries()) {
			if (entity.featureType.some(it => featureTypeSet.has(it))) out.push(fnGetName(entity));
		}

		return out;
	}
}

DataConverterOptionalfeature._FEATURE_TYPES = new Map();
DataConverterOptionalfeature._FEATURE_TYPES.set(new Set(["EI"]), entity => `Invocation: ${entity.name}`);
DataConverterOptionalfeature._FEATURE_TYPES.set(new Set(["MM"]), entity => `Metamagic: ${entity.name}`);
DataConverterOptionalfeature._FEATURE_TYPES.set(new Set(["FS:F", "FS:B", "FS:P", "FS:R"]), entity => `Fighting Style: ${entity.name}`);

export {DataConverterOptionalfeature};
